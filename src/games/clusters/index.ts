/**
 * Clusters — native TS port of `puzzles/unreleased/clusters.c`. Fill the grid
 * with red and blue tiles so that every plain tile touches **two or more**
 * tiles of its own color, and the given "dot" tiles touch exactly one (all
 * exactly-one tiles are given as dots — upstream's rule statement).
 * Left-click/-drag paints blue (cycling to red, then clear); right-click/-drag
 * paints red; a keyboard cursor places colors with Enter/Space/0/1/2/
 * backspace. Rule violations are shown live (upstream behavior), and Check &
 * Save additionally refuses to save while any violation stands
 * (`findMistakes`). The explained hint narrates the solver's proof by
 * contradiction: which rule the opposite coloring of the forced cell would
 * break.
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
import { fromCoord } from "../../engine/geometry.ts";
import {
  ALREADY_SOLVED,
  CONTRADICTION_UNLOCALIZED,
  DEDUCTION_EXHAUSTED,
  FIX_MISTAKES_FIRST,
} from "../../engine/hint-refusal.ts";
import type { OrderedCell } from "../../engine/overlay-sidecar.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
  digitOf,
  gridCursorMove,
  isCursorMove,
  isEraseKey,
  isMouseDown,
  isMouseDrag,
  isMouseRelease,
  LEFT_BUTTON,
  MOD_CTRL,
  MOD_SHFT,
  newCursor,
  RIGHT_BUTTON,
  stripModifiers,
} from "../../engine/pointer.ts";
import { registerGame } from "../../engine/registry.ts";
import type { ConfigValues, Point } from "../../engine/types.ts";
import { newClustersDesc } from "./generator.ts";
import { say } from "./hint-text.ts";
import {
  border,
  type ClustersDrawState,
  colors,
  computeSize,
  FLASH_TIME,
  newDrawState,
  PREFERRED_TILE_SIZE,
  redraw,
  setTileSize,
} from "./render.ts";
import {
  type ClustersDeduction,
  COMPLETE,
  clustersStatus,
  deduceHintPlan,
  findErrors,
  INVALID,
  solveGame,
} from "./solver.ts";
import {
  type ClustersFill,
  type ClustersMove,
  type ClustersParams,
  type ClustersState,
  type ClustersUi,
  COLMASK,
  cloneState,
  decodeParams,
  defaultParams,
  encodeParams,
  F_COLOR_0,
  F_COLOR_1,
  F_SINGLE,
  newState,
  opposite,
  paramConfig,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A cell that breaks a rule in the current state — identical to what the
 * board draws live in red. */
export interface ClustersMistake {
  index: number;
}

function newUi(_state: ClustersState): ClustersUi {
  return { cursor: newCursor(), dragType: -1, drag: [] };
}

/** One step of a click's color cycle: empty, then `first`, then the other
 * color, then empty again. */
function cycleFill(old: number, first: ClustersFill): ClustersFill {
  if (old === 0) return first;
  return old & first ? opposite(first) : 0;
}

function interpretMove(
  state: ClustersState,
  ui: ClustersUi,
  ds: ClustersDrawState,
  p: Point,
  rawButton: number,
): ClustersMove | null | UiUpdate {
  const { w, h, grid } = state;
  const shift = (rawButton & MOD_SHFT) !== 0;
  const control = (rawButton & MOD_CTRL) !== 0;
  const button = stripModifiers(rawButton);
  const ts = ds.tilesize;
  const b = border(ts);

  let hx = ui.cursor.x;
  let hy = ui.cursor.y;

  if (isMouseDown(button)) {
    ui.dragType = -1;
    ui.drag = [];
  }

  if (isMouseDown(button) || isMouseDrag(button)) {
    const gx = fromCoord(p.x, ts, b);
    const gy = fromCoord(p.y, ts, b);
    if (p.x >= b && gx < w && p.y >= b && gy < h) {
      hx = gx;
      hy = gy;
      ui.cursor.visible = false;
    } else {
      return null;
    }
  }

  // --- keyboard cursor movement (paints with Shift/Ctrl held) ---
  if (isCursorMove(button)) {
    const ox = ui.cursor.x;
    const oy = ui.cursor.y;
    const moved = gridCursorMove(button, ui.cursor.x, ui.cursor.y, w, h);
    if (moved) {
      ui.cursor.x = moved.x;
      ui.cursor.y = moved.y;
    }
    ui.cursor.visible = true;

    if (shift || control) {
      // Shift = red ('A'), Ctrl = blue ('B'), Shift+Ctrl = clear ('C').
      const fill: ClustersFill = shift && control ? 0 : control ? F_COLOR_1 : F_COLOR_0;
      const i1 = oy * w + ox;
      const i2 = ui.cursor.y * w + ui.cursor.x;
      // Skip a given, and any cell already in the target state (no-op).
      const inert = (i: number): boolean =>
        !!(grid[i] & F_SINGLE) ||
        (fill === F_COLOR_0 && !!(grid[i] & F_COLOR_0)) ||
        (fill === F_COLOR_1 && !!(grid[i] & F_COLOR_1)) ||
        (fill === 0 && grid[i] === 0);
      const cells: { index: number; fill: ClustersFill }[] = [];
      if (!inert(i1)) cells.push({ index: i1, fill });
      if (i1 !== i2 && !inert(i2)) cells.push({ index: i2, fill });
      if (cells.length > 0) return { kind: "paint", cells };
    }
    return UI_UPDATE;
  }

  // --- mouse press: pick a drag color by cycling the pressed cell ---
  if (isMouseDown(button)) {
    const i = hy * w + hx;
    const old = grid[i];
    if (button === LEFT_BUTTON) ui.dragType = cycleFill(old, F_COLOR_1);
    else if (button === RIGHT_BUTTON) ui.dragType = cycleFill(old, F_COLOR_0);
    else ui.dragType = 0;
    if (ui.dragType || old) ui.drag.push(i);
    return UI_UPDATE;
  }

  // --- mouse drag: accrete cells onto the drag set ---
  if (isMouseDrag(button) && ui.dragType !== -1) {
    const i = hy * w + hx;
    if ((grid[i] & COLMASK) === ui.dragType || ui.drag.includes(i)) return null;
    ui.drag.push(i);
    return UI_UPDATE;
  }

  // --- mouse release: commit the drag as one paint move ---
  if (isMouseRelease(button) && ui.drag.length > 0) {
    // The press that started the drag picked its fill.
    const fill = ui.dragType as ClustersFill;
    const cells = ui.drag
      .filter((i) => !(grid[i] & F_SINGLE)) // never overwrite a given
      .map((index) => ({ index, fill }));
    ui.drag = [];
    if (cells.length > 0) return { kind: "paint", cells };
    return UI_UPDATE;
  }

  // --- keyboard place-one at the cursor ---
  const digit = digitOf(button);
  if (
    ui.cursor.visible &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      isEraseKey(button) ||
      (digit !== null && digit <= 2))
  ) {
    const i = hy * w + hx;
    const old = grid[i];
    if (old & F_SINGLE) return null; // given
    let fill: ClustersFill;
    if (digit === 0 || digit === 2) fill = F_COLOR_0;
    else if (digit === 1) fill = F_COLOR_1;
    else if (button === CURSOR_SELECT2) fill = cycleFill(old, F_COLOR_0);
    else if (button === CURSOR_SELECT) fill = cycleFill(old, F_COLOR_1);
    else fill = 0; // an erase key

    // Upstream: "don't put no-ops on the undo chain".
    if (fill === old) return null;
    return { kind: "paint", cells: [{ index: i, fill }] };
  }

  return null;
}

function executeMove(state: ClustersState, move: ClustersMove): ClustersState {
  const next = cloneState(state);
  const { grid } = next;
  if (move.kind === "solve") {
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] & F_SINGLE) continue; // keep givens
      grid[i] = move.fills[i];
    }
    next.cheated = true;
  } else if (move.kind === "paint") {
    for (const { index, fill } of move.cells) {
      if (grid[index] & F_SINGLE) continue; // never overwrite a given
      grid[index] = fill;
    }
  } else {
    return assertNever(move, "clusters: executeMove");
  }
  if (clustersStatus(grid, next.w, next.h) === COMPLETE) next.completed = true;
  return next;
}

function solve(orig: ClustersState): SolveResult<ClustersMove> {
  const grid = orig.grid.slice();
  // Always the deepest rung: Solve and the hint are "try as hard as you can",
  // where the tier the board was *generated* at is irrelevant — an Easy board
  // is solved by the easy rung anyway, and running the lookahead over it costs
  // only the time it takes to find nothing left to do.
  solveGame(grid, orig.w, orig.h, 1);
  if (clustersStatus(grid, orig.w, orig.h) === INVALID) {
    return { ok: false, error: "Puzzle is invalid." };
  }
  const fills: ClustersFill[] = Array.from(
    grid,
    (byte) => (byte & COLMASK) as ClustersFill,
  );
  return { ok: true, move: { kind: "solve", fills } };
}

function findMistakes(state: ClustersState): readonly ClustersMistake[] {
  return findErrors(state.grid, state.w, state.h).map((index) => ({ index }));
}

// --- hint ------------------------------------------------------------------

/** Highlight roles of a Clusters hint step (the render legend — see the
 * COL_HINT block in render.ts). `target` is the forced cell; `danger` is the
 * tile the refuted coloring would break — the only element the narration
 * calls "ringed" — when that isn't the target itself; `chain` is a lookahead
 * firing's what-if walk, each cell marked with the color the hypothesis
 * would force it to. No other premise needs a highlight or a palette role:
 * every tile the three local rules read sits orthogonally adjacent to the
 * target or the danger tile, so it is already in view. */
export interface ClustersHintHighlights {
  target: Point;
  danger?: Point;
  /** `order` is the link's 1-based place in the chain, drawn as an ordinal
   * (`drawHintOrdinal`). Explicit rather than the array index because the
   * narration cites it: it is data the renderer reads, not a positional
   * convention two files have to agree about. */
  chain: (OrderedCell & { fill: ClustersFill })[];
}

/** Narrate the proof by contradiction. The words, and how each ties "this
 * cell" to the ringed tile, are [`hint-text.ts`](./hint-text.ts)'s. */
function narrate(d: ClustersDeduction): string {
  return d.reason.kind === "chain"
    ? say.chain(d, d.reason.steps.length)
    : say.direct(d);
}

function buildHighlights(d: ClustersDeduction, w: number): ClustersHintHighlights {
  const pt = (i: number): Point => ({ x: i % w, y: (i / w) | 0 });
  const at = d.reason.at;
  return {
    target: pt(d.index),
    danger: at.cell !== d.index ? pt(at.cell) : undefined,
    chain:
      d.reason.kind === "chain"
        ? d.reason.steps.map((s, k) => ({ ...pt(s.index), fill: s.fill, order: k + 1 }))
        : [],
  };
}

function hint(state: ClustersState): HintResult<ClustersMove, ClustersHintHighlights> {
  // Deliberately not `commonHintRefusal`: like Bricks, Clusters can reach a board
  // that is inconsistent without any one cell being provably wrong, and answers
  // that with `CONTRADICTION_UNLOCALIZED` below, so its wrong-board arm chooses
  // between two messages rather than the helper's single one.
  if (state.completed) return { ok: false, error: ALREADY_SOLVED };
  if (findMistakes(state).length > 0) return { ok: false, error: FIX_MISTAKES_FIRST };
  const plan = deduceHintPlan(state.grid, state.w, state.h);
  // COMPLETE certifies the position (the error rules are monotone, so a wrong
  // tile can never extend to a zero-error grid); anything else means some
  // tile already placed must be wrong, and hinting would lead deeper in.
  if (plan.verdict === INVALID) return { ok: false, error: CONTRADICTION_UNLOCALIZED };
  if (plan.verdict !== COMPLETE || plan.deductions.length === 0) {
    return { ok: false, error: DEDUCTION_EXHAUSTED };
  }
  const steps: HintStep<ClustersMove, ClustersHintHighlights>[] = plan.deductions.map(
    (d) => ({
      move: { kind: "paint", cells: [{ index: d.index, fill: d.fill }] },
      explanation: narrate(d),
      highlights: buildHighlights(d, state.w),
    }),
  );
  return { ok: true, steps };
}

/** A move completes the step iff it paints exactly the hinted cell with the
 * hinted color. A multi-cell drag (even one covering the target) changes
 * cells the plan didn't account for, so it drops the plan to recompute. */
function hintKeepTrack(
  m: ClustersMove,
  step: HintStep<ClustersMove>,
  _state: ClustersState,
): HintTrackVerdict {
  if (m.kind !== "paint" || step.move.kind !== "paint") return "off";
  if (m.cells.length !== 1) return "off";
  const want = step.move.cells[0];
  const got = m.cells[0];
  return got.index === want.index && got.fill === want.fill ? "completed" : "off";
}

/** Clusters' difficulty contract (`engine/difficulty.ts`). The two tiers are
 * nested rungs of one fixpoint (`maxdiff` 0 is `solverTry` alone, ≥ 1 adds
 * `solverRecurse`), which is why `solvableAtExactlyTier` asks the cheap rung
 * first — the deeper solve resumes from that same fixpoint. */
const difficulty: DifficultyContract<ClustersParams> = {
  tierOf: (p) => p.diff,
  withTier: (p, tier) => ({ ...p, diff: tier }),
  solveAtCap: (p, desc, cap) => {
    const s = newState(p, desc);
    const grid = s.grid.slice();
    const ret = solveGame(grid, s.w, s.h, cap);
    return ret === COMPLETE ? "solved" : ret === INVALID ? "impossible" : "unsolved";
  },
};

export const clustersGame: Game<
  ClustersParams,
  ClustersState,
  ClustersMove,
  ClustersUi,
  ClustersDrawState,
  ClustersMistake
> = {
  id: "clusters",
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

  newDesc: (p, rng) => newClustersDesc(p, rng),
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
  flashLength: (from, to) => winFlash(from, to, FLASH_TIME),
};

registerGame(clustersGame);
