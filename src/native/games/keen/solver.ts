/**
 * Keen solver — the Keen-specific *cage* deductions and validator from
 * `keen.c`, riding on the shared generic `LatinSolver` (`engine/latin.ts`).
 *
 * The generic Latin layers (positional/numeric elimination, set elimination,
 * forcing chains, recursion) supply everything Latin; Keen adds three
 * difficulty-keyed user-solvers (`solverEasy`/`solverNormal`/`solverHard`, all
 * via the shared `solverCommon`) that, for each cage, enumerate the digit
 * layouts consistent with the cage's arithmetic clue + the current candidate
 * cube and prune the cube accordingly.
 *
 * Index conventions are kept verbatim from C (playbook §2.2 — re-deriving the
 * transpositions is error-prone and would diverge the differential): the cage
 * `boxlist`/`whichbox`/`sq` all live in the **transposed** cell space
 * `s = x·w + y`, so a candidate read is `solver.cube[s·w + n−1]` (which equals
 * `cubeGet(x, y, n)` because `latin.ts`'s `cubepos(x,y,n) = (x·o+y)·o+n−1`), and
 * the result grid (reading order `y·w+x`) is read in `keenValid` via
 * `grid[transpose(s)]`.
 */

import {
  DIFF_AMBIGUOUS,
  DIFF_IMPOSSIBLE,
  type LatinSolver,
  latinSolver,
} from "../../engine/latin.ts";
import {
  C_ADD,
  C_DIV,
  C_MUL,
  C_SUB,
  clueOp,
  clueVal,
  DIFF_EASY,
  DIFF_EXTREME,
  DIFF_HARD,
  DIFF_NORMAL,
  DIFF_UNREASONABLE,
  type KeenClues,
} from "./state.ts";

export { DIFF_AMBIGUOUS, DIFF_IMPOSSIBLE };

/** Reading-order index of the transposed cell index `s = x·w + y`. */
function transpose(s: number, w: number): number {
  return (s % w) * w + ((s / w) | 0);
}

/** The cage decomposition the solver iterates over — built once from the
 * (immutable) dsf, shared across the fixpoint and recursion (it never mutates,
 * so no `ctxNew` clone is needed). */
interface KeenCtx {
  w: number;
  /** The solve target — `solverEasy` is omitted above Easy (upstream hack). */
  diff: number;
  nboxes: number;
  /** Cage cells in transposed (`x·w+y`) space, grouped by cage. */
  boxlist: Int32Array;
  /** `boxes[box] .. boxes[box+1]` is cage `box`'s slice of `boxlist`. */
  boxes: Int32Array;
  /** Packed `op | value` clue per cage. */
  clues: Int32Array;
  /** Transposed cell index → its cage number. */
  whichbox: Int32Array;
  /** Per-square candidate digits (scratch, length `a+1`). */
  dscratch: Int32Array;
  /** Accumulator bitmaps (scratch, length `max(a+1, 4w)`). */
  iscratch: Int32Array;
}

function buildCtx(w: number, kclues: KeenClues, maxdiff: number): KeenCtx {
  const a = w * w;
  const minimal = kclues.minimal;
  const canon: number[] = [];
  for (let i = 0; i < a; i++) if (minimal[i] === i) canon.push(i);
  const nboxes = canon.length;

  const boxlist = new Int32Array(a);
  const boxes = new Int32Array(nboxes + 1);
  const clues = new Int32Array(nboxes);
  const whichbox = new Int32Array(a);

  let m = 0;
  for (let n = 0; n < nboxes; n++) {
    const ci = canon[n];
    clues[n] = kclues.clues[ci];
    boxes[n] = m;
    for (let j = 0; j < a; j++) {
      if (minimal[j] === ci) {
        const t = (j % w) * w + ((j / w) | 0); // transpose
        boxlist[m++] = t;
        whichbox[t] = n;
      }
    }
  }
  boxes[nboxes] = m;

  return {
    w,
    diff: maxdiff,
    nboxes,
    boxlist,
    boxes,
    clues,
    whichbox,
    dscratch: new Int32Array(a + 1),
    iscratch: new Int32Array(Math.max(a + 1, 4 * w)),
  };
}

/**
 * A candidate digit layout for a cage (its digits in `dscratch`) is consistent
 * with the cage's clue; fold it into `iscratch`. The three difficulty variants
 * accumulate completely differently (see upstream's long comment):
 * - EASY: amalgamate every value and OR it into every square (deliberately
 *   weakened so EASY proves easier than NORMAL);
 * - NORMAL: OR each square's own value into that square's bitmap;
 * - HARD: track, per row/column, the digits that appear in *every* layout (the
 *   running intersection), so they can later be ruled out of the rest of that
 *   row/column.
 */
function solverClueCandidate(ctx: KeenCtx, diff: number, box: number): void {
  const w = ctx.w;
  const n = ctx.boxes[box + 1] - ctx.boxes[box];
  const { dscratch, iscratch } = ctx;

  if (diff === DIFF_EASY) {
    let mask = 0;
    for (let j = 0; j < n; j++) mask |= 1 << dscratch[j];
    for (let j = 0; j < n; j++) iscratch[j] |= mask;
  } else if (diff === DIFF_NORMAL) {
    for (let j = 0; j < n; j++) iscratch[j] |= 1 << dscratch[j];
  } else {
    // HARD: iscratch[2w..4w-1] are this-layout scratch; iscratch[0..2w-1] the
    // running intersection (per column 0..w-1, then per row 0..w-1).
    const sqStart = ctx.boxes[box];
    for (let j = 0; j < 2 * w; j++) iscratch[2 * w + j] = 0;
    for (let j = 0; j < n; j++) {
      const s = ctx.boxlist[sqStart + j];
      const x = (s / w) | 0;
      const y = s % w;
      iscratch[2 * w + x] |= 1 << dscratch[j];
      iscratch[3 * w + y] |= 1 << dscratch[j];
    }
    for (let j = 0; j < 2 * w; j++) iscratch[j] &= iscratch[2 * w + j];
  }
}

/** Iterate every cage, enumerate its consistent digit layouts, accumulate into
 * `iscratch`, then prune the cube. Faithful to `solver_common`. */
function solverCommon(solver: LatinSolver, ctx: KeenCtx, diff: number): number {
  const w = ctx.w;
  const cube = solver.cube;
  const { dscratch, iscratch, boxlist, boxes } = ctx;
  let ret = 0;

  for (let box = 0; box < ctx.nboxes; box++) {
    const sqStart = boxes[box];
    const n = boxes[box + 1] - boxes[box];
    const value = clueVal(ctx.clues[box]);
    const op = clueOp(ctx.clues[box]);
    const sq = (j: number): number => boxlist[sqStart + j];

    // Initialise iscratch for this cage.
    if (diff === DIFF_HARD) {
      for (let i = 0; i < 2 * w; i++) iscratch[i] = (1 << (w + 1)) - (1 << 1);
    } else {
      for (let i = 0; i < n; i++) iscratch[i] = 0;
    }

    if (op === C_SUB || op === C_DIV) {
      // Always a domino. Try every valid (i, j) digit pair both ways round.
      for (let i = 1; i <= w; i++) {
        const j = op === C_SUB ? i + value : i * value;
        if (j > w) break;

        if (cube[sq(0) * w + i - 1] && cube[sq(1) * w + j - 1]) {
          dscratch[0] = i;
          dscratch[1] = j;
          solverClueCandidate(ctx, diff, box);
        }
        if (cube[sq(0) * w + j - 1] && cube[sq(1) * w + i - 1]) {
          dscratch[0] = j;
          dscratch[1] = i;
          solverClueCandidate(ctx, diff, box);
        }
      }
    } else {
      // ADD / MUL: iterate over all digit combinations, `i` the next cell to
      // increment, `total` the running residual (identity 0 for ADD, 1 for MUL).
      let i = 0;
      dscratch[i] = 0;
      let total = value;
      while (true) {
        if (i < n) {
          let j = dscratch[i] + 1;
          for (; j <= w; j++) {
            if (op === C_ADD ? total < j : total % j !== 0) continue; // won't fit
            if (!cube[sq(i) * w + j - 1]) continue; // ruled out already
            let k = 0;
            for (; k < i; k++) {
              if (
                dscratch[k] === j &&
                (sq(k) % w === sq(i) % w || ((sq(k) / w) | 0) === ((sq(i) / w) | 0))
              )
                break; // clashes with another in the same row/column
            }
            if (k < i) continue;
            break; // found one
          }

          if (j > w) {
            // No valid values left; drop back.
            i--;
            if (i < 0) break; // iteration finished
            total = op === C_ADD ? total + dscratch[i] : total * dscratch[i];
          } else {
            // Got a value; store it and move on.
            dscratch[i++] = j;
            total = op === C_ADD ? total - j : (total / j) | 0;
            dscratch[i] = 0;
          }
        } else {
          if (total === (op === C_ADD ? 0 : 1)) solverClueCandidate(ctx, diff, box);
          i--;
          total = op === C_ADD ? total + dscratch[i] : total * dscratch[i];
        }
      }
    }

    // Apply the accumulated deductions.
    if (diff < DIFF_HARD) {
      for (let i = 0; i < n; i++) {
        for (let j = 1; j <= w; j++) {
          if (cube[sq(i) * w + j - 1] && !(iscratch[i] & (1 << j))) {
            cube[sq(i) * w + j - 1] = 0;
            ret = 1;
          }
        }
      }
    } else {
      // HARD: rule a required digit out of the rest of its row/column.
      for (let i = 0; i < 2 * w; i++) {
        const start = i < w ? i * w : i - w;
        const step = i < w ? 1 : w;
        for (let j = 1; j <= w; j++) {
          if (iscratch[i] & (1 << j)) {
            for (let k = 0; k < w; k++) {
              const pos = start + k * step;
              if (ctx.whichbox[pos] !== box && cube[pos * w + j - 1]) {
                cube[pos * w + j - 1] = 0;
                ret = 1;
              }
            }
          }
        }
      }
      // Revert to easier deductions after one cross-box hit, so diagnostics
      // don't make the puzzle look harder than it is.
      if (ret) return ret;
    }
  }

  return ret;
}

function solverEasy(solver: LatinSolver, ctx: KeenCtx): number {
  // Omit EASY deductions above Easy: NORMAL is a superset, and this keeps the
  // difficulty grading honest (the generator double-checks the level below).
  if (ctx.diff > DIFF_EASY) return 0;
  return solverCommon(solver, ctx, DIFF_EASY);
}
function solverNormal(solver: LatinSolver, ctx: KeenCtx): number {
  return solverCommon(solver, ctx, DIFF_NORMAL);
}
function solverHard(solver: LatinSolver, ctx: KeenCtx): number {
  return solverCommon(solver, ctx, DIFF_HARD);
}

/** Does the completed grid satisfy every cage clue? (`keen_valid`.) */
function keenValid(solver: LatinSolver, ctx: KeenCtx): boolean {
  const w = ctx.w;
  const grid = solver.grid;
  const g = (s: number): number => grid[transpose(s, w)];

  for (let box = 0; box < ctx.nboxes; box++) {
    const sqStart = ctx.boxes[box];
    const n = ctx.boxes[box + 1] - ctx.boxes[box];
    const value = clueVal(ctx.clues[box]);
    const op = clueOp(ctx.clues[box]);
    const sq = (j: number): number => ctx.boxlist[sqStart + j];
    let fail = false;

    switch (op) {
      case C_ADD: {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += g(sq(i));
        fail = sum !== value;
        break;
      }
      case C_MUL: {
        let remaining = value;
        for (let i = 0; i < n; i++) {
          const v = g(sq(i));
          if (remaining % v) {
            fail = true;
            break;
          }
          remaining = (remaining / v) | 0;
        }
        if (remaining !== 1) fail = true;
        break;
      }
      case C_SUB:
        if (value !== Math.abs(g(sq(0)) - g(sq(1)))) fail = true;
        break;
      case C_DIV: {
        const num = Math.max(g(sq(0)), g(sq(1)));
        const den = Math.min(g(sq(0)), g(sq(1)));
        if (den * value !== num) fail = true;
        break;
      }
    }

    if (fail) return false;
  }
  return true;
}

/**
 * Solve the `w × w` Keen board (cage partition + clues in `kclues`) into `soln`
 * (0 = blank), up to difficulty `maxdiff`. Returns the difficulty level reached,
 * or a `DIFF_IMPOSSIBLE`/`DIFF_AMBIGUOUS`/`DIFF_UNFINISHED` sentinel. Mirrors the
 * `solver()` driver: Easy→simple, Hard→set₀, Extreme→set₁+forcing,
 * Unreasonable→recursion through the shared `latinSolver`.
 */
export function solveKeen(
  w: number,
  kclues: KeenClues,
  soln: Uint8Array,
  maxdiff: number,
): number {
  const ctx = buildCtx(w, kclues, maxdiff);
  return latinSolver<KeenCtx>(soln, w, {
    maxdiff,
    diffSimple: DIFF_EASY,
    diffSet0: DIFF_HARD,
    diffSet1: DIFF_EXTREME,
    diffForcing: DIFF_EXTREME,
    diffRecursive: DIFF_UNREASONABLE,
    usersolvers: [solverEasy, solverNormal, solverHard, null, null],
    valid: keenValid,
    ctx,
  });
}
