/**
 * Clusters solver — port of `clusters_validate` / `clusters_solver_try` /
 * `clusters_solver_recurse` / `clusters_solve_game` in
 * `puzzles/unreleased/clusters.c`.
 *
 * It is contradiction-based deduction, not guess-and-backtrack search:
 *   - `clustersValidate` classifies a grid COMPLETE / UNFINISHED / INVALID
 *     from local neighbor counts;
 *   - `solverTry` (difficulty 0) forces an empty cell's color whenever the
 *     opposite color would make the board INVALID — a single-cell proof by
 *     contradiction;
 *   - `solverRecurse` (difficulty 1) does the same one hypothetical level
 *     deep, re-running the difficulty-0 fixpoint on a scratch copy.
 * A deterministic proof procedure — so Clusters exposes **no difficulty
 * tiers** (its docs say so), and the sole generation path gates on
 * `solveGame(…, 1)`. Because the generator is solver-gated, this solver's
 * exact verdict on every intermediate board decides which puzzles exist,
 * which is what the byte-match differential validates.
 *
 * ## The `F_ERROR` contamination quirk (byte-match critical)
 *
 * Upstream `clusters_validate` **mutates an `F_ERROR` bit into the grid** on
 * every filled cell (set on a rule violation, cleared otherwise), and the
 * generator never masks it out: it survives the two-color fill (which only
 * rewrites cleared cells), the isolated-cell flip (`^= COLMASK` leaves bit 3
 * untouched), and the reduce-to-dots (`|= F_SINGLE`), so it reaches the
 * prune's *full-byte* `grid[i] == grid[i-1]` comparison. Two adjacent dots
 * that would prune away survive if their `F_ERROR` bits differ. Reproducing
 * this bit is therefore mandatory for byte-match — the mutating validate the
 * solver/generator use ({@link clustersValidate}) writes it exactly as C does.
 * The pure play-side checks ({@link clustersStatus}, {@link findErrors}) do
 * NOT mutate, so persisted state and the renderer stay `F_ERROR`-free.
 */
import { deduceHintPlan as accumulateHintPlan } from "../../engine/hint-plan.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import {
  type ClustersFill,
  COLMASK,
  F_COLOR_0,
  F_COLOR_1,
  F_ERROR,
  F_SINGLE,
} from "./state.ts";

export const COMPLETE = 0;
export const UNFINISHED = 1;
export const INVALID = 2;
export type ClustersStatus = typeof COMPLETE | typeof UNFINISHED | typeof INVALID;

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

/** Same/other/empty orthogonal-neighbor counts of cell `(x,y)` relative to
 * color `col` (a `COLMASK` value), plus how many neighbors exist at all
 * (`max`) — upstream `clusters_count` summed over the four directions. */
function neighborCounts(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  col: number,
): { same: number; other: number; empty: number; max: number } {
  let same = 0;
  let other = 0;
  let empty = 0;
  let max = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    max++;
    const nc = grid[ny * w + nx] & COLMASK;
    if (nc === col) same++;
    else if (nc === 0) empty++;
    else other++;
  }
  return { same, other, empty, max };
}

/** Is the filled cell `i` a rule violation? Upstream `clusters_validate`'s
 * three error conditions:
 *  - wholly surrounded by the other color (`other === max`);
 *  - a dot (`F_SINGLE`) touching more than one same-color neighbor;
 *  - a non-dot that can no longer reach two same-color neighbors
 *    (`other === max - 1`). */
function cellInError(grid: Uint8Array, w: number, h: number, i: number): boolean {
  const cell = grid[i];
  const col = cell & COLMASK;
  const x = i % w;
  const y = (i - x) / w;
  const { same, other, max } = neighborCounts(grid, w, h, x, y, col);
  if (other === max) return true;
  if (cell & F_SINGLE && same > 1) return true;
  if (!(cell & F_SINGLE) && other === max - 1) return true;
  return false;
}

/** Core classifier. `markGrid` writes the `F_ERROR` bit into `grid` exactly as
 * upstream does (the byte-match quirk above); `errors`, if given, collects the
 * offending cell indices (for the pure play-side checks). An empty cell (byte
 * 0) downgrades COMPLETE to UNFINISHED. */
function classify(
  grid: Uint8Array,
  w: number,
  h: number,
  markGrid: boolean,
  errors?: number[],
): ClustersStatus {
  const s = w * h;
  let anyEmpty = false;
  let anyError = false;
  for (let i = 0; i < s; i++) {
    if (grid[i] === 0) {
      anyEmpty = true;
      continue;
    }
    if (cellInError(grid, w, h, i)) {
      anyError = true;
      errors?.push(i);
      if (markGrid) grid[i] |= F_ERROR;
    } else if (markGrid) {
      grid[i] &= ~F_ERROR;
    }
  }
  if (anyError) return INVALID;
  return anyEmpty ? UNFINISHED : COMPLETE;
}

/** The generator/solver validate: classifies AND mutates the `F_ERROR` bit
 * into `grid` (upstream fidelity — see the module note). */
export function clustersValidate(
  grid: Uint8Array,
  w: number,
  h: number,
): ClustersStatus {
  return classify(grid, w, h, true);
}

/** Pure classifier for the play side (executeMove / solve) — no mutation. */
export function clustersStatus(grid: Uint8Array, w: number, h: number): ClustersStatus {
  return classify(grid, w, h, false);
}

/** The indices of every cell that breaks a rule — pure, for `findMistakes`
 * and the live-error renderer. */
export function findErrors(grid: Uint8Array, w: number, h: number): number[] {
  const errors: number[] = [];
  classify(grid, w, h, false, errors);
  return errors;
}

/** Difficulty-0 deduction: for each empty cell, if coloring it one way makes
 * the board INVALID, force the other color. Returns how many cells it fixed
 * (0 = no progress). Mutates `grid` in place (including its `F_ERROR` bits). */
function solverTry(grid: Uint8Array, w: number, h: number): number {
  const s = w * h;
  let ret = 0;
  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) continue;
    for (let d = 0; d <= 1; d++) {
      grid[i] = d ? F_COLOR_1 : F_COLOR_0;
      if (clustersValidate(grid, w, h) === INVALID) {
        grid[i] = d ? F_COLOR_0 : F_COLOR_1; // forced to the opposite color
        ret++;
        break;
      }
      grid[i] = 0; // no contradiction — undo and try the other color
    }
  }
  return ret;
}

/** Difficulty-1 lookahead: for each empty cell, tentatively color it and run
 * the whole difficulty-0 fixpoint on a scratch copy; if that reaches a
 * contradiction, force the opposite color. Mutates `grid` in place. */
function solverRecurse(grid: Uint8Array, w: number, h: number): number {
  const s = w * h;
  let ret = 0;
  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) continue;
    for (let d = 0; d <= 1; d++) {
      const snapshot = grid.slice();
      grid[i] = d ? F_COLOR_1 : F_COLOR_0;
      const result = solveGame(grid, w, h, 0);
      grid.set(snapshot); // undo the whole hypothetical, cell i included
      if (result === INVALID) {
        grid[i] = d ? F_COLOR_0 : F_COLOR_1;
        ret++;
        break;
      }
    }
  }
  return ret;
}

/** Run the solver to a fixpoint. `maxdiff` 0 uses `solverTry` only; ≥ 1 adds
 * `solverRecurse`. Returns the final verdict — COMPLETE if fully solved,
 * INVALID on a contradiction, UNFINISHED if it gets stuck. Mutates `grid`. */
export function solveGame(
  grid: Uint8Array,
  w: number,
  h: number,
  maxdiff: number,
): ClustersStatus {
  for (;;) {
    const st = clustersValidate(grid, w, h);
    if (st !== UNFINISHED) return st;
    if (solverTry(grid, w, h) > 0) continue;
    if (maxdiff < 1) return UNFINISHED;
    if (solverRecurse(grid, w, h) > 0) continue;
    return UNFINISHED;
  }
}

// --- hint plan (add-clusters-hint) -----------------------------------------
//
// A *parallel recorder* over the same contradiction deduction (the Undead /
// Pattern shape, docs/games/hints.md § "A non-Latin candidate game (Undead)"/§5.6a): separate code reusing this
// module's primitives, so the generator's `solveGame`/`clustersValidate` path
// above stays byte-identical by construction — no recorder flag threads
// through it. Where the generator only needs *that* a coloring is refuted,
// the hint also needs *why* (which rule trips, at which cell, on which
// premise), so each firing re-derives its contradiction in detail.
//
// The plan discipline deliberately differs from `solveGame`'s pass-sweeps:
// single-cell firings restart the row-major scan after each firing (one
// deduction = one plan step, cheapest first), and a lookahead stall takes the
// firing whose forcing chain is *shortest* (measured: median 2–3 forced cells
// vs 6 for first-in-scan-order — see the change's design.md D2/D3). Both
// rungs are deterministic, so a recomputed plan continues exactly where the
// previous one left off. Confluence makes the different order safe: a
// refuted coloring stays refuted as more cells fill in (the three error
// conditions are monotone — filling cells can only create errors, never cure
// them), so any scan order reaches the same verdict as the C solver's.

/** Which of `cellInError`'s three clauses a refuted coloring trips. */
export type ClustersRuleKind = "surrounded" | "dotOvercount" | "reachTwo";

/** The rule violation a refuted coloring runs into: `cell` is where the
 * board breaks (the tentatively-colored cell itself, or a neighbor). */
export interface ClustersContradiction {
  kind: ClustersRuleKind;
  cell: number;
}

/** One forced consequence inside a lookahead hypothetical. */
export interface ChainStep {
  index: number;
  fill: ClustersFill;
}

export type ClustersReason =
  | { kind: "direct"; at: ClustersContradiction }
  | { kind: "chain"; steps: ChainStep[]; at: ClustersContradiction };

/** One forced move: coloring `index` with `refuted` breaks `reason`, so it
 * must be `fill`. No separate evidence list: every premise tile of the three
 * local rules sits orthogonally adjacent to the broken cell, so the target /
 * danger highlights already put the evidence in view. */
export interface ClustersDeduction {
  index: number;
  fill: ClustersFill;
  refuted: ClustersFill;
  reason: ClustersReason;
}

/** The whole remaining plan. `verdict` COMPLETE means the deductions solve
 * the board — which also *certifies the position*: the error conditions are
 * monotone, so a complete zero-error grid is the unique solution, and a
 * position containing a wrong tile can only end INVALID or UNFINISHED. */
export interface ClustersHintPlan {
  verdict: ClustersStatus;
  deductions: ClustersDeduction[];
}

const opposite = (fill: ClustersFill): ClustersFill =>
  fill === F_COLOR_0 ? F_COLOR_1 : F_COLOR_0;

/** Which clause the filled cell `i` trips, in `cellInError`'s order. */
function errorKind(
  grid: Uint8Array,
  w: number,
  h: number,
  i: number,
): ClustersRuleKind | null {
  const cell = grid[i];
  if ((cell & COLMASK) === 0) return null;
  const x = i % w;
  const y = (i - x) / w;
  const { same, other, max } = neighborCounts(grid, w, h, x, y, cell & COLMASK);
  if (other === max) return "surrounded";
  if (cell & F_SINGLE && same > 1) return "dotOvercount";
  if (!(cell & F_SINGLE) && other === max - 1) return "reachTwo";
  return null;
}

/** After filling cell `i` on an otherwise error-free board, a new violation
 * can only sit at `i` or an orthogonal neighbor (the three error conditions
 * read one cell's neighborhood). Returns the first, preferring `i` itself. */
function contradictionAround(
  grid: Uint8Array,
  w: number,
  h: number,
  i: number,
): ClustersContradiction | null {
  const kind = errorKind(grid, w, h, i);
  if (kind) return { kind, cell: i };
  const x = i % w;
  const y = (i - x) / w;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const n = ny * w + nx;
    const nKind = errorKind(grid, w, h, n);
    if (nKind) return { kind: nKind, cell: n };
  }
  return null;
}

/** The first single-cell contradiction firing in row-major order (red tried
 * first, as `solverTry` does), or null at a stall. Leaves `grid` unchanged. */
function firstDirectDeduction(
  grid: Uint8Array,
  w: number,
  h: number,
): ClustersDeduction | null {
  const s = w * h;
  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) continue;
    for (let d = 0; d <= 1; d++) {
      const refuted: ClustersFill = d ? F_COLOR_1 : F_COLOR_0;
      grid[i] = refuted;
      const at = contradictionAround(grid, w, h, i);
      grid[i] = 0;
      if (at) {
        return {
          index: i,
          fill: opposite(refuted),
          refuted,
          reason: { kind: "direct", at },
        };
      }
    }
  }
  return null;
}

/** Play out the hypothetical "cell `i` is `refuted`": propagate single-cell
 * forcings one at a time (restarting the scan after each, stopping the moment
 * the board breaks). Returns the forced chain and the final contradiction, or
 * null when the hypothetical settles without breaking (not refuted this way).
 * Operates on a scratch copy. */
function chainToContradiction(
  grid: Uint8Array,
  w: number,
  h: number,
  i: number,
  refuted: ClustersFill,
  budget: { tick(): void },
): { steps: ChainStep[]; at: ClustersContradiction } | null {
  const s = w * h;
  const dup = grid.slice();
  dup[i] = refuted;
  const steps: ChainStep[] = [];
  let at = contradictionAround(dup, w, h, i);
  if (at) return { steps, at };
  for (;;) {
    budget.tick();
    let fired = false;
    for (let j = 0; j < s && !fired; j++) {
      if (dup[j] !== 0) continue;
      for (let d = 0; d <= 1; d++) {
        const t: ClustersFill = d ? F_COLOR_1 : F_COLOR_0;
        dup[j] = t;
        if (contradictionAround(dup, w, h, j)) {
          const fill = opposite(t);
          dup[j] = fill;
          steps.push({ index: j, fill });
          at = contradictionAround(dup, w, h, j);
          if (at) return { steps, at };
          fired = true;
          break;
        }
        dup[j] = 0;
      }
    }
    if (!fired) return null;
  }
}

/** At a single-cell stall, the lookahead firing whose forcing chain is
 * shortest (earliest in scan order on a tie — deterministic, so a recomputed
 * plan picks the same firing). Leaves `grid` unchanged. */
function shortestChainDeduction(
  grid: Uint8Array,
  w: number,
  h: number,
  budget: { tick(): void },
): ClustersDeduction | null {
  const s = w * h;
  let best: {
    index: number;
    refuted: ClustersFill;
    chain: { steps: ChainStep[]; at: ClustersContradiction };
  } | null = null;
  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) continue;
    for (let d = 0; d <= 1; d++) {
      const refuted: ClustersFill = d ? F_COLOR_1 : F_COLOR_0;
      const chain = chainToContradiction(grid, w, h, i, refuted, budget);
      if (chain) {
        if (!best || chain.steps.length < best.chain.steps.length) {
          best = { index: i, refuted, chain };
        }
        break; // this cell is decided; its other color needs no trial
      }
    }
  }
  if (!best) return null;
  return {
    index: best.index,
    fill: opposite(best.refuted),
    refuted: best.refuted,
    reason: { kind: "chain", steps: best.chain.steps, at: best.chain.at },
  };
}

/** Run the deduction from the player's current grid, recording every forced
 * move in order with the rule its refuted coloring would break — the data a
 * hint narrates. Single-cell firings lead; a stall falls back to the
 * shortest-chain lookahead firing. Operates on a clone. */
export function deduceHintPlan(
  grid0: Uint8Array,
  w: number,
  h: number,
): ClustersHintPlan {
  // Hint-only path, so the budget is unconditional (Palisade precedent).
  const budget = stepBudget("clusters hint");
  const { status, plan } = accumulateHintPlan<
    Uint8Array,
    ClustersDeduction,
    ClustersStatus
  >({
    board: grid0.slice(),
    status: (grid) => clustersStatus(grid, w, h),
    incomplete: UNFINISHED,
    next: (grid) =>
      firstDirectDeduction(grid, w, h) ?? shortestChainDeduction(grid, w, h, budget),
    apply: (grid, d) => {
      grid[d.index] = d.fill;
    },
    budget,
  });
  return { verdict: status, deductions: plan };
}
