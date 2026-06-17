/**
 * Unruly solver — idiomatic TS port of the solver/validation half of
 * `unruly.c`. Five deductive techniques gated by difficulty, plus the
 * count/run validators the state and renderer reuse.
 *
 * The solver is the one place we keep a mutable C-style grid: it fills
 * thousands of cells per board during generation, where an immutable
 * clone per fill would be wasteful and un-idiomatic. The `Game`'s
 * `executeMove` stays pure; only the solver/generator mutate a private
 * working grid.
 */
import {
  DIFF_EASY,
  DIFF_NORMAL,
  DIFF_TRIVIAL,
  EMPTY,
  ONE,
  type UnrulyMistake,
  type UnrulyState,
  ZERO,
} from "./state.ts";

/** A temporary fill used by the near-complete technique so it doesn't
 * perturb the running counts; never appears in a real state. */
const BOGUS = 3;

/** The minimal grid view the validators/solver operate on. `UnrulyState`
 * structurally satisfies it; the solver builds its own mutable one. */
export interface GridView {
  w2: number;
  h2: number;
  unique: boolean;
  grid: Uint8Array;
}

// --- error-overlay flags (set by validateRows, read by render.ts) -------
export const FE_HOR_ROW_LEFT = 0x0001;
export const FE_HOR_ROW_MID = 0x0003;
export const FE_HOR_ROW_RIGHT = 0x0002;
export const FE_VER_ROW_TOP = 0x0004;
export const FE_VER_ROW_MID = 0x000c;
export const FE_VER_ROW_BOTTOM = 0x0008;
export const FE_ROW_MATCH = 0x0020;
export const FE_COL_MATCH = 0x0040;

// --- scratch counts ------------------------------------------------------

export class Scratch {
  onesRows: Int32Array;
  onesCols: Int32Array;
  zerosRows: Int32Array;
  zerosCols: Int32Array;

  constructor(w2: number, h2: number) {
    this.onesRows = new Int32Array(h2);
    this.onesCols = new Int32Array(w2);
    this.zerosRows = new Int32Array(h2);
    this.zerosCols = new Int32Array(w2);
  }
}

export function newScratch(view: GridView): Scratch {
  const s = new Scratch(view.w2, view.h2);
  updateRemaining(view, s);
  return s;
}

function updateRemaining(view: GridView, scratch: Scratch): void {
  const { w2, h2, grid } = view;
  scratch.onesRows.fill(0);
  scratch.onesCols.fill(0);
  scratch.zerosRows.fill(0);
  scratch.zerosCols.fill(0);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const v = grid[y * w2 + x];
      if (v === ONE) {
        scratch.onesRows[y]++;
        scratch.onesCols[x]++;
      } else if (v === ZERO) {
        scratch.zerosRows[y]++;
        scratch.zerosCols[x]++;
      }
    }
  }
}

// --- technique: impending threes (TRIVIAL) ------------------------------
// Two of three consecutive cells filled `check` and the third EMPTY forces
// the third to `block` (the opposite colour). `rowcount`/`colcount` are the
// block colour's counts, bumped as cells are filled.
function checkThrees(
  view: GridView,
  rowcount: Int32Array,
  colcount: Int32Array,
  horizontal: boolean,
  check: number,
  block: number,
): number {
  const { w2, h2, grid } = view;
  const dx = horizontal ? 1 : 0;
  const dy = 1 - dx;
  let ret = 0;
  for (let y = dy; y < h2 - dy; y++) {
    for (let x = dx; x < w2 - dx; x++) {
      const i1 = (y - dy) * w2 + (x - dx);
      const i2 = y * w2 + x;
      const i3 = (y + dy) * w2 + (x + dx);
      let fillAt = -1;
      if (grid[i1] === check && grid[i2] === check && grid[i3] === EMPTY) fillAt = i3;
      else if (grid[i1] === check && grid[i2] === EMPTY && grid[i3] === check)
        fillAt = i2;
      else if (grid[i1] === EMPTY && grid[i2] === check && grid[i3] === check)
        fillAt = i1;
      if (fillAt >= 0) {
        ret++;
        grid[fillAt] = block;
        rowcount[Math.floor(fillAt / w2)]++;
        colcount[fillAt % w2]++;
      }
    }
  }
  return ret;
}

function checkAllThrees(view: GridView, s: Scratch): number {
  let ret = 0;
  ret += checkThrees(view, s.zerosRows, s.zerosCols, true, ONE, ZERO);
  ret += checkThrees(view, s.onesRows, s.onesCols, true, ZERO, ONE);
  ret += checkThrees(view, s.zerosRows, s.zerosCols, false, ONE, ZERO);
  ret += checkThrees(view, s.onesRows, s.onesCols, false, ZERO, ONE);
  return ret;
}

// --- fill an entire row/column with one colour --------------------------
function fillRow(
  view: GridView,
  i: number,
  horizontal: boolean,
  rowcount: Int32Array,
  colcount: Int32Array,
  fill: number,
): number {
  const { w2, h2, grid } = view;
  let ret = 0;
  const n = horizontal ? w2 : h2;
  for (let j = 0; j < n; j++) {
    const p = horizontal ? i * w2 + j : j * w2 + i;
    if (grid[p] === EMPTY) {
      ret++;
      grid[p] = fill;
      rowcount[horizontal ? i : j]++;
      colcount[horizontal ? j : i]++;
    }
  }
  return ret;
}

// --- technique: single gap (TRIVIAL) ------------------------------------
// A row/column with its full count of one colour and one short of the
// other has exactly one empty cell, which must be the other colour.
function checkSingleGap(
  view: GridView,
  complete: Int32Array,
  horizontal: boolean,
  rowcount: Int32Array,
  colcount: Int32Array,
  fill: number,
): number {
  const { w2, h2 } = view;
  const count = horizontal ? h2 : w2;
  const target = (horizontal ? w2 : h2) / 2;
  const other = horizontal ? rowcount : colcount;
  let ret = 0;
  for (let i = 0; i < count; i++) {
    if (complete[i] === target && other[i] === target - 1) {
      ret += fillRow(view, i, horizontal, rowcount, colcount, fill);
    }
  }
  return ret;
}

function checkAllSingleGap(view: GridView, s: Scratch): number {
  let ret = 0;
  ret += checkSingleGap(view, s.onesRows, true, s.zerosRows, s.zerosCols, ZERO);
  ret += checkSingleGap(view, s.onesCols, false, s.zerosRows, s.zerosCols, ZERO);
  ret += checkSingleGap(view, s.zerosRows, true, s.onesRows, s.onesCols, ONE);
  ret += checkSingleGap(view, s.zerosCols, false, s.onesRows, s.onesCols, ONE);
  return ret;
}

// --- technique: completed counts (EASY) ---------------------------------
// A row/column already holding its full count of one colour fills the rest
// with the other colour.
function checkCompleteNums(
  view: GridView,
  complete: Int32Array,
  horizontal: boolean,
  rowcount: Int32Array,
  colcount: Int32Array,
  fill: number,
): number {
  const { w2, h2 } = view;
  const count = horizontal ? h2 : w2;
  const target = (horizontal ? w2 : h2) / 2;
  const other = horizontal ? rowcount : colcount;
  let ret = 0;
  for (let i = 0; i < count; i++) {
    if (complete[i] === target && other[i] < target) {
      ret += fillRow(view, i, horizontal, rowcount, colcount, fill);
    }
  }
  return ret;
}

function checkAllCompleteNums(view: GridView, s: Scratch): number {
  let ret = 0;
  ret += checkCompleteNums(view, s.onesRows, true, s.zerosRows, s.zerosCols, ZERO);
  ret += checkCompleteNums(view, s.onesCols, false, s.zerosRows, s.zerosCols, ZERO);
  ret += checkCompleteNums(view, s.zerosRows, true, s.onesRows, s.onesCols, ONE);
  ret += checkCompleteNums(view, s.zerosCols, false, s.onesRows, s.onesCols, ONE);
  return ret;
}

// --- technique: unique rows/columns (EASY, unique mode) -----------------
// A full row/column matched in all but one place by a one-short row/column
// forces that one place to differ (else the two would become identical).
function checkUniques(
  view: GridView,
  rowcount: Int32Array,
  horizontal: boolean,
  check: number,
  block: number,
  s: Scratch,
): number {
  const { w2, h2, grid } = view;
  const rmult = horizontal ? w2 : 1;
  const cmult = horizontal ? 1 : w2;
  const nr = horizontal ? h2 : w2;
  const nc = horizontal ? w2 : h2;
  const max = nc / 2;
  let ret = 0;
  for (let r = 0; r < nr; r++) {
    if (rowcount[r] !== max) continue;
    for (let r2 = 0; r2 < nr; r2++) {
      if (rowcount[r2] !== max - 1) continue;
      let nmatch = 0;
      let nonmatch = -1;
      for (let c = 0; c < nc; c++) {
        if (grid[r * rmult + c * cmult] === check) {
          if (grid[r2 * rmult + c * cmult] === check) nmatch++;
          else nonmatch = c;
        }
      }
      if (nmatch === max - 1 && nonmatch >= 0) {
        const i1 = r2 * rmult + nonmatch * cmult;
        if (grid[i1] === block) continue;
        if (grid[i1] !== EMPTY) continue;
        grid[i1] = block;
        if (block === ONE) {
          s.onesRows[Math.floor(i1 / w2)]++;
          s.onesCols[i1 % w2]++;
        } else {
          s.zerosRows[Math.floor(i1 / w2)]++;
          s.zerosCols[i1 % w2]++;
        }
        ret++;
      }
    }
  }
  return ret;
}

function checkAllUniques(view: GridView, s: Scratch): number {
  let ret = 0;
  ret += checkUniques(view, s.onesRows, true, ONE, ZERO, s);
  ret += checkUniques(view, s.zerosRows, true, ZERO, ONE, s);
  ret += checkUniques(view, s.onesCols, false, ONE, ZERO, s);
  ret += checkUniques(view, s.zerosCols, false, ZERO, ONE, s);
  return ret;
}

// --- technique: near-complete (NORMAL) ----------------------------------
// A row/column with one cell of colour Y left and ≥2 of colour X left: in
// any spot where placing the last Y would force three X's in a row, that Y
// can't go there. We BOGUS-mark the cells that would complete such a run so
// `fillRow` fills the *forced* remainder with the fill colour, then restore
// the BOGUS cells. (See unruly.c's worked example.)
function checkNearComplete(
  view: GridView,
  complete: Int32Array,
  horizontal: boolean,
  rowcount: Int32Array,
  colcount: Int32Array,
  fill: number,
): number {
  const { w2, h2, grid } = view;
  const w = w2 / 2;
  const h = h2 / 2;
  const dx = horizontal ? 1 : 0;
  const dy = 1 - dx;
  let ret = 0;
  for (let y = dy; y < h2 - dy; y++) {
    if (horizontal && (complete[y] < w - 1 || rowcount[y] > w - 2)) continue;
    for (let x = dx; x < w2 - dx; x++) {
      if (!horizontal && (complete[x] < h - 1 || colcount[x] > h - 2)) continue;

      const i = horizontal ? y : x;
      const i1 = (y - dy) * w2 + (x - dx);
      const i2 = y * w2 + x;
      const i3 = (y + dy) * w2 + (x + dx);

      // The four cases (fill adjacent to empties, or three empties) that a
      // forced run could occupy. Mark the run's empties BOGUS, fill the
      // remainder, then restore.
      let bogus: number[] | null = null;
      if (grid[i1] === fill && grid[i2] === EMPTY && grid[i3] === EMPTY)
        bogus = [i2, i3];
      else if (grid[i1] === EMPTY && grid[i2] === fill && grid[i3] === EMPTY)
        bogus = [i1, i3];
      else if (grid[i1] === EMPTY && grid[i2] === EMPTY && grid[i3] === fill)
        bogus = [i1, i2];
      else if (grid[i1] === EMPTY && grid[i2] === EMPTY && grid[i3] === EMPTY)
        bogus = [i1, i2, i3];

      if (bogus) {
        for (const b of bogus) grid[b] = BOGUS;
        ret += fillRow(view, i, horizontal, rowcount, colcount, fill);
        for (const b of bogus) grid[b] = EMPTY;
      }
    }
  }
  return ret;
}

function checkAllNearComplete(view: GridView, s: Scratch): number {
  let ret = 0;
  ret += checkNearComplete(view, s.onesRows, true, s.zerosRows, s.zerosCols, ZERO);
  ret += checkNearComplete(view, s.onesCols, false, s.zerosRows, s.zerosCols, ZERO);
  ret += checkNearComplete(view, s.zerosRows, true, s.onesRows, s.onesCols, ONE);
  ret += checkNearComplete(view, s.zerosCols, false, s.onesRows, s.onesCols, ONE);
  return ret;
}

// --- solve loop ----------------------------------------------------------

/** Run the deductive techniques to a fixpoint, gated by `diff`. Mutates
 * `view.grid` and `scratch`. Returns the maximum difficulty whose
 * technique fired, or `-1` if no progress was made. */
export function solveGame(view: GridView, scratch: Scratch, diff: number): number {
  let maxdiff = -1;
  const bump = (d: number) => {
    if (maxdiff < d) maxdiff = d;
  };
  while (true) {
    if (checkAllThrees(view, scratch)) {
      bump(DIFF_TRIVIAL);
      continue;
    }
    if (checkAllSingleGap(view, scratch)) {
      bump(DIFF_TRIVIAL);
      continue;
    }
    if (diff < DIFF_EASY) break;

    if (checkAllCompleteNums(view, scratch)) {
      bump(DIFF_EASY);
      continue;
    }
    if (view.unique && checkAllUniques(view, scratch)) {
      bump(DIFF_EASY);
      continue;
    }
    if (diff < DIFF_NORMAL) break;

    if (checkAllNearComplete(view, scratch)) {
      bump(DIFF_NORMAL);
      continue;
    }
    break;
  }
  return maxdiff;
}

// --- validators ----------------------------------------------------------

function validateRowsOriented(
  view: GridView,
  horizontal: boolean,
  check: number,
  errors: Int32Array | null,
): number {
  const { w2, h2, grid } = view;
  const dx = horizontal ? 1 : 0;
  const dy = 1 - dx;
  const err1 = horizontal ? FE_HOR_ROW_LEFT : FE_VER_ROW_TOP;
  const err2 = horizontal ? FE_HOR_ROW_MID : FE_VER_ROW_MID;
  const err3 = horizontal ? FE_HOR_ROW_RIGHT : FE_VER_ROW_BOTTOM;
  let ret = 0;
  for (let y = dy; y < h2 - dy; y++) {
    for (let x = dx; x < w2 - dx; x++) {
      const i1 = (y - dy) * w2 + (x - dx);
      const i2 = y * w2 + x;
      const i3 = (y + dy) * w2 + (x + dx);
      if (grid[i1] === check && grid[i2] === check && grid[i3] === check) {
        ret++;
        if (errors) {
          errors[i1] |= err1;
          errors[i2] |= err2;
          errors[i3] |= err3;
        }
      }
    }
  }
  return ret;
}

function validateUnique(
  view: GridView,
  horizontal: boolean,
  errors: Int32Array | null,
): number {
  const { w2, h2, grid } = view;
  const rmult = horizontal ? w2 : 1;
  const cmult = horizontal ? 1 : w2;
  const nr = horizontal ? h2 : w2;
  const nc = horizontal ? w2 : h2;
  const err = horizontal ? FE_ROW_MATCH : FE_COL_MATCH;
  let ret = 0;
  for (let r = 0; r < nr; r++) {
    let nfull = 0;
    for (let c = 0; c < nc; c++) if (grid[r * rmult + c * cmult] !== EMPTY) nfull++;
    if (nfull !== nc) continue;
    for (let r2 = r + 1; r2 < nr; r2++) {
      let match = true;
      for (let c = 0; c < nc; c++) {
        if (grid[r * rmult + c * cmult] !== grid[r2 * rmult + c * cmult]) {
          match = false;
          break;
        }
      }
      if (match) {
        if (errors) {
          for (let c = 0; c < nc; c++) {
            errors[r * rmult + c * cmult] |= err;
            errors[r2 * rmult + c * cmult] |= err;
          }
        }
        ret++;
      }
    }
  }
  return ret;
}

/** Mark every three-in-a-row run (and, in unique mode, every identical
 * full row/column pair) into `errors`. Returns `-1` if any error exists,
 * else `0`. */
export function validateRows(view: GridView, errors: Int32Array | null): number {
  let n = 0;
  n += validateRowsOriented(view, true, ONE, errors);
  n += validateRowsOriented(view, false, ONE, errors);
  n += validateRowsOriented(view, true, ZERO, errors);
  n += validateRowsOriented(view, false, ZERO, errors);
  if (view.unique) {
    n += validateUnique(view, true, errors);
    n += validateUnique(view, false, errors);
  }
  return n ? -1 : 0;
}

/** Count check: `-1` if any row/column exceeds its target (contradiction),
 * `+1` if any is still short (incomplete), `0` if every count is exact.
 * Optionally records per-row/column over-count flags into `errors`, laid
 * out as upstream: `[0,h2)` rows-ones, `[h2,2h2)` rows-zeros,
 * `[2h2,2h2+w2)` cols-ones, `[2h2+w2,2h2+2w2)` cols-zeros. */
export function validateCounts(view: GridView, errors: Uint8Array | null): number {
  const { w2, h2 } = view;
  const w = w2 / 2;
  const h = h2 / 2;
  const s = newScratch(view);
  let below = false;
  let above = false;

  for (let i = 0; i < w2; i++) {
    if (s.onesCols[i] < h) below = true;
    if (s.zerosCols[i] < h) below = true;
    if (s.onesCols[i] > h) above = true;
    if (s.zerosCols[i] > h) above = true;
    if (errors) {
      errors[2 * h2 + i] = s.onesCols[i] > h ? 1 : 0;
      errors[2 * h2 + w2 + i] = s.zerosCols[i] > h ? 1 : 0;
    }
  }
  for (let i = 0; i < h2; i++) {
    if (s.onesRows[i] < w) below = true;
    if (s.zerosRows[i] < w) below = true;
    if (s.onesRows[i] > w) above = true;
    if (s.zerosRows[i] > w) above = true;
    if (errors) {
      errors[i] = s.onesRows[i] > w ? 1 : 0;
      errors[h2 + i] = s.zerosRows[i] > w ? 1 : 0;
    }
  }

  return above ? -1 : below ? 1 : 0;
}

/**
 * Mistake-check (Check & Save): re-solve from the **immutable clues alone**
 * to the unique solution, then flag every player-placed cell whose colour
 * contradicts it. Returns `[]` when the clues don't deduce a complete
 * solution (a foreign / non-unique board — undecided, so nothing to flag),
 * matching Range/Mosaic. Pure (no state mutation).
 */
export function findMistakes(state: UnrulyState): UnrulyMistake[] {
  const { w2, h2, unique, grid, immutable } = state;
  const s = w2 * h2;

  // Solve a copy holding only the fixed clues → the canonical solution.
  const clueGrid = new Uint8Array(s);
  for (let i = 0; i < s; i++) if (immutable[i]) clueGrid[i] = grid[i];
  const work: GridView = { w2, h2, unique, grid: clueGrid };
  const scratch = newScratch(work);
  solveGame(work, scratch, Number.MAX_SAFE_INTEGER);
  if (validateCounts(work, null) !== 0 || validateRows(work, null) !== 0) return [];

  const mistakes: UnrulyMistake[] = [];
  for (let i = 0; i < s; i++) {
    if (immutable[i]) continue;
    const v = grid[i];
    if (v !== EMPTY && v !== work.grid[i]) {
      mistakes.push({ x: i % w2, y: Math.floor(i / w2) });
    }
  }
  return mistakes;
}

/** Run the full solver from a copy of `state`'s grid and return the solved
 * grid as a `'0'`/`'1'` string, or `null` if it doesn't reach a valid,
 * complete solution (Solve button). */
export function solveToString(view: GridView): string | null {
  const grid = Uint8Array.from(view.grid);
  const work: GridView = { w2: view.w2, h2: view.h2, unique: view.unique, grid };
  const scratch = newScratch(work);
  solveGame(work, scratch, Number.MAX_SAFE_INTEGER);
  if (validateCounts(work, null) !== 0 || validateRows(work, null) !== 0) return null;
  let out = "";
  for (let i = 0; i < grid.length; i++) out += grid[i] === ONE ? "1" : "0";
  return out;
}
