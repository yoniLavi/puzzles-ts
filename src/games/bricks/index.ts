/**
 * Bricks (Tawamurenga) — native TS port of `puzzles/unreleased/bricks.c`.
 * Shade cells in a hexagonal grid so that every shaded cell is supported by a
 * shaded cell below it, no three shade in a horizontal line, and each clue
 * equals its count of shaded neighbours.
 *
 * Input: left-click/drag cycles a cell shade→unshade→empty (right-click the
 * reverse) and paints the whole drag with the first cell's target colour; a
 * hex-aware keyboard cursor moves with the arrow/numpad keys (up/down alternate
 * orthogonal and diagonal steps across the shear) and places colours with
 * Enter/Space/0/1/2/Backspace. Rule violations show live while dragging;
 * Check & Save (`findMistakes`) hard-blocks on any current violation.
 */

import type { DifficultyContract } from "../../engine/difficulty.ts";
import {
  type Game,
  type HintResult,
  type HintStep,
  type HintTrackVerdict,
  type SolveResult,
  UI_UPDATE,
  type UiUpdate,
} from "../../engine/game.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_DOWN,
  CURSOR_LEFT,
  CURSOR_RIGHT,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  CURSOR_UP,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_NUM_KEYPAD,
  MOD_SHFT,
  RIGHT_BUTTON,
} from "../../engine/pointer.ts";
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Colour, ConfigValues, Point, Size } from "../../engine/types.ts";
import { newBricksDesc } from "./generator.ts";
import {
  type BricksDrawState,
  colours,
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
  bitsColour,
  type CellColour,
  COL_MASK,
  cloneState,
  colourBits,
  DIFF_NAMES,
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
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

// Bare-key char codes.
const KEY_0 = 48;
const KEY_1 = 49;
const KEY_2 = 50;
const KEY_BACKSPACE = 8;
const KEY_DELETE = 127;

// Numpad-flagged keys (the web frontend sets MOD_NUM_KEYPAD for the numpad).
const NK = (ch: number): number => MOD_NUM_KEYPAD | ch;

function newUi(state: BricksState): BricksUi {
  // Cursor starts on the first non-bound cell (upstream new_ui).
  const s = state.w * state.h;
  let i = 0;
  while (i < s && state.grid[i] === F_BOUND) i++;
  return {
    cshow: false,
    cx: i % state.w,
    cy: (i / state.w) | 0,
    dragtype: 0,
    drag: [],
  };
}

function interpretMove(
  state: BricksState,
  ui: BricksUi,
  ds: BricksDrawState | null,
  pt: Point,
  rawButton: number,
): BricksMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = (rawButton & MOD_SHFT) !== 0;
  const control = (rawButton & MOD_CTRL) !== 0;
  // Strip only Shift/Ctrl — MOD_NUM_KEYPAD is load-bearing for the diagonals.
  let button = rawButton & ~(MOD_SHFT | MOD_CTRL);
  const ts = ds?.tilesize ?? PREFERRED_TILE_SIZE & ~1;

  // Numpad 8/2/4/6 are the orthogonal cursor moves.
  if (button === NK(56)) button = CURSOR_UP;
  else if (button === NK(50)) button = CURSOR_DOWN;
  else if (button === NK(52)) button = CURSOR_LEFT;
  else if (button === NK(54)) button = CURSOR_RIGHT;

  // Moving up/down across the shear alternates orthogonal and diagonal;
  // numpad 7/3 become straight up/down.
  if (button === CURSOR_UP && ui.cy > 0 && (ui.cy & 1) === 0) button = NK(57);
  else if (button === CURSOR_DOWN && ui.cy < h - 1 && ui.cy & 1) button = NK(49);
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
    const hx = ui.cx;
    const hy = ui.cy;
    ui.cshow = true;
    ui.cx = Math.max(0, Math.min(ui.cx + dx, w - 1));
    ui.cy = Math.max(0, Math.min(ui.cy + dy, h - 1));

    // Clamp into the hexagon's row bounds.
    const extra = (h | ui.cy) & 1 ? 0 : 1;
    ui.cx = Math.min(ui.cx, w - ((ui.cy / 2) | 0) - 1);
    ui.cx = Math.max(ui.cx, (((h - ui.cy) / 2) | 0) - extra);

    if (shift || control) {
      const to = shift && control ? "empty" : control ? "shade" : "unshade";
      const i1 = hy * w + hx;
      const i2 = ui.cy * w + ui.cx;
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

  let hx = ui.cx;
  let hy = ui.cy;

  if (isMouseDown(button)) {
    ui.dragtype = 0;
    ui.drag = [];
  }

  if (isMouseDown(button) || isMouseDrag(button)) {
    if (gx >= 0 && gx < w && gy >= 0 && gy < h) {
      hx = gx;
      hy = gy;
      ui.cshow = false;
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
    const to = bitsColour(ui.dragtype);
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
  if (
    ui.cshow &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      button === KEY_BACKSPACE ||
      button === KEY_DELETE ||
      button === KEY_0 ||
      button === KEY_1 ||
      button === KEY_2)
  ) {
    const i = ui.cy * w + ui.cx;
    const old = grid[i] & COL_MASK;
    if (!old) return null; // a clue or bound cell — nothing to set

    let to: "shade" | "unshade" | "empty" = "empty";
    if (button === KEY_0 || button === KEY_2) to = "unshade";
    else if (button === KEY_1) to = "shade";
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
      next.grid[i] = colourBits(move.grid[i]);
    }
    next.cheated = true;
  } else {
    for (const { index, to } of move.cells) {
      if (state.grid[index] & COL_MASK) next.grid[index] = colourBits(to);
    }
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
  const colours2 = Array.from({ length: w * h }, (_, i) => bitsColour(grid[i]));
  return { ok: true, move: { kind: "solve", grid: colours2 } };
}

// --- hint (a second projection of the contradiction solver) -----------------

/** Highlight data for a Bricks hint step: the forced cell (`target`, drawn
 * `COL_HINT`), the colour it is forced to (`forced` — the narration says
 * which; the render never pre-places it), and the deduction's `evidence`
 * cells (ringed `COL_HINT_CELL`). All are padded-grid indices. */
export interface BricksHint {
  target: number;
  forced: CellColour;
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

/** Narrate *why* the move is forced — premise → contradiction → conclusion in
 * the necessity voice (the hint quality bar). Names the clue value when a clue
 * is the evidence.
 *
 * **`evidence` is the cell set the frame actually rings** (the reason's cells
 * minus the target), not the raw reason, so the sentence is written against
 * what the player can see. Every branch that has a second mark ties "this
 * cell" to it, because with a solid target *and* a ring on screen a bare
 * deictic points at neither (`disambiguate-hint-deixis`; the tie is geometric,
 * never a colour name — `docs/games/hints.md` § "Two marks on the board").
 * The relations asserted below are the ones the solver guarantees, checked
 * against a sweep of ~55k deductions over ~4,800 partial positions of the
 * fixture boards: `shadeRun` never leaves the target's row and is contiguous
 * through it (so the target *does* sit next to the ringed bricks, for runs of
 * 3, 4 and 5 alike); `classify*Trial` only ever names a clue found by walking
 * `BRICKS_STEPS` from the target (so it really is beside this cell); and
 * `below`/`above` are the brick-wall supports one row down/up. */
function narrate(
  reason: BricksReason,
  forced: CellColour,
  state: BricksState,
  evidence: readonly number[],
): string {
  const clueVal = (i: number): number => state.grid[i] & NUM_MASK;
  switch (reason.kind) {
    case "three":
      return "This cell sits next to the ringed shaded bricks — shading it would make three in a row, and no row may have three, so it must stay clear.";
    case "unsupported":
      // A ringed cell below is an unshaded brick *or a clue* — `validateGravity`
      // masks a clue down to no colour, so a clue supports nothing (seen live:
      // the opener's ring is a `4`). "Isn't a shaded brick" therefore says it
      // better than "is not shaded", which reads as a mark the player could go
      // and place. An *empty* cell below does not trigger the rule at all, so
      // this branch never claims anything about one. The brick-wall corners can
      // leave a cell with only one support, or — at the padded triangles — none
      // to ring, hence three arms.
      return evidence.length === 0
        ? "Shading this cell would leave it with no shaded brick beneath it to rest on — so it must stay clear."
        : evidence.length === 1
          ? "The ringed cell below this one is the only thing it could rest on, and it isn't a shaded brick — so this cell must stay clear."
          : "The ringed cells below this one are the only things it could rest on, and neither is a shaded brick — so this cell must stay clear.";
    case "overcount": {
      const n = clueVal(reason.clue);
      // docs/games/hints.md § "Sanity-read at the degenerate extremes": "more
      // than its 0 shaded neighbours" came out of the running app on the opener
      // board and is nonsense — a 0 allows none at all.
      return n === 0
        ? "The ringed 0 beside this cell allows no shaded neighbours at all — so this cell must stay clear."
        : `Shading this cell would give the ringed ${n} beside it more than its ${n} shaded neighbour${n === 1 ? "" : "s"} — so it must stay clear.`;
    }
    case "strandSupport":
      return "The shaded brick above rests only on this cell — clearing it would leave that brick with nothing beneath it, so it must be shaded.";
    case "undercount": {
      const n = clueVal(reason.clue);
      return `The ringed ${n} beside this cell still needs more shaded neighbours, and this is one of the last cells that can supply one — clearing it would put ${n} out of reach, so it must be shaded.`;
    }
    case "localBreak": {
      // The direct rung's *unclassified* case: one colour placed, one validator
      // call, the board breaks — but at a cell none of the four named arms
      // above matched. It used to be narrated as "following the forced
      // consequences", which described the recursive rung that no longer feeds
      // this reason and was never true of this one: nothing is followed, the
      // break is right there and is ringed (`audit-guessing-tier-names`).
      //
      // This is the one arm with **no** guaranteed relation — `errorCells`
      // reports wherever the validator flagged the break, which need not be
      // near the target — so the tie is the only thing that always holds:
      // evidence excludes the target, so the cell being decided is the one
      // *without* a ring. (The sweep above never reached this arm at all: the
      // four named reasons classify every single-cell contradiction Bricks'
      // validator can raise. It stays because a classifier's default must.)
      const act = forced === "unshade" ? "Shading" : "Clearing";
      const end = forced === "unshade" ? "stay clear" : "be shaded";
      return evidence.length === 0
        ? `${act} this cell would break the board — so it must ${end}.`
        : `${act} this cell — the unringed one — would break the board where the rings are, so it must ${end}.`;
    }
  }
}

function hint(state: BricksState): HintResult<BricksMove, BricksHint> {
  if (state.completed) return { ok: false, error: "This board is already solved." };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error:
        "Fix the highlighted mistakes first — a hint can't deduce from a wrong board.",
    };
  }
  const { w, h, grid } = state;

  // Re-solve the clues and check the player's marks agree with the unique
  // solution — Bricks' rule-validator findMistakes can't see a wrong-but-legal
  // mark, so guard here rather than deduce onward from a doomed position.
  const sol = grid.slice();
  if (solveGame(sol, w, h, DIFF_TRICKY, true, true) !== "complete") {
    return { ok: false, error: "This puzzle's solution can't be determined." };
  }
  for (let i = 0; i < w * h; i++) {
    const pc = grid[i] & COL_MASK;
    if ((pc === F_SHADE || pc === F_UNSHADE) && pc !== (sol[i] & COL_MASK)) {
      return {
        ok: false,
        error:
          "One of your marked cells doesn't match the solution — undo and rethink; a hint can't help from a wrong position.",
      };
    }
  }

  const plan = deduceBricksPlan(grid, w, h);
  if (plan.length === 0) {
    return { ok: false, error: "No next move can be deduced from this position." };
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
 * colour; touching the target with a different colour, or not touching it, is
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
  if (!from.completed && to.completed && !from.cheated && !to.cheated)
    return FLASH_TIME;
  return 0;
}

/** Bricks' difficulty contract (`engine/difficulty.ts`). `solveGame` returns a
 * `BricksStatus` — `"complete"` exactly when the deduction alone solves the
 * board — and the `clear` argument blanks the grid first, so the verdict is
 * about the puzzle rather than about any marks already on it.
 *
 * **Two tiers, three `DIFF_*` levels** (`audit-guessing-tier-names` D11, and the
 * case `difficulty.ts`'s own doc comment already anticipated: a `DIFF_*`
 * constant is not reliably a tier). `tiers` is *the tiers a player can pick*, so
 * upstream's ungenerable third one is not among them; `solveAtCap` takes a raw
 * cap and answers for it regardless, which is what a loaded `dt` game needs.
 * The list comes from `DIFF_NAMES` rather than repeating it — Unequal shipped a
 * menu and a custom-params dialog that disagreed for exactly that reason.
 */
const difficulty: DifficultyContract<BricksParams> = {
  tiers: DIFF_NAMES,
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
  needsRightButton: true,

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
  paramConfig: [
    ...dimensionParamConfig<BricksParams>(),
    {
      kw: "difficulty",
      name: "Difficulty",
      type: "choices",
      choices: [...DIFF_NAMES],
      get: (p) => p.diff,
      set: (p, v) => {
        p.diff = v;
      },
    },
  ],

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

  colours: (defaultBackground: Colour): Colour[] => colours(defaultBackground),
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize: (p: BricksParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(bricksGame);
