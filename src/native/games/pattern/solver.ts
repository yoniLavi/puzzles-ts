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
import { runDeductionFixpoint } from "../../engine/deduction-fixpoint.ts";
import { stepBudget } from "../../engine/step-budget.ts";
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

// =====================================================================
// Hint deduction — named nonogram line techniques
// =====================================================================
//
// The hint teaches *why* a cell is forced, so it decomposes each single-line
// deduction into the recognisable named techniques (overlap → black,
// unreachable gap → white), each firing forcing a single-colour contiguous
// segment. The two techniques are computed from the line's leftmost and
// rightmost feasible run packings (respecting the current marks): a cell in a
// run's leftmost∩rightmost span is black in every placement (overlap), and a
// cell no run can reach in any placement is white in every placement.
//
// Both are *subsets* of what the full line solver (`doRow`) forces. Any cell the
// two miss is picked up by the general single-line **intersection** bottom rung
// (`intersectionFiring`): run `doRow` on one line and surface the cells forced
// the same way across *every* arrangement of that line's runs consistent with
// its marks. That is a real, named technique — the same family as overlap (which
// is the single-run special case), generalised to the whole clue — not a "just
// because"; it is the always-explained completion that keeps the plan complete
// on every board the generator published (which is line-solvable by
// construction). All three are *parallel* recorders in the Undead sense
// (hint-authoring §9.4): they never touch the generator's `solvePuzzle`/
// `isSoluble` path, so the byte-match generator differential is unaffected *by
// construction*, with no gating flag.

/** Why a set of cells is forced, driving the hint's narration. */
export type PatternHintReason =
  | { kind: "overlap"; run: number; slack: number } // black
  | { kind: "unreachable" } // white — no run reaches these cells
  | { kind: "lineEmpty" } // white — the line has no clues at all
  | { kind: "intersection"; black: boolean }; // forced in every arrangement of the line's runs

/** One hint step: a contiguous set of same-value cells one line deduction
 * forces, the line reasoned over (for the line-of-sight shade + clue), the
 * reason, and the already-placed marks the deduction leans on (ringed by their
 * own colour). All indices are absolute grid positions. */
export interface PatternHintMove {
  cells: number[];
  value: GridVal; // GRID_FULL (black) or GRID_EMPTY (white)
  line: number; // 0..w-1 columns, w..w+h-1 rows
  reason: PatternHintReason;
  blackRefs: number[];
  whiteRefs: number[];
}

interface LineGeom {
  start: number;
  step: number;
  len: number;
}

function lineGeom(line: number, w: number, h: number): LineGeom {
  return line < w
    ? { start: line, step: w, len: h }
    : { start: (line - w) * w, step: 1, len: w };
}

/** The line's marks as solver states (S_BLOCK / S_DOT / S_UNKNOWN). */
function readLine(grid: Uint8Array, geom: LineGeom): Uint8Array {
  const out = new Uint8Array(geom.len);
  for (let p = 0; p < geom.len; p++) {
    const v = grid[geom.start + p * geom.step];
    out[p] = v === GRID_FULL ? S_BLOCK : v === GRID_EMPTY ? S_DOT : S_UNKNOWN;
  }
  return out;
}

/**
 * Leftmost feasible run packing respecting the current marks: for each run,
 * the earliest start position such that the whole clue still fits, no run
 * covers a known-white cell, runs stay separated, and every known-black cell
 * is covered. Returns the per-run start positions, or null if the line's marks
 * are inconsistent with its clue (never happens on a mistake-free board).
 */
function packLeft(
  runs: readonly number[],
  known: Uint8Array,
  len: number,
): number[] | null {
  const starts = new Array<number>(runs.length);
  const rec = (ndone: number, pos: number): boolean => {
    if (ndone === runs.length) {
      for (let i = pos; i < len; i++) if (known[i] === S_BLOCK) return false;
      return true;
    }
    const r = runs[ndone];
    // The first known-black at or after `pos` bounds this run: starting past it
    // would strand that black (no later run reaches back for it).
    let firstBlack = len;
    for (let i = pos; i < len; i++) {
      if (known[i] === S_BLOCK) {
        firstBlack = i;
        break;
      }
    }
    const maxStart = Math.min(len - r, firstBlack);
    for (let start = pos; start <= maxStart; start++) {
      let ok = true;
      for (let k = 0; k < r; k++) {
        if (known[start + k] === S_DOT) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (start + r < len && known[start + r] === S_BLOCK) continue; // separator
      if (rec(ndone + 1, start + r + 1)) {
        starts[ndone] = start;
        return true;
      }
    }
    return false;
  };
  return rec(0, 0) ? starts : null;
}

/** Rightmost feasible packing — `packLeft` on the mirrored line/clue. */
function packRight(
  runs: readonly number[],
  known: Uint8Array,
  len: number,
): number[] | null {
  const mknown = new Uint8Array(len);
  for (let i = 0; i < len; i++) mknown[i] = known[len - 1 - i];
  const mruns = [...runs].reverse();
  const mleft = packLeft(mruns, mknown, len);
  if (!mleft) return null;
  const k = runs.length;
  const out = new Array<number>(k);
  for (let j = 0; j < k; j++) out[k - 1 - j] = len - mleft[j] - mruns[j];
  return out;
}

/** Absolute grid indices of the line's already-placed marks, split by colour,
 * within the line-local window `[from, to)`. */
function collectRefs(
  known: Uint8Array,
  geom: LineGeom,
  from: number,
  to: number,
): { blackRefs: number[]; whiteRefs: number[] } {
  const blackRefs: number[] = [];
  const whiteRefs: number[] = [];
  for (let p = Math.max(0, from); p < Math.min(geom.len, to); p++) {
    const abs = geom.start + p * geom.step;
    if (known[p] === S_BLOCK) blackRefs.push(abs);
    else if (known[p] === S_DOT) whiteRefs.push(abs);
  }
  return { blackRefs, whiteRefs };
}

/** The first named-technique firing on this line (one overlap run, or the
 * first unreachable-white segment), or null. Deterministic. */
function analyzeLine(
  known: Uint8Array,
  runs: readonly number[],
  line: number,
  geom: LineGeom,
): PatternHintMove | null {
  const { len } = geom;
  const abs = (p: number): number => geom.start + p * geom.step;

  if (runs.length === 0) {
    // A clueless line is all white; surface its first undecided segment.
    const seg = firstSegment(known, 0, len, (p) => known[p] === S_UNKNOWN);
    if (!seg) return null;
    return {
      cells: rangeAbs(abs, seg.from, seg.to),
      value: GRID_EMPTY,
      line,
      reason: { kind: "lineEmpty" },
      blackRefs: [],
      whiteRefs: [],
    };
  }

  const left = packLeft(runs, known, len);
  const right = packRight(runs, known, len);
  if (!left || !right) return null; // inconsistent line — caller falls back

  // Overlap: a run longer than its play pins its middle cells black.
  for (let i = 0; i < runs.length; i++) {
    const s = right[i];
    const e = left[i] + runs[i];
    if (s >= e) continue;
    const seg = firstSegment(known, s, e, (p) => known[p] === S_UNKNOWN);
    if (!seg) continue;
    const spanTo = right[i] + runs[i];
    return {
      cells: rangeAbs(abs, seg.from, seg.to),
      value: GRID_FULL,
      line,
      reason: { kind: "overlap", run: runs[i], slack: right[i] - left[i] },
      ...collectRefs(known, geom, left[i], spanTo),
    };
  }

  // Unreachable white: a cell no run can cover in any placement stays white.
  const coverable = new Uint8Array(len);
  for (let i = 0; i < runs.length; i++) {
    for (let p = left[i]; p < right[i] + runs[i]; p++) coverable[p] = 1;
  }
  const seg = firstSegment(
    known,
    0,
    len,
    (p) => known[p] === S_UNKNOWN && !coverable[p],
  );
  if (seg) {
    // No ring: a "no run reaches here" deduction leans on the whole line's
    // packing, not one or two marks, so ringing individual cells would
    // over-claim (§2.4). The shaded line of sight + highlighted clue is the
    // evidence.
    return {
      cells: rangeAbs(abs, seg.from, seg.to),
      value: GRID_EMPTY,
      line,
      reason: { kind: "unreachable" },
      blackRefs: [],
      whiteRefs: [],
    };
  }
  return null;
}

/** The first maximal run of positions in `[from, to)` all satisfying `pred`. */
function firstSegment(
  known: Uint8Array,
  from: number,
  to: number,
  pred: (p: number) => boolean,
): { from: number; to: number } | null {
  let p = Math.max(0, from);
  const end = Math.min(known.length, to);
  while (p < end && !pred(p)) p++;
  if (p >= end) return null;
  let q = p;
  while (q < end && pred(q)) q++;
  return { from: p, to: q };
}

function rangeAbs(abs: (p: number) => number, from: number, to: number): number[] {
  const out: number[] = [];
  for (let p = from; p < to; p++) out.push(abs(p));
  return out;
}

/** The single-line intersection bottom rung: run the complete single-line
 * solver on some line and surface its first forced same-value contiguous
 * segment. Every cell `doRow` forces is black (or white) in *every* arrangement
 * of that line's runs consistent with its marks — the general intersection, the
 * same family as overlap generalised to the whole clue. Covers the gap-based
 * deductions the two elegant techniques don't name, keeping the plan complete
 * with an honest, named step (never a "just because"). */
function intersectionFiring(
  grid: Uint8Array,
  w: number,
  h: number,
  clues: readonly (readonly number[])[],
): PatternHintMove | null {
  for (let line = 0; line < w + h; line++) {
    const geom = lineGeom(line, w, h);
    const known = readLine(grid, geom);
    const mat = Uint8Array.from(known); // doRow reads/writes S_* states
    const forced: { pos: number; value: GridVal }[] = [];
    doRow(mat, 0, geom.len, 1, clues[line], (p) =>
      forced.push({ pos: p, value: mat[p] === S_BLOCK ? GRID_FULL : GRID_EMPTY }),
    );
    if (forced.length === 0) continue;
    forced.sort((a, b) => a.pos - b.pos);
    const first = forced[0];
    const cells = [geom.start + first.pos * geom.step];
    let last = first.pos;
    for (let k = 1; k < forced.length; k++) {
      if (forced[k].pos === last + 1 && forced[k].value === first.value) {
        cells.push(geom.start + forced[k].pos * geom.step);
        last = forced[k].pos;
      } else break;
    }
    return {
      cells,
      value: first.value,
      line,
      reason: { kind: "intersection", black: first.value === GRID_FULL },
      blackRefs: [],
      whiteRefs: [],
    };
  }
  return null;
}

/**
 * A hint plan from the player's current marks: an ordered list of forced
 * single-line deductions that drives the board to its unique solution. Each
 * step prefers an elegant named technique (overlap / unreachable-white) for
 * teaching, dropping to the general single-line intersection (still a named,
 * explained technique) for any cell the elegant two don't group. The plan is
 * built on a working copy (each step applied before the
 * next is computed), so every step's narration and highlight reflect the board
 * as that step fires — and a fresh recompute resumes from any mid-game
 * position (hint-authoring §7.1).
 */
export function deduceHintPlan(state: PatternState): PatternHintMove[] {
  const { w, h, clues } = state.common;
  const working = Uint8Array.from(state.grid);
  const plan: PatternHintMove[] = [];
  // Record a firing (or nothing) into the plan; report it to the shared ladder.
  const apply = (firing: PatternHintMove | null): number => {
    if (!firing) return 0;
    plan.push(firing);
    for (const c of firing.cells) working[c] = firing.value;
    return 1;
  };
  // Restart-on-first-firing over two rungs: prefer an elegant named technique
  // (the teaching path), then the general single-line intersection (also named
  // and explained) for cells the elegant two don't group. Each firing decides
  // ≥1 cell; the step budget is the non-termination backstop.
  runDeductionFixpoint({
    rungs: [
      () => {
        let firing: PatternHintMove | null = null;
        for (let line = 0; line < w + h && !firing; line++) {
          const geom = lineGeom(line, w, h);
          firing = analyzeLine(readLine(working, geom), clues[line], line, geom);
        }
        return apply(firing);
      },
      () => apply(intersectionFiring(working, w, h, clues)),
    ],
    budget: stepBudget("pattern hint"),
    solved: () => !working.includes(GRID_UNKNOWN),
  });
  return plan;
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
