/**
 * The ABCD deductive solver — idiomatic port of `abcd_solve_game` (`abcd.c`).
 *
 * A fixpoint of three deduction techniques over a working grid, a per-cell
 * candidate cube and a `remaining[]` count per (row/column, letter):
 *
 *  1. **Satisfied clue** — when a line already holds its full count of a letter
 *     (`remaining === 0`), rule that letter out of every cell in that line.
 *  2. **Single possibility** — a cell with exactly one surviving candidate is
 *     that letter; place it.
 *  3. **Runs** ({@link solverRuns}) — within a line, partition the still-open
 *     cells where a letter is a candidate into maximal runs; a run of length L
 *     can hold at most `⌈L/2⌉` copies without two touching. When the summed
 *     maximum over a line equals the required count, every odd-length run is
 *     forced onto its even offsets.
 *
 * Techniques 1+2 rerun to a fixpoint before technique 3 is tried again
 * (upstream's `if (busy) continue;`), then the grid is classified.
 *
 * This is arithmetic over the candidate cube, not a Latin square: the
 * constraint is a per-line count plus a no-touch rule, so `engine/latin.ts`
 * does not apply.
 *
 * Upstream has no diagonal-specific techniques (the runs technique ignores
 * diagonal adjacency). That weaker solver is the difficulty curve it shipped,
 * not a defect to fix, and it still generates valid diag puzzles because
 * {@link placeLetter} rules out diagonal neighbors.
 */

import {
  type AbcdParams,
  cuboid,
  EMPTY,
  horClue,
  NO_NUMBER,
  validatePuzzle,
  verClue,
} from "./state.ts";

/** One pencil-mark cleanup: strike candidate `letter` at `(x, y)`. */
export interface AbcdMark {
  x: number;
  y: number;
  letter: number;
}

/**
 * The *obvious* pencil-mark eliminations given the placed letters, for the
 * adaptive mark-all — ABCD's analog of the Latin family's row/column duplicate
 * strikes (docs/games/mechanics.md § "Pencil marks: the full note-taking UX").
 * A penciled candidate `c` in an empty cell is struck when either:
 *   - an orthogonal (or, under `diag`, diagonal) neighbor already holds `c`; or
 *   - `c`'s row or column already holds its full clue count of `c`.
 * Both are the solver's cheapest deductions (technique 1 and
 * {@link placeLetter}'s neighbor rule-outs), so a struck mark is never one a
 * legal solution could keep. Like `obviousCandidateMarks`, it never strikes a
 * cell's last remaining candidate.
 */
export function abcdObviousMarks(
  p: AbcdParams,
  grid: Int8Array,
  pencil: Uint8Array,
  numbers: Int32Array,
): AbcdMark[] {
  const { w, h, n, diag } = p;

  // Placed count per (row, letter) and (column, letter).
  const rowCount = new Int32Array(h * n);
  const colCount = new Int32Array(w * n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y * w + x];
      if (c !== EMPTY) {
        rowCount[y * n + c]++;
        colCount[x * n + c]++;
      }
    }
  }

  const adjacentHas = (x: number, y: number, c: number): boolean => {
    const at = (ax: number, ay: number) =>
      ax >= 0 && ax < w && ay >= 0 && ay < h && grid[ay * w + ax] === c;
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) return true;
    if (diag)
      return (
        at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1)
      );
    return false;
  };

  const marks: AbcdMark[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] !== EMPTY) continue;

      const noted: number[] = [];
      for (let c = 0; c < n; c++) if (pencil[cuboid(x, y, c, n, w)]) noted.push(c);
      if (noted.length === 0) continue;

      const removable = noted.filter((c) => {
        if (adjacentHas(x, y, c)) return true;
        const rowClue = numbers[horClue(y, c, n)];
        const colClue = numbers[verClue(x, c, n, h)];
        return (
          (rowClue !== NO_NUMBER && rowCount[y * n + c] >= rowClue) ||
          (colClue !== NO_NUMBER && colCount[x * n + c] >= colClue)
        );
      });

      // Never empty a cell: if every note is removable, keep the lowest.
      if (removable.length === noted.length) removable.shift();
      for (const c of removable) marks.push({ x, y, letter: c });
    }
  }
  return marks;
}

export type SolveStatus = "solved" | "ambiguous" | "contradiction";

export interface AbcdSolveResult {
  status: SolveStatus;
  /** The working grid at the end (the unique solution when `status` is
   * `"solved"`; a partial/contradictory fill otherwise). */
  grid: Int8Array;
}

/**
 * Place `letter` at `(x, y)`: set the grid cell, rule the other letters out of
 * the cell and `letter` out of its orthogonal (and, under `diag`, diagonal)
 * neighbors, and, when `remaining` is supplied, decrement the letter's row and
 * column counts. The generator passes no `remaining`, using it only to keep a
 * partial fill no-touch-legal. Upstream's `abcd_place_letter`.
 */
export function placeLetter(
  p: AbcdParams,
  grid: Int8Array,
  cube: Uint8Array,
  x: number,
  y: number,
  letter: number,
  remaining?: Int32Array,
): void {
  const { w, h, n, diag } = p;
  grid[y * w + x] = letter;

  // Rule out all other letters in this square.
  for (let i = 0; i < n; i++) {
    if (i !== letter) cube[cuboid(x, y, i, n, w)] = 0;
  }

  // Rule out this letter for adjacent squares.
  if (diag && x > 0 && y > 0) cube[cuboid(x - 1, y - 1, letter, n, w)] = 0;
  if (diag && x < w - 1 && y > 0) cube[cuboid(x + 1, y - 1, letter, n, w)] = 0;
  if (diag && x > 0 && y < h - 1) cube[cuboid(x - 1, y + 1, letter, n, w)] = 0;
  if (diag && x < w - 1 && y < h - 1) cube[cuboid(x + 1, y + 1, letter, n, w)] = 0;
  if (x > 0) cube[cuboid(x - 1, y, letter, n, w)] = 0;
  if (x < w - 1) cube[cuboid(x + 1, y, letter, n, w)] = 0;
  if (y > 0) cube[cuboid(x, y - 1, letter, n, w)] = 0;
  if (y < h - 1) cube[cuboid(x, y + 1, letter, n, w)] = 0;

  if (remaining) {
    const row = horClue(y, letter, n);
    const col = verClue(x, letter, n, h);
    if (remaining[row] !== NO_NUMBER) remaining[row]--;
    if (remaining[col] !== NO_NUMBER) remaining[col]--;
  }
}

/** Technique 3 (`abcd_solver_runs`), one letter `c` across every row
 * (`horizontal`) or column. Returns whether it placed anything. */
function solverRuns(
  p: AbcdParams,
  grid: Int8Array,
  cube: Uint8Array,
  remaining: Int32Array,
  horizontal: boolean,
  c: number,
): boolean {
  const { w, h, n } = p;
  const amx = horizontal ? h : w;
  const bmx = horizontal ? w : h;
  const runLen = new Int32Array(bmx);
  const runStart = new Int32Array(bmx);
  let action = false;

  for (let a = 0; a < amx; a++) {
    const req = horizontal
      ? remaining[horClue(a, c, n)]
      : remaining[verClue(a, c, n, h)];
    if (req === NO_NUMBER || req === 0) continue;

    // Collect maximal open runs where `c` is still a candidate.
    let runs = 0;
    runLen.fill(0);
    runStart.fill(0);
    for (let b = 0; b < bmx; b++) {
      const x = horizontal ? b : a;
      const y = horizontal ? a : b;
      if (cube[cuboid(x, y, c, n, w)] && grid[y * w + x] === EMPTY) {
        if (runLen[runs] === 0) runStart[runs] = b;
        runLen[runs]++;
      } else if (runLen[runs] !== 0) {
        runs++;
      }
    }
    if (runLen[runs] !== 0) runs++;

    // Max letters placeable = Σ ⌈len/2⌉.
    let maxletters = 0;
    for (let i = 0; i < runs; i++) maxletters += (runLen[i] + 1) >> 1;

    // If the maximum equals the requirement, every odd-length run is forced
    // onto its even offsets.
    if (maxletters === req) {
      for (let i = 0; i < runs; i++) {
        if (runLen[i] & 1) {
          action = true;
          for (let b = runStart[i]; b <= runStart[i] + runLen[i]; b += 2) {
            const x = horizontal ? b : a;
            const y = horizontal ? a : b;
            placeLetter(p, grid, cube, x, y, c, remaining);
          }
        }
      }
    }
  }
  return action;
}

/** Run the deductive solver on `numbers` from a blank board. */
export function solveAbcd(p: AbcdParams, numbers: Int32Array): AbcdSolveResult {
  const { w, h, n } = p;
  const a = w * h;
  const grid = new Int8Array(a).fill(EMPTY);
  const cube = new Uint8Array(a * n).fill(1); // all candidates open
  const remaining = Int32Array.from(numbers); // editable per-line counts

  let busy = true;
  let contradiction = false;

  while (busy && !contradiction) {
    busy = false;

    // Technique 1 — satisfied/exhausted clue.
    for (let c = 0; c < n; c++) {
      for (let y = 0; y < h; y++) {
        if (remaining[horClue(y, c, n)] === 0) {
          busy = true;
          remaining[horClue(y, c, n)] = NO_NUMBER;
          for (let x = 0; x < w; x++) cube[cuboid(x, y, c, n, w)] = 0;
        }
      }
      for (let x = 0; x < w; x++) {
        if (remaining[verClue(x, c, n, h)] === 0) {
          busy = true;
          remaining[verClue(x, c, n, h)] = NO_NUMBER;
          for (let y = 0; y < h; y++) cube[cuboid(x, y, c, n, w)] = 0;
        }
      }
    }

    // Technique 2 — single remaining possibility in a cell.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid[y * w + x] !== EMPTY) continue;
        let only = EMPTY;
        let multiple = false;
        for (let c = 0; c < n; c++) {
          if (cube[cuboid(x, y, c, n, w)]) {
            if (only === EMPTY) only = c;
            else multiple = true;
          }
        }
        if (only === EMPTY) {
          contradiction = true; // a cell with no candidate
        } else if (!multiple) {
          busy = true;
          placeLetter(p, grid, cube, x, y, only, remaining);
        }
      }
    }

    // Rerun the two cheap techniques before trying runs again.
    if (busy) continue;

    // Technique 3 — runs, each letter, both directions.
    for (let c = 0; c < n; c++) {
      if (solverRuns(p, grid, cube, remaining, true, c)) busy = true;
      if (solverRuns(p, grid, cube, remaining, false, c)) busy = true;
    }
  }

  if (contradiction) return { status: "contradiction", grid };

  // Classify the settled grid.
  const verdict = validatePuzzle(p, grid, numbers);
  const status: SolveStatus =
    verdict === 0 ? "solved" : verdict === -1 ? "contradiction" : "ambiguous";
  return { status, grid };
}
