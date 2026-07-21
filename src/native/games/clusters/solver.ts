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
import { COLMASK, F_COLOR_0, F_COLOR_1, F_ERROR, F_SINGLE } from "./state.ts";

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
