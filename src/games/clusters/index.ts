/**
 * Clusters — native TS port of `puzzles/unreleased/clusters.c`. Fill the grid
 * with red and blue tiles so that every plain tile touches **two or more**
 * tiles of its own color, and the given "dot" tiles touch exactly one (all
 * exactly-one tiles are given as dots — upstream's rule statement).
 * Left-click/-drag paints blue (cycling to red, then clear); right-click/-drag
 * paints red; a keyboard cursor places colors with Enter/Space/0/1/2/
 * backspace. Rule violations are shown live (upstream behavior), and Check &
 * Save additionally refuses to save while any violation stands
 * (`findMistakes`). The explained hint (`add-clusters-hint`) narrates the
 * solver's proof by contradiction: which rule the opposite coloring of the
 * forced cell would break.
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
  FIX_MISTAKES_FIRST,
  NO_DEDUCTION_LEFT,
} from "../../engine/hint-refusal.ts";
import type { OrderedCell } from "../../engine/overlay-sidecar.ts";
import { dimensionParamConfig } from "../../engine/params.ts";
import {
  CURSOR_SELECT,
  CURSOR_SELECT2,
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
import type { RandomState } from "../../engine/random/index.ts";
import { registerGame } from "../../engine/registry.ts";
import type { Color, ConfigValues, Point, Size } from "../../engine/types.ts";
import { newClustersDesc } from "./generator.ts";
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
  DIFF_NAMES,
  decodeParams,
  defaultParams,
  encodeParams,
  F_COLOR_0,
  F_COLOR_1,
  F_SINGLE,
  newState,
  presets,
  status,
  textFormat,
  validateDesc,
  validateParams,
} from "./state.ts";

/** A cell that breaks a rule in the current state (the local rule checker,
 * design D5 — identical to what the board draws live in red). */
export interface ClustersMistake {
  index: number;
}

function newUi(_state: ClustersState): ClustersUi {
  return { cursor: newCursor(), dragType: -1, drag: [] };
}

/** The `paint` letter → fill mapping (upstream 'A'=red, 'B'=blue, 'C'=clear),
 * expressed directly as the {@link ClustersFill} byte. */
function fillFromDragType(dragType: number): ClustersFill {
  return dragType & F_COLOR_0 ? F_COLOR_0 : dragType & F_COLOR_1 ? F_COLOR_1 : 0;
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
    if (button === LEFT_BUTTON) {
      ui.dragType = old === 0 ? F_COLOR_1 : old & F_COLOR_1 ? F_COLOR_0 : 0;
    } else if (button === RIGHT_BUTTON) {
      ui.dragType = old === 0 ? F_COLOR_0 : old & F_COLOR_0 ? F_COLOR_1 : 0;
    } else {
      ui.dragType = 0;
    }
    ui.drag = [];
    if (ui.dragType || old) ui.drag.push(i);
    return UI_UPDATE;
  }

  // --- mouse drag: accrete cells onto the drag set ---
  if (isMouseDrag(button) && ui.dragType !== -1) {
    const i = hy * w + hx;
    if (grid[i] === 0 && ui.dragType === 0) return null;
    if (grid[i] & ui.dragType) return null;
    if (ui.drag.includes(i)) return null;
    ui.drag.push(i);
    return UI_UPDATE;
  }

  // --- mouse release: commit the drag as one paint move ---
  if (isMouseRelease(button) && ui.drag.length > 0) {
    const fill = fillFromDragType(ui.dragType);
    const cells = ui.drag
      .filter((i) => !(grid[i] & F_SINGLE)) // never overwrite a given
      .map((index) => ({ index, fill }));
    ui.drag = [];
    if (cells.length > 0) return { kind: "paint", cells };
    return UI_UPDATE;
  }

  // --- keyboard place-one at the cursor ---
  if (
    ui.cursor.visible &&
    (button === CURSOR_SELECT ||
      button === CURSOR_SELECT2 ||
      isEraseKey(button) ||
      button === 48 /* '0' */ ||
      button === 49 /* '1' */ ||
      button === 50) /* '2' */
  ) {
    const i = hy * w + hx;
    if (grid[i] & F_SINGLE) return null; // given
    const old = grid[i];
    let fill: ClustersFill;
    if (button === 48 || button === 50)
      fill = F_COLOR_0; // '0'/'2' → red
    else if (button === 49)
      fill = F_COLOR_1; // '1' → blue
    else if (button === CURSOR_SELECT2)
      fill = old === 0 ? F_COLOR_0 : old & F_COLOR_0 ? F_COLOR_1 : 0; // cycle red→blue→clear
    else if (button === CURSOR_SELECT)
      fill = old === 0 ? F_COLOR_1 : old & F_COLOR_1 ? F_COLOR_0 : 0; // cycle blue→red→clear
    else fill = 0; // backspace → clear

    // No-op guard (upstream "don't put no-ops on the undo chain").
    if (
      (old & F_COLOR_0 && fill === F_COLOR_0) ||
      (old & F_COLOR_1 && fill === F_COLOR_1) ||
      (old === 0 && fill === 0)
    ) {
      return null;
    }
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

// --- hint (add-clusters-hint) ----------------------------------------------

/** Highlight roles of a Clusters hint step (the render legend — see the
 * COL_HINT block in render.ts). `target` is the forced cell; `danger` is the
 * tile the refuted coloring would break — the only element the narration
 * calls "ringed" — when that isn't the target itself; `chain` is a lookahead
 * firing's what-if walk, each cell marked with the color the hypothesis
 * would force it to. Every other premise tile of the three local rules sits
 * orthogonally adjacent to the target or the danger tile, so it is already
 * in view without a highlight of its own. */
export interface ClustersHintHighlights {
  target: { x: number; y: number };
  danger?: { x: number; y: number };
  /** `order` is the link's 1-based place in the chain, drawn as an ordinal
   * (`drawHintOrdinal`). Carried explicitly rather than left as the array index:
   * the order is the fact the narration cites, so it is data the renderer reads,
   * not a positional convention two files have to agree about. */
  chain: (OrderedCell & { fill: ClustersFill })[];
}

const colorName = (fill: ClustersFill): string => (fill === F_COLOR_0 ? "red" : "blue");

/** Narrate the proof by contradiction: premise → the rule the refuted color
 * breaks → conclusion in the necessity voice (docs/games/hints.md § "Necessity for deductions, imperative for moves", D4).
 *
 * **Where a second mark is on the board, "this cell" is tied to it by geometry**
 * (owner-reported, 2026-08-14: with a solid-filled target *and* a ringed tile on
 * screen, a bare "this cell" points at neither). The fix is deliberately not
 * *"the cell marked purple"* — `hints.md` forbids color as the only cue, and a
 * sentence naming a hue is wrong the moment the scheme flips or the reader is
 * color-blind. It is the relation instead: `contradictionAround` only ever
 * reports the placed cell **or one of its four orthogonal neighbors**, so on
 * every branch below the ringed tile is literally *this cell's neighbor* and
 * the sentence can say so. That identifies both squares at once, and is more
 * informative than the wording it replaces rather than merely longer.
 *
 * The two `at.cell === d.index` branches are left alone on purpose: there is no
 * second mark in those frames, so "this cell" is unambiguous and a
 * disambiguating phrase would be noise. */
function narrate(d: ClustersDeduction): string {
  const f = colorName(d.fill);
  const t = colorName(d.refuted);
  const at = d.reason.at;

  if (d.reason.kind === "chain") {
    // A lookahead firing: one standing hypothesis plus forced single-cell
    // consequences (never nested), shown statically as the marked cells.
    const end =
      at.kind === "dotOvercount"
        ? "the ringed dot would touch a second tile of its own color"
        : at.cell === d.index
          ? at.kind === "surrounded"
            ? `this very cell would be sealed off from every ${t} tile`
            : `this very cell could no longer touch two ${t} tiles`
          : at.kind === "surrounded"
            ? "the ringed tile would be sealed off from its own color"
            : "the ringed tile could no longer touch two of its own color";
    // The chain's break is adjacent to the *last forced cell*, not to the
    // target, so the neighbor relation above is unavailable here. What ties
    // the three marks together instead is that the chain runs **from** this
    // cell — which is also the one fact a reader needs to follow it.
    //
    // **The sentence names the two ends and lets the numbers carry the
    // middle** (`walk-tactic-hint-chains` D5). It used to say the marked cells
    // "would each be forced in turn", which named no order the player could
    // check — the marks were an unordered set — so the only way to verify it
    // was to redo the deduction, the thing docs/games/hints.md § "The forcing
    // boundary" forbids. The consequences are numbered on the board now, and
    // this cites them by number; reciting the links here would put the chain
    // back in the reader's head, which is what the picture exists to prevent.
    //
    // *"from it"* survives the rewrite deliberately: it is the deixis tie the
    // guard in `clusters-hint.test.ts` checks, and the numbering does not
    // replace it. The digits say which consequence came when; they do not say
    // which of the three marks the opening "this cell" means.
    const n = d.reason.steps.length;
    const run =
      n === 1
        ? "cell 1 is then forced from it, and"
        : `cells 1 to ${n} are then forced from it, and by ${n}`;
    return `Suppose this cell were ${t}: ${run} ${end} — impossible. So this cell must be ${f}.`;
  }

  if (at.cell === d.index) {
    if (at.kind === "surrounded") {
      return `Every neighbor of this cell is ${f}. A ${t} tile here could never touch another ${t} tile — so it must be ${f}.`;
    }
    // reachTwo at the cell itself (an empty cell is never a dot). Count- and
    // edge-neutral: at a corner the board edge does part of the hemming, and
    // "at most one" stays honest when one open neighbor remains.
    return `If this cell were ${t}, at most one neighbor could ever match it — and every plain tile must touch two of its color. So it must be ${f}.`;
  }
  if (at.kind === "dotOvercount") {
    return `A dot touches exactly one tile of its own color, and the ringed ${t} dot beside this cell already touches its one. A ${t} here would give it a second — so this cell must be ${f}.`;
  }
  if (at.kind === "surrounded") {
    return `Painting this cell ${t} would seal its ringed ${f} neighbor off from every other ${f} tile — it could never join a cluster. So this cell must be ${f}.`;
  }
  return `If this cell were ${t}, its ringed ${f} neighbor could never touch two ${f} tiles — and every plain tile needs two of its color. So this cell must be ${f}.`;
}

function buildHighlights(d: ClustersDeduction, w: number): ClustersHintHighlights {
  const pt = (i: number): { x: number; y: number } => ({ x: i % w, y: (i / w) | 0 });
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
  if (state.completed) return { ok: false, error: ALREADY_SOLVED };
  if (findMistakes(state).length > 0) {
    return {
      ok: false,
      error: FIX_MISTAKES_FIRST,
    };
  }
  const plan = deduceHintPlan(state.grid, state.w, state.h);
  // COMPLETE certifies the position (the error rules are monotone, so a wrong
  // tile can never extend to a zero-error grid); anything else means some
  // tile already placed must be wrong, and hinting would lead deeper in.
  if (plan.verdict === INVALID) {
    return {
      ok: false,
      error: CONTRADICTION_UNLOCALIZED,
    };
  }
  if (plan.verdict !== COMPLETE || plan.deductions.length === 0) {
    return { ok: false, error: NO_DEDUCTION_LEFT };
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

function flashLength(
  from: ClustersState,
  to: ClustersState,
  _dir: number,
  _ui: ClustersUi,
): number {
  return winFlash(from, to, FLASH_TIME);
}

/** Clusters' difficulty contract (`engine/difficulty.ts`). `solveGame` returns
 * `COMPLETE` / `UNFINISHED` / `INVALID`; its two tiers are nested rungs of one
 * fixpoint (`maxdiff` 0 is `solverTry` alone, ≥ 1 adds `solverRecurse`), which
 * is why `solvableAtExactlyTier` asks the cheap rung first — the deeper solve
 * resumes from that same fixpoint (`add-clusters-difficulty-tiers` D3). */
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
  paramConfig: [
    ...dimensionParamConfig<ClustersParams>(),
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

  newDesc: (p: ClustersParams, rng: RandomState) => newClustersDesc(p, rng),
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
  computeSize: (p: ClustersParams, ts: number): Size => computeSize(p, ts),
  setTileSize,
  newDrawState,
  redraw,

  animLength: () => 0,
  flashLength,
};

registerGame(clustersGame);
