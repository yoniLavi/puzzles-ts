/**
 * Clusters solver — port of `clusters_validate` / `clusters_solver_try` /
 * `clusters_solver_recurse` / `clusters_solve_game` in
 * `puzzles/unreleased/clusters.c`.
 *
 * It is contradiction-based deduction, not guess-and-backtrack search:
 *   - `clustersValidate` classifies a grid COMPLETE / UNFINISHED / INVALID
 *     from local neighbour counts;
 *   - `solverTry` (difficulty 0) forces an empty cell's colour whenever the
 *     opposite colour would make the board INVALID — a single-cell proof by
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
 * generator never masks it out: it survives the two-colour fill (which only
 * rewrites cleared cells), the isolated-cell flip (`^= COLMASK` leaves bit 3
 * untouched), and the reduce-to-dots (`|= F_SINGLE`), so it reaches the
 * prune's *full-byte* `grid[i] == grid[i-1]` comparison. Two adjacent dots
 * that would prune away survive if their `F_ERROR` bits differ. Reproducing
 * this bit is therefore mandatory for byte-match — the mutating validate the
 * solver/generator use ({@link clustersValidate}) writes it exactly as C does.
 * The pure play-side checks ({@link clustersStatus}, {@link findErrors}) do
 * NOT mutate, so persisted state and the renderer stay `F_ERROR`-free.
 */
// The shared `accumulateHintPlan` no longer fits: its walk records every firing
// `next` returns, and this plan must keep *walking* past the stall (to certify
// the position) while it stops *recording* there. See `deduceHintPlan`.
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

/** Same/other/empty orthogonal-neighbour counts of cell `(x,y)` relative to
 * colour `col` (a `COLMASK` value), plus how many neighbours exist at all
 * (`max`) — upstream `clusters_count` summed over the four directions. */
function neighbourCounts(
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
 *  - wholly surrounded by the other colour (`other === max`);
 *  - a dot (`F_SINGLE`) touching more than one same-colour neighbour;
 *  - a non-dot that can no longer reach two same-colour neighbours
 *    (`other === max - 1`). */
function cellInError(grid: Uint8Array, w: number, h: number, i: number): boolean {
  const cell = grid[i];
  const col = cell & COLMASK;
  const x = i % w;
  const y = (i - x) / w;
  const { same, other, max } = neighbourCounts(grid, w, h, x, y, col);
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

/** Difficulty-0 deduction: for each empty cell, if colouring it one way makes
 * the board INVALID, force the other colour. Returns how many cells it fixed
 * (0 = no progress). Mutates `grid` in place (including its `F_ERROR` bits). */
function solverTry(grid: Uint8Array, w: number, h: number): number {
  const s = w * h;
  let ret = 0;
  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) continue;
    for (let d = 0; d <= 1; d++) {
      grid[i] = d ? F_COLOR_1 : F_COLOR_0;
      if (clustersValidate(grid, w, h) === INVALID) {
        grid[i] = d ? F_COLOR_0 : F_COLOR_1; // forced to the opposite colour
        ret++;
        break;
      }
      grid[i] = 0; // no contradiction — undo and try the other colour
    }
  }
  return ret;
}

/** Difficulty-1 lookahead: for each empty cell, tentatively colour it and run
 * the whole difficulty-0 fixpoint on a scratch copy; if that reaches a
 * contradiction, force the opposite colour. Mutates `grid` in place. */
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
// through it. Where the generator only needs *that* a colouring is refuted,
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
// refuted colouring stays refuted as more cells fill in (the three error
// conditions are monotone — filling cells can only create errors, never cure
// them), so any scan order reaches the same verdict as the C solver's.

/** Which of `cellInError`'s three clauses a refuted colouring trips. */
export type ClustersRuleKind = "surrounded" | "dotOvercount" | "reachTwo";

/** The rule violation a refuted colouring runs into: `cell` is where the
 * board breaks (the tentatively-coloured cell itself, or a neighbour). */
export interface ClustersContradiction {
  kind: ClustersRuleKind;
  cell: number;
}

/**
 * Why a move is forced. **One kind, deliberately** — this used to have a second,
 * `chain`, carrying a lookahead hypothetical's forced consequences
 * (`audit-guessing-tier-names`, design D4/D8).
 *
 * That rung hypothesises a colour and *propagates* the cells it forces until the
 * board breaks, which is a multi-step search: the collection classes that as
 * non-deductive and permits it only on an `Unreasonable` board, and a hint may
 * not present a search result as a technique on any tier. The whole
 * `chainToContradiction` / `shortestChainDeduction` machinery went with it
 * rather than being left unreachable — it was hint-only, so nothing else called
 * it, and machinery that claims a capability the hint no longer has is exactly
 * the kind of dead narration this audit exists to remove.
 *
 * **What that costs, measured rather than assumed**: on `Easy` boards, nothing —
 * 100% of plan steps are direct, over 20 boards. On `Unreasonable` boards the
 * hint still explains **94%** (8x8) to **96%** (10x10) of the plan and stops at a
 * median of **1–2** points per board; it is *never* the first step, so the hint
 * is never useless from move one. `solveGame` — which the generator gates on —
 * keeps the rung, so no board changed.
 */
export type ClustersReason = { kind: "direct"; at: ClustersContradiction };

/** One forced move: colouring `index` with `refuted` breaks `reason`, so it
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
  const { same, other, max } = neighbourCounts(grid, w, h, x, y, cell & COLMASK);
  if (other === max) return "surrounded";
  if (cell & F_SINGLE && same > 1) return "dotOvercount";
  if (!(cell & F_SINGLE) && other === max - 1) return "reachTwo";
  return null;
}

/** After filling cell `i` on an otherwise error-free board, a new violation
 * can only sit at `i` or an orthogonal neighbour (the three error conditions
 * read one cell's neighbourhood). Returns the first, preferring `i` itself. */
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

/**
 * Play out the hypothetical "cell `i` is `refuted`": propagate single-cell
 * forcings one at a time (restarting the scan after each, stopping the moment
 * the board breaks). Returns the forced placement, or null when the
 * hypothetical settles without breaking (not refuted this way). Operates on a
 * scratch copy.
 *
 * **Used to certify the position, never to narrate one** — see
 * {@link ClustersReason}. It records no chain because nothing may read one.
 */
function refutedByChain(
  grid: Uint8Array,
  w: number,
  h: number,
  i: number,
  refuted: ClustersFill,
  budget: { tick(): void },
): boolean {
  const s = w * h;
  const dup = grid.slice();
  dup[i] = refuted;
  if (contradictionAround(dup, w, h, i)) return true;
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
          if (contradictionAround(dup, w, h, j)) return true;
          fired = true;
          break;
        }
        dup[j] = 0;
      }
    }
    if (!fired) return false;
  }
}

/** At a single-cell stall, the first lookahead-forced placement in scan order.
 * Carries no reason: it exists to advance the certifying walk, and a hint may
 * not narrate it. Leaves `grid` unchanged. */
function chainPlacement(
  grid: Uint8Array,
  w: number,
  h: number,
  budget: { tick(): void },
): { index: number; fill: ClustersFill } | null {
  const s = w * h;
  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) continue;
    for (let d = 0; d <= 1; d++) {
      const refuted: ClustersFill = d ? F_COLOR_1 : F_COLOR_0;
      if (refutedByChain(grid, w, h, i, refuted, budget)) {
        return { index: i, fill: opposite(refuted) };
      }
    }
  }
  return null;
}

/**
 * Run the deduction from the player's current grid, recording every forced move
 * in order with the rule its refuted colouring would break — the data a hint
 * narrates. Operates on a clone.
 *
 * **Two jobs, and they part company at the first stall**
 * (`audit-guessing-tier-names`, design D4/D8):
 *
 * - `deductions` records **single-cell firings only**, and stops for good at the
 *   first point where the board needs the lookahead. A multi-step search with
 *   backtracking is non-deductive — permitted on an `Unreasonable` *board*, but
 *   never something a hint may present as a technique. Recording *past* the
 *   stall would be worse than stopping: the following steps assume a deduction
 *   the player was never shown.
 * - `verdict` is computed by walking the whole board, lookahead included,
 *   because it is what **certifies the position** — `COMPLETE` proves no tile
 *   already placed is wrong (the error rules are monotone), and `hint` refuses
 *   outright without it. Using the search to *check* is not using it to *teach*.
 *
 * Measured when the rung was withdrawn from narration: on `Easy` boards nothing
 * changes (100% of plan steps were already direct); on `Unreasonable` boards the
 * plan still explains **94%** (8x8) to **96%** (10x10) of the board and stalls at
 * a median of **1–2** points, never at the first step. `solveGame` — which the
 * generator gates on — is untouched, so no board moved.
 */
export function deduceHintPlan(
  grid0: Uint8Array,
  w: number,
  h: number,
): ClustersHintPlan {
  // Hint-only path, so the budget is unconditional (Palisade precedent).
  const budget = stepBudget("clusters hint");
  const grid = grid0.slice();
  const deductions: ClustersDeduction[] = [];
  let stalled = false;

  for (;;) {
    budget.tick();
    const status = clustersStatus(grid, w, h);
    if (status !== UNFINISHED) return { verdict: status, deductions };

    const direct = firstDirectDeduction(grid, w, h);
    if (direct) {
      if (!stalled) deductions.push(direct);
      grid[direct.index] = direct.fill;
      continue;
    }

    const forced = chainPlacement(grid, w, h, budget);
    if (!forced) return { verdict: UNFINISHED, deductions };
    stalled = true; // everything past here rests on a search; narrate none of it
    grid[forced.index] = forced.fill;
  }
}
