/**
 * The ABCD deductive solver — idiomatic port of `abcd_solve_game` (`abcd.c`).
 *
 * It is a fixpoint of three deduction techniques over a working grid + a
 * per-cell candidate cube + a `remaining[]` count per (row/column, letter):
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
 * (upstream `if (busy) continue;`), then the grid is classified.
 *
 * **No leaf dependency.** `solver(abcd)` names none — this is self-contained
 * arithmetic over the candidate cube, *not* a Latin square (the constraint is a
 * per-line count + a no-touch rule, so `engine/latin.ts` does not apply).
 *
 * The one deliberate weakness upstream ships: there are no diagonal-specific
 * deduction techniques (the runs technique ignores diagonal adjacency). That is
 * a weaker-than-ideal solver — the difficulty curve upstream shipped — not a
 * defect to fix (playbook rule 3). It still generates valid diag puzzles
 * because {@link placeLetter} accounts for diagonal neighbours.
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
 * The *obvious* pencil-mark eliminations, given the placed letters — the ABCD
 * analogue of the Latin family's row/column duplicate strikes (docs/games/mechanics.md § "Pencil marks: the full note-taking UX"'s
 * adaptive mark-all). A pencilled candidate `c` in an empty cell is obviously
 * impossible, and so struck, when either:
 *   - a cell orthogonally (or, under `diag`, diagonally) adjacent already holds
 *     `c` — the no-touch rule; or
 *   - `c`'s row or column already holds its full clue count of `c` — a
 *     satisfied clue.
 * Both are exactly the solver's cheapest deductions (technique 1 +
 * {@link placeLetter}'s neighbour rule-outs), so a struck mark is never one a
 * legal solution could keep. Mirrors `obviousCandidateMarks`' guard: never
 * strike a cell's *last* remaining candidate (keep the lowest).
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
 * Place letter `l` at `(x, y)`: set the grid cell, rule `l`'s rivals out of the
 * cell, rule `l` out of the cell's orthogonal (and, under `diag`, diagonal)
 * neighbours, and — when a `remaining` array is supplied — decrement this
 * letter's row and column counts. Shared with the generator (which passes no
 * `remaining`, using it purely to keep a partial fill no-touch-legal).
 * Mirrors `abcd_place_letter`.
 */
export function placeLetter(
  p: AbcdParams,
  grid: Int8Array,
  cube: Uint8Array,
  x: number,
  y: number,
  l: number,
  remaining?: Int32Array,
): void {
  const { w, h, n, diag } = p;
  grid[y * w + x] = l;

  // Rule out all other letters in this square.
  for (let i = 0; i < n; i++) {
    if (i !== l) cube[cuboid(x, y, i, n, w)] = 0;
  }

  // Rule out this letter for adjacent squares.
  if (diag && x > 0 && y > 0) cube[cuboid(x - 1, y - 1, l, n, w)] = 0;
  if (diag && x < w - 1 && y > 0) cube[cuboid(x + 1, y - 1, l, n, w)] = 0;
  if (diag && x > 0 && y < h - 1) cube[cuboid(x - 1, y + 1, l, n, w)] = 0;
  if (diag && x < w - 1 && y < h - 1) cube[cuboid(x + 1, y + 1, l, n, w)] = 0;
  if (x > 0) cube[cuboid(x - 1, y, l, n, w)] = 0;
  if (x < w - 1) cube[cuboid(x + 1, y, l, n, w)] = 0;
  if (y > 0) cube[cuboid(x, y - 1, l, n, w)] = 0;
  if (y < h - 1) cube[cuboid(x, y + 1, l, n, w)] = 0;

  if (remaining) {
    if (remaining[horClue(y, l, n)] !== NO_NUMBER) remaining[horClue(y, l, n)]--;
    if (remaining[verClue(x, l, n, h)] !== NO_NUMBER) remaining[verClue(x, l, n, h)]--;
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
  const rslen = new Int32Array(bmx);
  const rspos = new Int32Array(bmx);
  let action = false;

  for (let a = 0; a < amx; a++) {
    const req = horizontal
      ? remaining[horClue(a, c, n)]
      : remaining[verClue(a, c, n, h)];
    if (req === NO_NUMBER || req === 0) continue;

    // Collect maximal open runs where `c` is still a candidate.
    let point = 0;
    rslen.fill(0);
    rspos.fill(0);
    for (let b = 0; b < bmx; b++) {
      const x = horizontal ? b : a;
      const y = horizontal ? a : b;
      if (cube[cuboid(x, y, c, n, w)] && grid[y * w + x] === EMPTY) {
        if (rslen[point] === 0) rspos[point] = b;
        rslen[point]++;
      } else if (rslen[point] !== 0) {
        point++;
      }
    }
    if (rslen[point] !== 0) point++;

    // Max letters placeable = Σ ⌈len/2⌉.
    let maxletters = 0;
    for (let i = 0; i < point; i++) maxletters += (rslen[i] >> 1) + (rslen[i] & 1);

    // If the maximum equals the requirement, every odd-length run is forced
    // onto its even offsets.
    if (maxletters === req) {
      for (let i = 0; i < point; i++) {
        if (rslen[i] & 1) {
          action = true;
          for (let b = rspos[i]; b <= rspos[i] + rslen[i]; b += 2) {
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

/**
 * Run the deductive solver on `numbers` from a blank board. Returns the verdict
 * and the working grid. Faithful to `abcd_solve_game`.
 */
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
