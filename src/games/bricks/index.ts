/**
 * Bricks (Tawamurenga) — native TS port of `puzzles/unreleased/bricks.c`.
 * Shade cells in a hexagonal grid so that every shaded cell is supported by a
 * shaded cell below it, no three shade in a horizontal line, and each clue
 * equals its count of shaded neighbors.
 *
 * Input: left-click/drag cycles a cell shade→unshade→empty (right-click the
 * reverse) and paints the whole drag with the first cell's target color; a
 * hex-aware keyboard cursor moves with the arrow/numpad keys (up/down alternate
 * orthogonal and diagonal steps across the shear) and places colors with
 * Enter/Space/0/1/2/Backspace. Rule violations show live while dragging;
 * Check & Save (`findMistakes`) hard-blocks on any current violation.
 */

import { assertNever } from "../../engine/assert-never.ts";
import type { DifficultyContract } from "../../engine/difficulty.ts";
import { winFlash } from "../../engine/flash.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import {
  ALREADY_SOLVED,
  CONTRADICTION_UNLOCALIZED,
  DEDUCTION_EXHAUSTED,
  FIX_MISTAKES_FIRST,
  PUZZLE_NOT_REASONABLE,
} from "../../engine/hint-refusal.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  digitOf,
  isEraseKey,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_NUM_KEYPAD,
  MOD_SHFT,
  newCursor,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Color, ConfigValues, Point, Size } from "../../engine/types.ts";
import { newBricksDesc } from "./generator.ts";
import { say } from "./hint-text.ts";
import {
  type BricksDrawState,
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  offsets,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  type BricksReason,
  bricksValidate,
  deduceBricksPlan,
  findMistakes,
  solveGame,
} from "./solver.ts";
import {
  type BricksMistake,
  type BricksMove,
  type BricksParams,
  type BricksState,
  type BricksUi,
  bitsColor,
  type CellColor,
  COL_MASK,
  cloneState,
  colorBits,
  DIFF_TRICKY,
  decodeParams,
  defaultParams,
  encodeParams,
  F_BOUND,
  F_EMPTY,
  F_SHADE,
  F_UNSHADE,
  NUM_MASK,
  newState,
  paramConfig,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// Numpad-flagged keys (the web frontend sets MOD_NUM_KEYPAD for the numpad).
const NK = (ch: number): number => MOD_NUM_KEYPAD | ch;

function newUi(state: BricksState): BricksUi {
  // Cursor starts on the first non-bound cell (upstream new_ui).
  const s = state.w * state.h;
  let i = 0;
  while (i < s && state.grid[i] === F_BOUND) i++;
  return {
    cursor: newCursor(i % state.w, (i / state.w) | 0),
    dragtype: 0,
    drag: [],
  };
}

function interpretMove(
  state: BricksState,
  ui: BricksUi,
  ds: BricksDrawState,
  pt: Point,
  rawButton: number,
): BricksMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = (rawButton & MOD_SHFT) !== 0;
  const control = (rawButton & MOD_CTRL) !== 0;
  // Strip only Shift/Ctrl — MOD_NUM_KEYPAD is load-bearing for the diagonals.
  let button = rawButton & ~(MOD_SHFT | MOD_CTRL);
  const ts = ds.tilesize;

  // Numpad 8/2/4/6 are the orthogonal cursor moves.
  if (button === NK(56)) button = CURSOR_UP;
  else if (button === NK(50)) button = CURSOR_DOWN;
  else if (button === NK(52)) button = CURSOR_LEFT;
  else if (button === NK(54)) button = CURSOR_RIGHT;

  // Moving up/down across the shear alternates orthogonal and diagonal;
  // numpad 7/3 become straight up/down.
  if (button === CURSOR_UP && ui.cursor.y > 0 && (ui.cursor.y & 1) === 0)
    button = NK(57);
  else if (button === CURSOR_DOWN && ui.cursor.y < h - 1 && ui.cursor.y & 1)
    button = NK(49);
  else if (button === NK(55)) button = CURSOR_UP;
  else if (button === NK(51)) button = CURSOR_DOWN;

  let dx = 0;
  let dy = 0;
  if (button === CURSOR_UP) dy = -1;
  else if (button === CURSOR_DOWN) dy = 1;
  else if (button === CURSOR_LEFT) dx = -1;
  else if (button === CURSOR_RIGHT) dx = 1;
  else if (button === NK(55)) {
    dx = -1;
    dy = -1;
  } else if (button === NK(49)) {
    dx = -1;
    dy = 1;
  } else if (button === NK(57)) {
    dx = 1;
    dy = -1;
  } else if (button === NK(51)) {
    dx = 1;
    dy = 1;
  }

  if (dx || dy) {
    const hx = ui.cursor.x;
    const hy = ui.cursor.y;
    ui.cursor.visible = true;
    ui.cursor.x = Math.max(0, Math.min(ui.cursor.x + dx, w - 1));
    ui.cursor.y = Math.max(0, Math.min(ui.cursor.y + dy, h - 1));

    // Clamp into the hexagon's row bounds.
    const extra = (h | ui.cursor.y) & 1 ? 0 : 1;
    ui.cursor.x = Math.min(ui.cursor.x, w - ((ui.cursor.y / 2) | 0) - 1);
    ui.cursor.x = Math.max(ui.cursor.x, (((h - ui.cursor.y) / 2) | 0) - extra);

    if (shift || control) {
      const to = shift && control ? "empty" : control ? "shade" : "unshade";
      const i1 = hy * w + hx;
      const i2 = ui.cursor.y * w + ui.cursor.x;
      const isNoop = (i: number): boolean => {
        const c = grid[i] & COL_MASK;
        return (
          (to === "shade" && c === F_SHADE) ||
          (to === "unshade" && c === F_UNSHADE) ||
          (to === "empty" && c === F_EMPTY)
        );
      };
      const cells: { index: number; to: typeof to }[] = [];
      if (!isNoop(i1)) cells.push({ index: i1, to });
      if (i1 !== i2 && !isNoop(i2)) cells.push({ index: i2, to });
      if (cells.length > 0) return { kind: "paint", cells };
    }
    return UI_UPDATE;
  }

  // --- pointer: undo the shear, then floor to a cell -----------------------
  const { ox, oy } = offsets(h, ts);
  const py = pt.y - oy;
  const gy = py < 0 ? -1 : (py / ts) | 0;
  const px = pt.x - ox - gy * (ts >> 1);
  const gx = px < 0 ? -1 : (px / ts) | 0;

  let hx = ui.cursor.x;
  let hy = ui.cursor.y;

  if (isMouseDown(button)) {
    ui.dragtype = 0;
    ui.drag = [];
  }

  if (isMouseDown(button) || isMouseDrag(button)) {
    if (gx >= 0 && gx < w && gy >= 0 && gy < h) {
      hx = gx;
      hy = gy;
      ui.cursor.visible = false;
    } else {
      return null;
    }
  }

  if (isMouseDown(button)) {
    const i = hy * w + hx;
    const old = grid[i] & COL_MASK;
    if (button === LEFT_BUTTON)
      ui.dragtype = old === F_UNSHADE ? F_EMPTY : old === F_SHADE ? F_UNSHADE : F_SHADE;
    else if (button === RIGHT_BUTTON)
      ui.dragtype = old === F_UNSHADE ? F_SHADE : old === F_SHADE ? F_EMPTY : F_UNSHADE;
    else ui.dragtype = F_EMPTY;

    ui.drag = [];
    if (ui.dragtype || old) ui.drag.push(i);
    return UI_UPDATE;
  }

  if (isMouseDrag(button) && ui.dragtype) {
    const i = hy * w + hx;
    if (grid[i] === ui.dragtype) return null;
    if (ui.drag.includes(i)) return null;
    ui.drag.push(i);
    return UI_UPDATE;
  }

  if (isMouseRelease(button) && ui.drag.length > 0) {
    const to = bitsColor(ui.dragtype);
    const cells: { index: number; to: typeof to }[] = [];
    for (const j of ui.drag) {
      if (!(grid[j] & COL_MASK)) continue;
      cells.push({ index: j, to });
    }
    ui.drag = [];
    if (cells.length > 0) return { kind: "paint", cells };
    return UI_UPDATE;
  }

  // --- keyboard place-one at the cursor ------------------------------------
  // Numpad 1–4 and 6–9 were spent on movement above; any other digit key,
  // numpad or not, reads as its digit here.
  const digit = digitOf(button);
  if (
    ui.cursor.visible &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      isEraseKey(button) ||
      (digit !== null && digit <= 2))
  ) {
    const i = ui.cursor.y * w + ui.cursor.x;
    const old = grid[i] & COL_MASK;
    if (!old) return null; // a clue or bound cell — nothing to set

    let to: "shade" | "unshade" | "empty" = "empty";
    if (digit === 0 || digit === 2) to = "unshade";
    else if (digit === 1) to = "shade";
    else if (button === CURSOR_SELECT)
      to = old === F_EMPTY ? "shade" : old === F_SHADE ? "unshade" : "empty";
    else if (button === CURSOR_SELECT2)
      to = old === F_EMPTY ? "unshade" : old === F_UNSHADE ? "shade" : "empty";

    if (
      (old === F_SHADE && to === "shade") ||
      (old === F_UNSHADE && to === "unshade") ||
      (old === F_EMPTY && to === "empty")
    ) {
      return null; // don't put no-ops on the undo chain
    }
    return { kind: "paint", cells: [{ index: i, to }] };
  }

  return null;
}

function executeMove(state: BricksState, move: BricksMove): BricksState {
  const next = cloneState(state);
  const { w, h } = next;
  if (move.kind === "solve") {
    for (let i = 0; i < w * h; i++) {
      if (!(state.grid[i] & COL_MASK)) continue;
      next.grid[i] = colorBits(move.grid[i]);
    }
    next.cheated = true;
  } else if (move.kind === "paint") {
    for (const { index, to } of move.cells) {
      if (state.grid[index] & COL_MASK) next.grid[index] = colorBits(to);
    }
  } else {
    return assertNever(move, "bricks: executeMove");
  }
  if (bricksValidate(next.grid, w, h, false) === "complete") next.completed = true;
  return next;
}

function solve(orig: BricksState): SolveResult<BricksMove> {
  const { w, h } = orig;
  const grid = orig.grid.slice();
  solveGame(grid, w, h, DIFF_TRICKY, true, true);
  if (bricksValidate(grid, w, h, false) === "invalid")
    return { ok: false, error: "Puzzle is invalid." };
  const colors2 = Array.from({ length: w * h }, (_, i) => bitsColor(grid[i]));
  return { ok: true, move: { kind: "solve", grid: colors2 } };
}

// --- hint (a second projection of the contradiction solver) -----------------

/** Highlight data for a Bricks hint step: the forced cell (`target`, drawn
 * `COL_HINT`), the color it is forced to (`forced` — the narration says
 * which; the render never pre-places it), and the deduction's `evidence`
 * cells (ringed `COL_HINT_CELL`). All are padded-grid indices. */
export interface BricksHint {
  target: number;
  forced: CellColor;
  evidence: number[];
}

/** The evidence cells a reason reasons over (padded indices). */
function evidenceOf(reason: BricksReason): number[] {
  switch (reason.kind) {
    case "three":
      return reason.cells;
    case "unsupported":
      return reason.below;
    case "overcount":
    case "undercount":
      return [reason.clue];
    case "strandSupport":
      return [reason.above];
    case "localBreak":
      return reason.conflict;
  }
}

/** Narrate *why* the move is forced. **`evidence` is the cell set the frame
 * actually rings** (the reason's cells minus the target), not the raw reason,
 * so the sentence is written against what the player can see. The words, and
 * the deixis ties they carry, are [`hint-text.ts`](./hint-text.ts)'s. */
function narrate(
  reason: BricksReason,
  forced: CellColor,
  state: BricksState,
  evidence: readonly number[],
): string {
  const clueVal = (i: number): number => state.grid[i] & NUM_MASK;
  switch (reason.kind) {
    case "three":
      return say.three;
    case "unsupported":
      return say.unsupported(evidence.length);
    case "overcount":
      return say.overcount(clueVal(reason.clue));
    case "strandSupport":
      return say.strandSupport;
    case "undercount":
      return say.undercount(clueVal(reason.clue));
    case "localBreak":
      return say.localBreak(forced, evidence.length);
  }
}

function hint(state: BricksState): HintResult<BricksMove, BricksHint> {
  // **Deliberately not `commonHintRefusal`** (`adopt-the-shared-refusal-opening`,
  // which took the pair into the helper for fifteen games). Bricks owes a
  // *second* wrong-board refusal the pair cannot express: its `findMistakes` is
  // a rule validator, so a mark that is wrong but breaks no local rule is
  // invisible to it, and the re-solve below answers that case with
  // `CONTRADICTION_UNLOCALIZED` instead — a message that asks the player to undo
  // rather than promising a highlight that will never appear. The helper takes no
  // parameter for the second message on purpose; a knob for two games would make
  // a convention into a configuration language.
  if (state.completed) return { ok: false, error: ALREADY_SOLVED };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error: FIX_MISTAKES_FIRST,
    };
  }
  const { w, h, grid } = state;

  // Re-solve the clues and check the player's marks agree with the unique
  // solution — Bricks' rule-validator findMistakes can't see a wrong-but-legal
  // mark, so guard here rather than deduce onward from a doomed position.
  const sol = grid.slice();
  if (solveGame(sol, w, h, DIFF_TRICKY, true, true) !== "complete") {
    return { ok: false, error: PUZZLE_NOT_REASONABLE };
  }
  for (let i = 0; i < w * h; i++) {
    const pc = grid[i] & COL_MASK;
    if ((pc === F_SHADE || pc === F_UNSHADE) && pc !== (sol[i] & COL_MASK)) {
      return {
        ok: false,
        error: CONTRADICTION_UNLOCALIZED,
      };
    }
  }

  const plan = deduceBricksPlan(grid, w, h);
  if (plan.length === 0) {
    return { ok: false, error: DEDUCTION_EXHAUSTED };
  }
  const steps: HintStep<BricksMove, BricksHint>[] = plan.map((m) => {
    // One value, read by both the sentence and the frame — the narration must
    // tie "this cell" to whatever the player can actually see ringed.
    const evidence = evidenceOf(m.reason).filter((c) => c !== m.index);
    return {
      move: { kind: "paint", cells: [{ index: m.index, to: m.to }] },
      explanation: narrate(m.reason, m.to, state, evidence),
      highlights: { target: m.index, forced: m.to, evidence },
    };
  });
  return { ok: true, steps };
}

/** A move completes the step when it paints the target cell to the hinted
 * color; touching the target with a different color, or not touching it, is
 * off-plan (Bricks steps are single-cell — no partial-subset case). */
function hintKeepTrack(
  m: BricksMove,
  step: HintStep<BricksMove, BricksHint>,
  _state: BricksState,
): HintTrackVerdict {
  if (m.kind !== "paint") return "off";
  const hl = step.highlights;
  if (!hl) return "off";
  for (const c of m.cells) {
    if (c.index === hl.target) return c.to === hl.forced ? "completed" : "off";
  }
  return "off";
}

function flashLength(
  from: BricksState,
  to: BricksState,
  _dir: number,
  _ui: BricksUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

/** Bricks' difficulty contract (`engine/difficulty.ts`). `solveGame` returns a
 * `BricksStatus` — `"complete"` exactly when the deduction alone solves the
 * board — and the `clear` argument blanks the grid first, so the verdict is
 * about the puzzle rather than about any marks already on it.
 *
 * **Two tiers, three `DIFF_*` levels** (`audit-guessing-tier-names` D11, and the
 * case `difficulty.ts`'s own doc comment already anticipated: a `DIFF_*`
 * constant is not reliably a tier). The tier list is *the tiers a player can
 * pick* — read off `paramConfig`, which spreads `DIFF_NAMES` — so upstream's
 * ungenerable third one is not among them; `solveAtCap` takes a raw cap and
 * answers for it regardless, which is what a loaded `dt` game needs.
 */
const difficulty: DifficultyContract<BricksParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    const grid = s.grid.slice();
    const ret = solveGame(grid, s.w, s.h, cap, true, true);
    return ret === "complete"
      ? "solved"
      : ret === "invalid"
        ? "impossible"
        : "unsolved";
  },
};

export const bricksGame: Game<
  BricksParams,
  BricksState,
  BricksMove,
  BricksUi,
  BricksDrawState,
  BricksMistake
> = {
  id: "bricks",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  describeParams: (p): ConfigValues => ({
    width: String(p.w),
    height: String(p.h),
    difficulty: p.diff,
  }),
  paramConfig,

  newDesc: (p: BricksParams, rng: RandomState) => newBricksDesc(p, rng),
  validateDesc,
  newState,
  newUi,

  interpretMove,
  executeMove,
  status,

  solve,
  difficulty,
  hint,
  hintKeepTrack,
  findMistakes,
  textFormat,

  colors: (defaultBackground: Color): Color[] => colors(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: BricksParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(bricksGame);
