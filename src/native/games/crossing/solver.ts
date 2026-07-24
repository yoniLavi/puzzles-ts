/**
 * The Crossing deductive solver — `crossing_solve_game` and its two techniques
 * from `unreleased/crossing.c`.
 *
 * The solver keeps a per-cell candidate bitmask (bit `n-1` = digit `n`) and runs
 * two deductions to a fixpoint:
 *
 * 1. **positional narrowing** (`crossing_solver_marks`) — for each run, take
 *    every not-yet-placed number of the run's length that still fits the current
 *    candidates, union each of its digits into a per-position accumulator, then
 *    intersect each open cell's candidates with that accumulator. A cell can
 *    only hold a digit that *some* still-fitting number puts there.
 * 2. **naked single** (`crossing_solver_confirm`) — a cell whose candidates
 *    collapse to one digit is placed.
 *
 * Upstream has exactly this one technique tier (`// TODO harder techniques?`)
 * and no difficulty parameter, so there is no grading. Since the generator
 * accepts a board only when this solver reaches `"valid"`, the solver's exact
 * strength is baked into which puzzles exist — the byte-match differential
 * covers it end to end.
 */

import {
  type CrossingPuzzle,
  type CrossingState,
  type SolveStatus,
  validateBoard,
} from "./state.ts";

/** Candidate bit for digit `n` (1–9) — upstream `NUM_BIT`. */
const bit = (n: number): number => 1 << (n - 1);
/** Every digit `1`–`9` is a candidate (upstream `0x1ff`). */
const ALL_DIGITS = 0x1ff;

export interface CrossingSolveResult {
  status: SolveStatus;
  /** The grid the solver reached — complete iff `status === "valid"`. */
  grid: Uint8Array;
}

/**
 * Positional narrowing. Returns the number of cells whose candidate set the
 * pass touched.
 *
 * The termination argument is worth stating, because upstream's counter looks
 * like it could spin: a cell is counted whenever `cand !== acc`, not only when
 * the intersection actually removes something. But a number contributes to
 * `acc[k]` only if *every* one of its digits is still a candidate in its cell,
 * so `acc[k] ⊆ cand[cell]` always holds — a difference therefore means a strict
 * subset, and the intersection strictly shrinks. The fixpoint is monotone.
 */
function solverMarks(
  puzzle: CrossingPuzzle,
  grid: Uint8Array,
  cand: Int32Array,
  done: Int32Array,
): number {
  const { numbers, runs } = puzzle;
  let changed = 0;

  for (const run of runs) {
    const cells = run.cells;
    const acc = new Int32Array(cells.length);

    for (let l = 0; l < numbers.length; l++) {
      if (done[l]) continue; // this number is already placed somewhere
      const num = numbers[l];
      if (num.length !== cells.length) continue;

      let fits = true;
      for (let k = 0; k < cells.length; k++) {
        if (!(cand[cells[k]] & bit(num.charCodeAt(k) - 48))) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;

      for (let k = 0; k < cells.length; k++) acc[k] |= bit(num.charCodeAt(k) - 48);
    }

    for (let k = 0; k < cells.length; k++) {
      const i = cells[k];
      if (!grid[i] && cand[i] !== acc[k]) {
        changed++;
        cand[i] &= acc[k];
      }
    }
  }

  return changed;
}

/** Naked singles. Upstream scans `j` from 0, where `NUM_BIT(0)` is a shift by
 * −1 that no live mask can equal; the loop starts at 1 here, which is the same
 * set of placements. */
function solverConfirm(grid: Uint8Array, cand: Int32Array): number {
  let changed = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) continue;
    for (let n = 1; n <= 9; n++) {
      if (cand[i] === bit(n)) {
        changed++;
        grid[i] = n;
      }
    }
  }
  return changed;
}

/**
 * Run the solver from `start` (default: an empty grid). Mutates neither
 * argument. `"valid"` means the puzzle was solved outright — every run full and
 * every number used exactly once — which is what the generator gates on.
 */
export function solveCrossing(
  puzzle: CrossingPuzzle,
  start?: Uint8Array,
): CrossingSolveResult {
  const { w, h, walls } = puzzle;
  const grid = start ? start.slice() : new Uint8Array(w * h);
  const cand = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) cand[i] = walls[i] ? 0 : ALL_DIGITS;

  let status: SolveStatus;
  for (;;) {
    const verdict = validateBoard(puzzle, grid);
    status = verdict.status;
    if (status !== "progress") break;

    let changed = 0;
    changed += solverMarks(puzzle, grid, cand, verdict.done);
    changed += solverConfirm(grid, cand);
    if (changed) continue;

    break; // stuck: no harder techniques exist upstream
  }

  return { status, grid };
}

// --- mistake checking (fork addition) --------------------------------------

/** A player marking that contradicts the puzzle's unique solution. */
export interface CrossingMistake {
  x: number;
  y: number;
  /** `"cell"` — the entered digit is wrong; `"note"` — the cell's pencil notes
   * have ruled out the digit that belongs there. */
  kind: "cell" | "note";
}

/**
 * Check & Save's mistake check (playbook §3.5): re-solve the puzzle from the
 * walls and numbers alone, then flag every player marking the unique solution
 * contradicts — a wrong entered digit, and (per the cross-game
 * notes-are-first-class convention, playbook §3.7) an empty cell whose
 * *non-empty* notes exclude the solution's digit. Notes carrying merely extra
 * candidates are ordinary mid-solve state and are not flagged.
 *
 * Returns `[]` when the board is not uniquely determined by its clues, so the
 * check never judges a position it cannot prove.
 */
export function findCrossingMistakes(state: CrossingState): CrossingMistake[] {
  const { w, h, walls } = state.puzzle;
  const solved = solveCrossing(state.puzzle);
  if (solved.status !== "valid") return [];

  const out: CrossingMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (walls[i]) continue;
      const answer = solved.grid[i];
      const entered = state.grid[i];
      if (entered !== 0) {
        if (entered !== answer) out.push({ x, y, kind: "cell" });
      } else if (state.marks[i] !== 0 && !(state.marks[i] & (1 << (answer - 1)))) {
        out.push({ x, y, kind: "note" });
      }
    }
  }
  return out;
}
