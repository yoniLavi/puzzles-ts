/**
 * Pattern line-solver — faithful behavioural port of `do_recurse` /
 * `do_row` / `solve_puzzle` in pattern.c. It only ever reasons about a
 * single row or column at a time (upstream's documented limitation), so it
 * cannot crack puzzles needing cross-line deductions; the generator only
 * publishes boards this solver fully cracks, so the published clue set is
 * decided by this solver's verdict. The deductive *power* must therefore
 * match C exactly (so a byte-match generator differential holds) — the
 * recursion is ported close to the original; only the row/column
 * *scheduling* is replaced by an order-independent dirty-worklist fixpoint
 * (line-solving is monotone, so any schedule reaches the same fixpoint and
 * thus the same solved/stuck verdict).
 */
import {
  GRID_EMPTY,
  GRID_FULL,
  GRID_UNKNOWN,
  type GridVal,
  type PatternMistake,
  type PatternState,
} from "./state.ts";

// Solver-internal cell states (distinct from the GRID_* game values).
const S_UNKNOWN = 0;
const S_BLOCK = 1;
const S_DOT = 2;
const S_STILL_UNKNOWN = 3;

/**
 * Enumerate every legal placement of the remaining runs (`data` from
 * `ndone` on) into the tail of the line starting at `lowest`, OR-ing the
 * cells common to all legal placements into `deduced`. The `minpos/maxpos`
 * arrays memoise, per run index, the window of start positions already
 * explored (`*_done`) and those leading to a legal completion (`*_ok`), so
 * a tail that has already been fully analysed short-circuits. Returns
 * whether a legal completion exists from this `(ndone, lowest)`.
 */
function doRecurse(
  known: Uint8Array,
  deduced: Uint8Array,
  row: Uint8Array,
  minposDone: Int32Array,
  maxposDone: Int32Array,
  minposOk: Int32Array,
  maxposOk: Int32Array,
  data: readonly number[],
  len: number,
  freespace: number,
  ndone: number,
  lowest: number,
): boolean {
  const run = ndone < data.length ? data[ndone] : 0;

  if (run) {
    if (lowest >= minposDone[ndone] && lowest <= maxposDone[ndone]) {
      const ok = lowest >= minposOk[ndone] && lowest <= maxposOk[ndone];
      if (ok) {
        for (let i = 0; i < lowest; i++) deduced[i] |= row[i];
      }
      return ok;
    }
    if (lowest < minposDone[ndone]) minposDone[ndone] = lowest;
    if (lowest > maxposDone[ndone]) maxposDone[ndone] = lowest;

    for (let i = 0; i <= freespace; i++) {
      let j = lowest;
      let bad = false;
      for (let k = 0; k < i; k++) {
        if (known[j] === S_BLOCK) {
          bad = true;
          break;
        }
        row[j++] = S_DOT;
      }
      if (!bad) {
        for (let k = 0; k < run; k++) {
          if (known[j] === S_DOT) {
            bad = true;
            break;
          }
          row[j++] = S_BLOCK;
        }
      }
      if (!bad && j < len) {
        if (known[j] === S_BLOCK) bad = true;
        else row[j++] = S_DOT;
      }
      if (!bad) {
        if (
          doRecurse(
            known,
            deduced,
            row,
            minposDone,
            maxposDone,
            minposOk,
            maxposOk,
            data,
            len,
            freespace - i,
            ndone + 1,
            j,
          )
        ) {
          if (lowest < minposOk[ndone]) minposOk[ndone] = lowest;
          if (lowest + i > maxposOk[ndone]) maxposOk[ndone] = lowest + i;
          if (lowest + i > maxposDone[ndone]) maxposDone[ndone] = lowest + i;
        }
      }
      // C's `next_iter: j++;` is a no-op — `j` is reset to `lowest` next
      // iteration — so a bad placement just advances to the next `i`.
    }
    return lowest >= minposOk[ndone] && lowest <= maxposOk[ndone];
  }

  // Terminator run (the implicit trailing 0): the rest of the line is DOTs.
  for (let i = lowest; i < len; i++) {
    if (known[i] === S_BLOCK) return false;
    row[i] = S_DOT;
  }
  for (let i = 0; i < len; i++) deduced[i] |= row[i];
  return true;
}

/**
 * Deduce forced cells of one line of `matrix` (start/len/step) against its
 * clue `data`, writing newly-forced `S_BLOCK`/`S_DOT` cells back. Calls
 * `onChange(k)` for each line position `k` it fills. Returns whether it
 * changed anything.
 */
function doRow(
  matrix: Uint8Array,
  start: number,
  len: number,
  step: number,
  data: readonly number[],
  onChange: (pos: number) => void,
): boolean {
  const rowlen = data.length;
  const known = new Uint8Array(len);
  const deduced = new Uint8Array(len);
  const row = new Uint8Array(len);
  const minposDone = new Int32Array(rowlen);
  const maxposDone = new Int32Array(rowlen);
  const minposOk = new Int32Array(rowlen);
  const maxposOk = new Int32Array(rowlen);

  let freespace = len + 1;
  for (let r = 0; r < rowlen; r++) {
    minposDone[r] = minposOk[r] = len - 1;
    maxposDone[r] = maxposOk[r] = 0;
    freespace -= data[r] + 1;
  }

  for (let i = 0; i < len; i++) {
    known[i] = matrix[start + i * step];
    deduced[i] = 0;
  }
  for (let i = len - 1; i >= 0 && known[i] === S_DOT; i--) freespace--;

  if (rowlen === 0) {
    deduced.fill(S_DOT);
  } else if (rowlen === 1 && data[0] === len) {
    deduced.fill(S_BLOCK);
  } else {
    doRecurse(
      known,
      deduced,
      row,
      minposDone,
      maxposDone,
      minposOk,
      maxposOk,
      data,
      len,
      freespace,
      0,
      0,
    );
  }

  let changed = false;
  for (let i = 0; i < len; i++) {
    if (deduced[i] && deduced[i] !== S_STILL_UNKNOWN && !known[i]) {
      matrix[start + i * step] = deduced[i];
      onChange(i);
      changed = true;
    }
  }
  return changed;
}

/**
 * Run the line solver to a fixpoint. `clues` is per-line (cols `0..w-1`,
 * rows `w..w+h-1`). `seedGrid`/`immutable` optionally pre-fill clue
 * squares (faithful to upstream: a `GRID_FULL` immutable cell seeds
 * `S_BLOCK`; any other value seeds `S_UNKNOWN`, mirroring C's literal
 * `matrix[i] = grid[i]`). Returns the solver matrix and whether every cell
 * was decided.
 */
function solvePuzzle(
  w: number,
  h: number,
  clues: readonly (readonly number[])[],
  seedGrid?: Uint8Array,
  immutable?: Uint8Array,
): { matrix: Uint8Array; ok: boolean } {
  const matrix = new Uint8Array(w * h); // all S_UNKNOWN
  if (seedGrid && immutable) {
    for (let i = 0; i < w * h; i++) {
      if (immutable[i]) matrix[i] = seedGrid[i] === GRID_FULL ? S_BLOCK : S_UNKNOWN;
    }
  }

  const colDirty = new Uint8Array(w).fill(1);
  const rowDirty = new Uint8Array(h).fill(1);

  let any = true;
  while (any) {
    any = false;
    for (let i = 0; i < h; i++) {
      if (!rowDirty[i]) continue;
      rowDirty[i] = 0;
      if (doRow(matrix, i * w, w, 1, clues[w + i], (col) => (colDirty[col] = 1))) {
        any = true;
      }
    }
    for (let i = 0; i < w; i++) {
      if (!colDirty[i]) continue;
      colDirty[i] = 0;
      if (doRow(matrix, i, h, w, clues[i], (rowi) => (rowDirty[rowi] = 1))) {
        any = true;
      }
    }
  }

  let ok = true;
  for (let i = 0; i < w * h; i++) {
    if (matrix[i] === S_UNKNOWN) {
      ok = false;
      break;
    }
  }
  return { matrix, ok };
}

/** Whether the clue set is fully line-solvable from a blank grid (the
 * generator's uniqueness gate). */
export function isSoluble(
  w: number,
  h: number,
  clues: readonly (readonly number[])[],
): boolean {
  return solvePuzzle(w, h, clues).ok;
}

/** The unique solution grid (GRID_* values) for a state, seeding the solver
 * with any immutable clue squares, or `null` when the line solver can't
 * fully crack it. */
export function solveState(state: PatternState): Uint8Array | null {
  const { w, h, clues, immutable } = state.common;
  const seeded = immutable.some((v) => v !== 0);
  const { matrix, ok } = solvePuzzle(
    w,
    h,
    clues,
    seeded ? state.grid : undefined,
    seeded ? immutable : undefined,
  );
  if (!ok) return null;
  const grid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grid[i] = matrix[i] === S_BLOCK ? GRID_FULL : GRID_EMPTY;
  }
  return grid;
}

/** Solution as a `'0'`/`'1'` string for the `solve` move, or `null`. */
export function solveToString(state: PatternState): string | null {
  const grid = solveState(state);
  if (!grid) return null;
  let out = "";
  for (let i = 0; i < grid.length; i++) out += grid[i] === GRID_FULL ? "1" : "0";
  return out;
}

/**
 * Live error check for one line (upstream `check_errors`): is the line's
 * pattern of *complete runs* (maximal `GRID_FULL` runs bounded by
 * `GRID_EMPTY` or the line ends) inconsistent with its clue list? The check
 * is deliberately weak — it ignores `GRID_UNKNOWN`-separated gaps so a typo
 * doesn't light up crossing lines as a spoiler. Returns true on error.
 */
export function lineHasError(state: PatternState, line: number): boolean {
  const { w, h, clues } = state.common;
  const { grid } = state;
  const rowdata = clues[line];
  const rowlen = rowdata.length;
  // Pretend the clue list has a 0 at each end.
  const ROWDATA = (k: number): number => (k < 0 || k >= rowlen ? 0 : rowdata[k]);

  let rowpos = 0;
  let ncontig = 1; // pretend we've already seen the initial zero run

  const foundRun = (r: number): boolean => {
    for (let newpos = rowpos; newpos <= rowlen; newpos++) {
      if (ROWDATA(newpos) !== r) continue;
      let match = true;
      for (let m = 1; m <= ncontig; m++) {
        if (ROWDATA(newpos - m) !== ROWDATA(rowpos - m)) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      rowpos = newpos + 1;
      ncontig++;
      return true;
    }
    return false;
  };

  let start: number;
  let step: number;
  let end: number;
  if (line < w) {
    start = line;
    step = w;
    end = start + step * h;
  } else {
    start = (line - w) * w;
    step = 1;
    end = start + step * w;
  }

  let runlen = -1;
  for (let j = start - step; j <= end; j += step) {
    const val = j < start || j === end ? GRID_EMPTY : grid[j];
    if (val === GRID_UNKNOWN) {
      runlen = -1;
      ncontig = 0;
    } else if (val === GRID_FULL) {
      if (runlen >= 0) runlen++;
    } else {
      // GRID_EMPTY
      if (runlen > 0 && !foundRun(runlen)) return true;
      runlen = 0;
    }
  }
  // Terminating zero run, contiguous iff no GRID_UNKNOWN intervened.
  if (!foundRun(0)) return true;
  return false;
}

/** Every player-marked cell that contradicts the unique solution. Returns
 * `[]` when the board isn't uniquely line-solvable (nothing to check
 * against) or when there are no contradictions. */
export function findMistakes(state: PatternState): readonly PatternMistake[] {
  const solution = solveState(state);
  if (!solution) return [];
  const { w, h } = state.common;
  const { grid } = state;
  const out: PatternMistake[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = grid[i] as GridVal;
      if (v !== GRID_UNKNOWN && v !== solution[i]) out.push({ x, y });
    }
  }
  return out;
}
