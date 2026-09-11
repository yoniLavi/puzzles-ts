/**
 * Subsets — native TS port of `puzzles/unreleased/subsets.c` (Lennard
 * Sprong's implementation of Inaba Naoki's puzzle).
 *
 * Place every set over an `n`-letter universe into the grid exactly once. A
 * horseshoe arrow points from a superset to a subset it contains, and *all*
 * valid arrows are shown — so a missing arrow between two neighbors is
 * itself a constraint (neither contains the other).
 *
 * Input targets one letter slot of a cell: left-click / Enter cycles it
 * unknown → present → absent, right-click / Space cycles the other way, and
 * middle-click / Backspace resets it to unknown; a keyboard cursor walks the
 * slots, skipping the gaps between cell blocks.
 *
 * Upstream locks the board to one configuration (4×4, four letters — the only
 * size where the sixteen possible sets exactly fill the sixteen cells), so the
 * only choice is how deep the deductions go: two tiers, one preset each, and a
 * Custom dialog offering the tier alone.
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
  CONTRADICTION_UNLOCALIZED,
  commonHintRefusal,
  DEDUCTION_EXHAUSTED,
} from "../../engine/hint-refusal.ts";
import {
  BACKSPACE,
  CURSOR_SELECT,
  CURSOR_SELECT2,
  cursorDelta,
  DELETE,
  isEraseKey,
  isMouseDown,
  LEFT_BUTTON,
  MIDDLE_BUTTON,
  newCursor,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Point } from "../../engine/types.ts";
import { newSubsetsDesc } from "./generator.ts";
import { say } from "./hint-text.ts";
import {
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  type SubsetsDrawState,
  setTileSize,
} from "./render.ts";
import {
  type CollapseExclusion,
  candidateCells,
  deduceHintPlan,
  findMistakes,
  pickExclusion,
  type SubsetsDeduction,
  solveCopy,
  subsetsSolveGame,
  subsetsValidate,
} from "./solver.ts";
import {
  ALL_BITS,
  CELL_HEIGHT,
  CELL_WIDTH,
  cloneState,
  DIFF_NAMES,
  decodeParams,
  defaultParams,
  encodeParams,
  newState,
  presets,
  type SubsetsMistake,
  type SubsetsMove,
  type SubsetsParams,
  type SubsetsState,
  type SubsetsUi,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

function newUi(_state: SubsetsState): SubsetsUi {
  return { cursor: newCursor(), highlightSet: null, highlightCell: null };
}

/** The cell whose inspect icon a pointer is over, or null. The icon is a badge
 * in the margin just *above* the cell block (see render.ts) — outside the block
 * so it clearly belongs to the whole cell, not one slot — clicked to light that
 * cell's still-possible sets in the tally without editing anything.
 *
 * The tap target is a strip spanning the block's top edge: it can't grow down
 * into the block (that would steal slot taps) or right past the block's mid-line
 * (a horseshoe sits there), so it is widened along the top instead to reach a
 * touch-reasonable size within the available margin. */
function iconHit(p: Point, w: number, h: number, ts: number): number | null {
  const cw = CELL_WIDTH;
  const ch = CELL_HEIGHT;
  for (let cellx = 0; cellx < w; cellx++) {
    for (let celly = 0; celly < h; celly++) {
      const bx = (cellx * (cw + 1) + 0.5) * ts;
      const by = (celly * (ch + 1) + 0.5) * ts;
      if (
        p.x >= bx - ts * 0.15 &&
        p.x < bx + ts * 0.9 &&
        p.y >= by - ts * 0.55 &&
        p.y < by
      )
        return celly * w + cellx;
    }
  }
  return null;
}

/** The tally-band set-value under a pointer, or null. Mirrors the tally layout
 * in render.ts (each entry drawn in a `2·ts × 0.75·ts` box). */
function tallyHit(p: Point, w: number, h: number, ts: number): number | null {
  const cw = CELL_WIDTH;
  const ch = CELL_HEIGHT;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const tx = x * (cw + 1) * ts + Math.floor(cw * ts * 0.75);
      const ty = Math.floor(y * 0.75 * ts) + (h + 2) * ch * ts;
      if (
        p.x >= tx - ts &&
        p.x < tx + ts &&
        p.y >= ty - ts * 0.375 &&
        p.y < ty + ts * 0.375
      )
        return x * h + y;
    }
  }
  return null;
}

type SlotType = "known" | "unknown" | "cleared";

function interpretMove(
  state: SubsetsState,
  ui: SubsetsUi,
  ds: SubsetsDrawState,
  p: Point,
  rawButton: number,
): SubsetsMove | null | UiUpdate {
  const { w, h } = state;
  const cw = CELL_WIDTH;
  const ch = CELL_HEIGHT;
  const button = stripModifiers(rawButton);
  const ts = ds.tilesize;

  // --- reference aid, both directions are mutually exclusive (selecting one
  // clears the other). A cell's top-left inspect icon lights its still-possible
  // sets in the tally; a tally set lights its still-legal cells. ------------
  if (button === LEFT_BUTTON) {
    const cell = iconHit(p, w, h, ts);
    if (cell !== null) {
      ui.highlightCell = ui.highlightCell === cell ? null : cell;
      ui.highlightSet = null;
      return UI_UPDATE;
    }
    const cn = tallyHit(p, w, h, ts);
    if (cn !== null) {
      ui.highlightSet = ui.highlightSet === cn ? null : cn;
      ui.highlightCell = null;
      return UI_UPDATE;
    }
  }

  // --- cursor movement over the virtual slot grid, skipping the gaps -------
  const delta = cursorDelta(button);
  if (delta) {
    const gw = w * (cw + 1) - 1;
    const gh = h * (ch + 1) - 1;
    // Upstream repeats move_cursor while the cursor rests on a gap row or
    // column between cell blocks; gaps never touch the clamped edges, so
    // this always terminates.
    do {
      ui.cursor.x = Math.max(0, Math.min(gw - 1, ui.cursor.x + delta.dx));
      ui.cursor.y = Math.max(0, Math.min(gh - 1, ui.cursor.y + delta.dy));
      ui.cursor.visible = true;
    } while (ui.cursor.x % (cw + 1) === cw || ui.cursor.y % (ch + 1) === ch);
    // Reverse aid: the cursor cell's still-possible sets light up in the tally.
    ui.highlightCell =
      Math.floor(ui.cursor.y / (ch + 1)) * w + Math.floor(ui.cursor.x / (cw + 1));
    ui.highlightSet = null;
    return UI_UPDATE;
  }

  // --- pick the targeted slot (cursor select or pointer) --------------------
  const isSelect =
    button === CURSOR_SELECT || button === CURSOR_SELECT2 || isEraseKey(button);

  let gx: number;
  let gy: number;
  if (isSelect && ui.cursor.visible) {
    gx = ui.cursor.x;
    gy = ui.cursor.y;
  } else if (!isMouseDown(button) || p.x < ts / 2 || p.y < ts / 2) {
    return null;
  } else {
    // Upstream FROM_COORD: the board is inset by half a tile.
    gx = Math.floor((p.x - Math.floor(ts / 2)) / ts);
    gy = Math.floor((p.y - Math.floor(ts / 2)) / ts);
  }

  const cellx = Math.floor(gx / (cw + 1));
  const celly = Math.floor(gy / (ch + 1));
  const numx = gx % (cw + 1);
  const numy = gy % (ch + 1);

  if (cellx >= w || celly >= h) return null;
  if (numx >= cw || numy >= ch) return null;

  const pos = celly * w + cellx;
  const num = numy * cw + numx;
  const bit = 1 << num;

  if (state.immutable[pos] & bit) return null;

  const oldtype: SlotType =
    state.known[pos] & bit ? "known" : state.mask[pos] & bit ? "unknown" : "cleared";

  let newtype: SlotType = oldtype;
  switch (button) {
    case LEFT_BUTTON:
    case CURSOR_SELECT:
      newtype =
        oldtype === "unknown" ? "known" : oldtype === "known" ? "cleared" : "unknown";
      break;
    case RIGHT_BUTTON:
    case CURSOR_SELECT2:
      newtype =
        oldtype === "unknown" ? "cleared" : oldtype === "cleared" ? "known" : "unknown";
      break;
    case MIDDLE_BUTTON:
    // Both erase codes, spelled out because a `case` cannot call `isEraseKey`.
    case BACKSPACE:
    case DELETE:
      newtype = "unknown";
      break;
    default:
      break;
  }

  if (oldtype === newtype) return null;
  if (isMouseDown(button)) ui.cursor.visible = false;

  return { kind: "set", type: newtype, pos, bit: num };
}

function executeMove(state: SubsetsState, move: SubsetsMove): SubsetsState {
  if (move.kind === "solve") {
    const next = cloneState(state);
    for (let i = 0; i < next.w * next.h; i++) {
      next.known[i] = move.known[i];
      next.mask[i] = move.mask[i];
    }
    // Deliberate divergence, per docs/games/solver-and-generator.md
    // § "Solve and the generator's aux": upstream's 'S' branch skips the
    // completion check and never sets `cheated`, leaving a solved board
    // "ongoing" for ever. The collection's solve move completes the game
    // (solved-with-help) and marks it cheated so the win flash doesn't fire.
    // Not byte-match surface: the desc differential never runs executeMove.
    if (subsetsValidate(next) === "complete") next.completed = true;
    next.cheated = next.completed;
    return next;
  }
  // Before the range checks: a missing `pos` makes `pos < 0` and `pos >= n`
  // *both* false, so a foreign move would pass them as an unchanged board.
  if (move.kind !== "set") return assertNever(move, "subsets: executeMove");

  const { pos, bit } = move;
  if (pos < 0 || pos >= state.w * state.h)
    throw new Error("subsets: move position out of range");
  if (bit < 0 || bit >= state.n) throw new Error("subsets: move letter out of range");
  if (state.immutable[pos] & (1 << bit))
    throw new Error("subsets: cannot change a given slot");

  const next = cloneState(state);
  const b = 1 << bit;
  switch (move.type) {
    case "known":
      next.known[pos] |= b;
      next.mask[pos] |= b;
      break;
    case "cleared":
      next.known[pos] &= ~b;
      next.mask[pos] &= ~b;
      break;
    case "unknown":
      next.known[pos] &= ~b;
      next.mask[pos] |= b;
      break;
    default:
      return assertNever(move.type, "subsets: executeMove set");
  }

  if (subsetsValidate(next) === "complete") next.completed = true;
  return next;
}

function solve(orig: SubsetsState): SolveResult<SubsetsMove> {
  const { solved, result } = solveCopy(orig);
  if (result === "invalid") return { ok: false, error: "Puzzle is invalid." };
  // An unfinished solve still emits the partial deduction (upstream).
  return {
    ok: true,
    move: {
      kind: "solve",
      known: Array.from(solved.known),
      mask: Array.from(solved.mask),
    },
  };
}

// --- hint -------------------------------------------------------------------

/** Highlight roles of a Subsets hint step (see the COL_HINT block in
 * render.ts). Every narration is *attention → deduction → action*, per slot:
 * - `target` — the cell being decided; its acted-on slot gets the bold
 *   `COL_HINT` frame (the *action* location);
 * - `cells` — a neighbor cell the narration calls "the highlighted cell"
 *   (the cell across a horseshoe), framed `COL_HINT_CELL`;
 * - `sets` — set-values the narration calls "the highlighted set(s)", tinted
 *   in the tally band (a collapse's surviving candidates, or the placed set);
 * - `spotlight` — the cells a *hidden single*'s set can still go in (its one
 *   home), lit `COL_HINT_SPOT` — the same set→placement spotlight the
 *   player-facing reference aid draws. */
export interface SubsetsHintHighlights {
  target: Point;
  cells: Point[];
  sets: number[];
  spotlight: Point[];
}

function buildHighlights(
  state: SubsetsState,
  d: SubsetsDeduction,
  exclusion: CollapseExclusion | null,
): SubsetsHintHighlights {
  const w = state.w;
  const pt = (i: number): Point => ({ x: i % w, y: Math.floor(i / w) });
  const r = d.reason;
  // Arrows point at a neighbor *cell*; a placement points at the *set* in the
  // tally; a hidden single also *spotlights* where the set can go (its one
  // home). A collapse highlights the excluded competitor's blocker cell, so
  // "the highlighted cell" in the "why not …" clause has a referent.
  const blockerCell = (ex: CollapseExclusion): number =>
    ex.block.kind === "placed"
      ? ex.block.cell
      : ex.block.kind === "arrow" || ex.block.kind === "adjacent"
        ? ex.block.neighbor
        : d.pos; // "marks" never occurs here (pickExclusion filters it)
  const cells: number[] =
    r.kind === "arrowKnown"
      ? [r.to]
      : r.kind === "arrowMask"
        ? [r.from]
        : exclusion
          ? [blockerCell(exclusion)]
          : [];
  const sets =
    r.kind === "hiddenSingle" || r.kind === "singlePosition"
      ? [r.value]
      : r.kind === "collapse"
        ? r.survivors
        : [];
  const spotlight =
    r.kind === "hiddenSingle" ? candidateCells(state, r.value).map(pt) : [];
  return { target: pt(d.pos), cells: cells.map(pt), sets, spotlight };
}

/** A firing (one deduction deciding a cell's letters) becomes one sub-goal
 * journey: leg 0 leads with the why, the rest follow as `continuesPrevious`
 * legs — each with its own per-slot string. A collapse's lead also gets a "why
 * not X" clause. All of a journey's marks render in the same `COL_HINT`. */
function stepsForFiring(
  state: SubsetsState,
  d: SubsetsDeduction,
): HintStep<SubsetsMove, SubsetsHintHighlights>[] {
  const exclusion =
    d.reason.kind === "collapse"
      ? pickExclusion(state, d.pos, d.reason.survivors)
      : null;
  const highlights = buildHighlights(state, d, exclusion);
  const steps = d.sets.map((set, k) => ({
    move: { kind: "set" as const, type: set.type, pos: d.pos, bit: set.bit },
    explanation: say.leg(d, k),
    highlights,
    ...(k > 0 ? { continuesPrevious: true } : {}),
  }));
  if (exclusion && steps.length > 0)
    steps[0].explanation += say.exclusion(exclusion, state.n);
  return steps;
}

function hint(state: SubsetsState): HintResult<SubsetsMove, SubsetsHintHighlights> {
  const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
  if (refusal) return refusal;

  // A mark can be wrong without yet breaking a local rule (a letter the unique
  // solution excludes). The solution is derivable from the givens, so compare
  // and refuse honestly rather than hint on into a doomed position.
  const { solved, result } = solveCopy(state);
  if (result === "complete") {
    for (let i = 0; i < state.w * state.h; i++) {
      // `solved` reset non-givens and re-derived them; every letter the player
      // has decided (marked or cleared) must agree with the solution.
      const decided = state.known[i] | (ALL_BITS(state.n) & ~state.mask[i]);
      if ((state.known[i] ^ solved.known[i]) & decided)
        return { ok: false, error: CONTRADICTION_UNLOCALIZED };
    }
  }

  const plan = deduceHintPlan(state);
  if (plan.status === "invalid") return { ok: false, error: CONTRADICTION_UNLOCALIZED };
  if (plan.deductions.length === 0) {
    return { ok: false, error: DEDUCTION_EXHAUSTED };
  }

  const steps = plan.deductions.flatMap((d) => stepsForFiring(state, d));
  return { ok: true, steps };
}

/** A move completes the step iff it is exactly the hinted letter toggle
 * (position, letter and target tri-state all match); anything else drops the
 * plan to recompute. */
function hintKeepTrack(
  m: SubsetsMove,
  step: HintStep<SubsetsMove>,
  _state: SubsetsState,
): HintTrackVerdict {
  if (m.kind !== "set" || step.move.kind !== "set") return "off";
  return m.pos === step.move.pos && m.bit === step.move.bit && m.type === step.move.type
    ? "completed"
    : "off";
}

function flashLength(
  from: SubsetsState,
  to: SubsetsState,
  _dir: number,
  _ui: SubsetsUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

/** The cross-game difficulty contract: declaring it enrolls Subsets in the
 * shared cap-monotonicity and tier-reachability guards. `solveAtCap` rebuilds
 * the board from its desc — never from a live state — because
 * `subsetsSolveGame` resets and mutates what it is given. */
const difficulty: DifficultyContract<SubsetsParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const result = subsetsSolveGame(newState(p, desc), cap);
    return result === "complete"
      ? "solved"
      : result === "invalid"
        ? "impossible"
        : "unsolved";
  },
};

export const subsetsGame: Game<
  SubsetsParams,
  SubsetsState,
  SubsetsMove,
  SubsetsUi,
  SubsetsDrawState,
  SubsetsMistake
> = {
  id: "subsets",
  wantsStatusbar: false,
  isTimed: false,
  canSolve: true,
  canFormatAsText: true,
  // Touching the reference aid (tally / inspect icon / cursor) dismisses a
  // displayed hint, so the aid isn't suppressed by a still-active hint overlay.
  // Unconditional: Subsets' hint marks no square the player types into, so
  // there is no follow-by-hand flow to keep the explanation up for (contrast
  // Crossing, which answers per step).
  uiUpdateClearsHint: () => true,

  defaultParams,
  presets,
  encodeParams,
  decodeParams,
  validateParams,

  // Upstream has no configure dialog: 4×4 over four letters is the only legal
  // board. The tier is the one axis this game *can* vary, so it is the whole
  // dialog.
  paramConfig: [
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

  newDesc: newSubsetsDesc,
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

  colors,
  preferredTileSize: PREFERRED_TILE_SIZE,
  computeSize,
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(subsetsGame);
