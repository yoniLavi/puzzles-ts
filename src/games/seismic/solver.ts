/**
 * Seismic's deduction engine — the candidate-mark solver from `seismic.c`.
 *
 * One engine serves three callers: the generator (which strips a clue only while
 * the board still solves, so the solver's verdict on every intermediate board
 * decides which puzzles exist), `solve()`, and `findMistakes` (a board the
 * solver drives to completion is *forced*, hence uniquely solved — there is no
 * backtracking at any rung). A future explained hint is the fourth projection of
 * the same rungs (the narratable-deduction doctrine).
 *
 * Two deduction rungs:
 *  - **Easy** — a *naked single* (a cell down to one candidate) and a *hidden
 *    single in a region* (a candidate with only one home in its region).
 *  - **Hard** — a *trial placement*: tentatively place a candidate and, if that
 *    alone leaves some region unable to house one of the numbers it owes, rule
 *    the candidate out.
 *
 * The rungs mutate the board in place as they sweep, and the sweeps run in
 * ascending cell order — which is observable (a later cell sees what an earlier
 * one placed), so the order is part of the algorithm, not an implementation
 * detail.
 */

import {
  areaBits,
  DIFF_EASY,
  DIFF_HARD,
  FM_ERRORDIST,
  FM_ERRORDUP,
  MODE_SEISMIC,
  numBit,
  type SeismicBoard,
} from "./state.ts";

/** `solveGame` could not drive the board to a complete, valid solution. */
export const SOLVE_FAILED = -1;

export const STATUS_COMPLETE = 0;
export const STATUS_UNFINISHED = 1;
export const STATUS_INVALID = 2;

/** Remove candidate `n` from `(x, y)`, if in bounds and present. Returns the
 * number of changes (zero or one) — the rungs sum these and treat a non-zero
 * total as "this rung fired". */
function unset(board: SeismicBoard, x: number, y: number, n: number): number {
  const { w, h, marks } = board;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  const i = y * w + x;
  if (marks[i] & numBit(n)) {
    marks[i] &= ~numBit(n);
    return 1;
  }
  return 0;
}

/**
 * Place `n` at `(x, y)` and propagate: the cell's candidates collapse to `n`,
 * and `n` is ruled out of every cell the keep-apart rule forbids it in and of
 * the rest of the cell's region.
 *
 * The keep-apart rule is the game's only mode-dependent behavior: Seismic bars
 * `n` from the `n` cells either side along both axes, Tectonic from all eight
 * neighbors.
 */
export function placeNumber(
  board: SeismicBoard,
  x: number,
  y: number,
  n: number,
): number {
  const { w, h, grid, marks, dsf } = board;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;

  const i = y * w + x;
  let changes = 0;
  if (grid[i] !== n) {
    grid[i] = n;
    changes++;
  }
  if (marks[i] !== numBit(n)) {
    marks[i] = numBit(n);
    changes++;
  }

  if (board.mode === MODE_SEISMIC) {
    for (let j = 1; j <= n; j++) {
      changes += unset(board, x + j, y, n);
      changes += unset(board, x - j, y, n);
      changes += unset(board, x, y + j, n);
      changes += unset(board, x, y - j, n);
    }
  } else {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        changes += unset(board, x + dx, y + dy, n);
      }
    }
  }

  const region = dsf.canonify(i);
  for (let j = 0; j < w * h; j++) {
    if (j === i) continue;
    if (dsf.canonify(j) === region) changes += unset(board, j % w, (j / w) | 0, n);
  }

  return changes;
}

/** Seed every cell's candidates to its region's full set, then apply the givens
 * already on the board. */
export function solverInit(board: SeismicBoard): void {
  const { w, h, grid, marks, dsf } = board;
  const s = w * h;
  for (let i = 0; i < s; i++) marks[i] = areaBits(dsf.size(i));
  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) placeNumber(board, i % w, (i / w) | 0, grid[i]);
  }
}

/** **Easy rung, naked single**: a cell with exactly one candidate left takes it. */
function solverMarks(board: SeismicBoard): number {
  const { w, h, grid, marks } = board;
  const s = w * h;
  let changes = 0;
  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) continue;
    for (let n = 1; n <= 9; n++) {
      if (marks[i] === numBit(n)) changes += placeNumber(board, i % w, (i / w) | 0, n);
    }
  }
  return changes;
}

/**
 * **Easy rung, hidden single in a region**: a candidate that appears in exactly
 * one cell of its region belongs there, so every *other* candidate of that cell
 * is ruled out.
 *
 * Both scratch arrays are accumulated from the pre-pass candidates and only then
 * applied, so the whole region is judged against one consistent snapshot.
 */
function solverAreas(board: SeismicBoard): number {
  const { w, h, marks, dsf } = board;
  const s = w * h;
  /** Candidates seen at least once in the region rooted here. */
  const singles = new Int32Array(s);
  /** Candidates seen at least twice. */
  const doubles = new Int32Array(s);

  for (let i = 0; i < s; i++) {
    const c = dsf.canonify(i);
    doubles[c] |= marks[i] & singles[c];
    singles[c] |= marks[i];
  }

  let changes = 0;
  for (let i = 0; i < s; i++) {
    const c = dsf.canonify(i);
    const unique = singles[c] ^ doubles[c];
    const prev = marks[i];
    if (marks[i] & unique) marks[i] &= unique;
    if (prev !== marks[i]) changes++;
  }

  return changes;
}

/**
 * **Hard rung, trial placement**: tentatively place each remaining candidate and
 * check whether that alone starves a region — if some region can then no longer
 * house one of the numbers it owes, the candidate is impossible.
 *
 * The trial is rolled back before the verdict is applied, so the only lasting
 * effect is striking the refuted candidate.
 */
function solverAttempt(board: SeismicBoard): number {
  const { w, h, grid, marks, dsf } = board;
  const s = w * h;
  const gridBackup = new Uint8Array(s);
  const marksBackup = new Uint16Array(s);
  const areas = new Int32Array(s);
  let changes = 0;

  for (let i = 0; i < s; i++) {
    if (grid[i] !== 0) continue;

    for (let n = 1; n <= 9; n++) {
      if (!(marks[i] & numBit(n))) continue;

      gridBackup.set(grid);
      marksBackup.set(marks);
      areas.fill(0);

      placeNumber(board, i % w, (i / w) | 0, n);

      for (let j = 0; j < s; j++) areas[dsf.canonify(j)] |= marks[j];

      let valid = true;
      for (let j = 0; j < s && valid; j++) {
        if (j !== dsf.canonify(j)) continue;
        if (areas[j] !== areaBits(dsf.size(j))) valid = false;
      }

      grid.set(gridBackup);
      marks.set(marksBackup);

      if (!valid) changes += unset(board, i % w, (i / w) | 0, n);
    }
  }

  return changes;
}

/**
 * Classify the board and refresh its live error flags: a number duplicated
 * inside its region gets `FM_ERRORDUP`, one sitting within an equal number's
 * keep-apart range gets `FM_ERRORDIST`. Both are *local* consistency checks —
 * weaker than `findMistakes`, which asks whether the board contradicts the
 * unique solution.
 */
export function validateGame(board: SeismicBoard): number {
  const { w, h, grid, flags, dsf } = board;
  const s = w * h;
  /** Numbers placed at least once in the region rooted here. */
  const singles = new Int32Array(s);
  /** Numbers placed at least twice. */
  const doubles = new Int32Array(s);
  /** Numbers whose keep-apart range covers this cell. */
  const ranges = new Int32Array(s);
  let status = STATUS_COMPLETE;

  for (let i = 0; i < s; i++) {
    if (grid[i] === 0) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const n = numBit(grid[i]);

    const c = dsf.canonify(i);
    doubles[c] |= n & singles[c];
    singles[c] |= n;

    if (board.mode === MODE_SEISMIC) {
      for (let j = 1; j <= grid[i]; j++) {
        if (x + j < w) ranges[i + j] |= n;
        if (x - j >= 0) ranges[i - j] |= n;
        if (y - j >= 0) ranges[i - j * w] |= n;
        if (y + j < h) ranges[i + j * w] |= n;
      }
    } else {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h)
            ranges[i + dx + dy * w] |= n;
        }
      }
    }
  }

  for (let i = 0; i < s; i++) {
    // An empty cell keeps whatever flags it had; upstream does the same, and it
    // is invisible either way (only a placed number is drawn in an error hue).
    if (grid[i] === 0) continue;
    const c = dsf.canonify(i);

    if (doubles[c] & numBit(grid[i])) {
      status = STATUS_INVALID;
      flags[i] |= FM_ERRORDUP;
    } else {
      flags[i] &= ~FM_ERRORDUP;
    }

    if (ranges[i] & numBit(grid[i])) {
      status = STATUS_INVALID;
      flags[i] |= FM_ERRORDIST;
    } else {
      flags[i] &= ~FM_ERRORDIST;
    }
  }

  if (status !== STATUS_INVALID) {
    for (let i = 0; i < s; i++) {
      if (grid[i] === 0) {
        status = STATUS_UNFINISHED;
        break;
      }
    }
  }

  return status;
}

/**
 * Run the rungs to a fixpoint, no harder than `maxDiff`. Returns the difficulty
 * actually needed, or {@link SOLVE_FAILED} if the board did not come out
 * complete and valid.
 *
 * Mutates `board` into whatever the solver could establish — callers that need
 * the original back (the generator's clue-stripping loop) snapshot it first.
 */
export function solveGame(board: SeismicBoard, maxDiff: number): number {
  let diff = DIFF_EASY;

  solverInit(board);

  for (;;) {
    if (validateGame(board) !== STATUS_UNFINISHED) break;

    if (solverMarks(board)) continue;
    if (solverAreas(board)) continue;

    if (maxDiff < DIFF_HARD) break;
    diff = Math.max(diff, DIFF_HARD);

    if (solverAttempt(board)) continue;

    break;
  }

  if (validateGame(board) !== STATUS_COMPLETE) return SOLVE_FAILED;
  return diff;
}
