/**
 * Singles (Hitori) deductive solver — port of the solver in `singles.c`.
 *
 * Works on a mutable working {@link SinglesState} (mutating `flags` and
 * `impossible`); the caller supplies a blank-flagged copy. The op-queue
 * cascade and each deduction mirror upstream so the difficulty grading —
 * and therefore the generator's published board — matches C exactly.
 */
import { Dsf } from "../../engine/dsf.ts";
import {
  DIFF_TRICKY,
  F_BLACK,
  F_CIRCLE,
  F_ERROR,
  F_SCRATCH,
  type SinglesState,
} from "./state.ts";

/* top, right, bottom, left */
const DXS = [0, 1, 0, -1];
const DYS = [-1, 0, 1, 0];

export const OP_BLACK = 0;
export const OP_CIRCLE = 1;

interface Op {
  x: number;
  y: number;
  op: number;
}

/** The solver's op queue + flood-fill scratch (upstream solver_state). */
export interface SolverState {
  ops: Op[];
  scratch: Int32Array;
}

export function newSolverState(s: SinglesState): SolverState {
  return { ops: [], scratch: new Int32Array(s.n) };
}

function ingrid(s: SinglesState, x: number, y: number): boolean {
  return x >= 0 && x < s.w && y >= 0 && y < s.h;
}

export function solverOpAdd(ss: SolverState, x: number, y: number, op: number): void {
  ss.ops.push({ x, y, op });
}

function solverOpCircle(s: SinglesState, ss: SolverState, x: number, y: number): void {
  if (!ingrid(s, x, y)) return;
  const i = y * s.w + x;
  if (s.flags[i] & F_BLACK) {
    s.impossible = true;
    return;
  }
  if (!(s.flags[i] & F_CIRCLE)) solverOpAdd(ss, x, y, OP_CIRCLE);
}

function solverOpBlacken(
  s: SinglesState,
  ss: SolverState,
  x: number,
  y: number,
  num: number,
): void {
  if (!ingrid(s, x, y)) return;
  const i = y * s.w + x;
  if (s.nums[i] !== num) return;
  if (s.flags[i] & F_CIRCLE) {
    s.impossible = true;
    return;
  }
  if (!(s.flags[i] & F_BLACK)) solverOpAdd(ss, x, y, OP_BLACK);
}

/** Apply every queued op, cascading new ops as blacks/circles imply
 * their neighbours. Returns the number of cells actually changed. */
export function solverOpsDo(s: SinglesState, ss: SolverState): number {
  let nextOp = 0;
  let nOps = 0;

  while (nextOp < ss.ops.length) {
    const op = ss.ops[nextOp++];
    const i = op.y * s.w + op.x;

    if (op.op === OP_BLACK) {
      if (s.flags[i] & F_CIRCLE) {
        s.impossible = true;
        return nOps;
      }
      if (!(s.flags[i] & F_BLACK)) {
        s.flags[i] |= F_BLACK;
        nOps++;
        solverOpCircle(s, ss, op.x - 1, op.y);
        solverOpCircle(s, ss, op.x + 1, op.y);
        solverOpCircle(s, ss, op.x, op.y - 1);
        solverOpCircle(s, ss, op.x, op.y + 1);
      }
    } else {
      if (s.flags[i] & F_BLACK) {
        s.impossible = true;
        return nOps;
      }
      if (!(s.flags[i] & F_CIRCLE)) {
        s.flags[i] |= F_CIRCLE;
        nOps++;
        for (let x = 0; x < s.w; x++) {
          if (x !== op.x) solverOpBlacken(s, ss, x, op.y, s.nums[i]);
        }
        for (let y = 0; y < s.h; y++) {
          if (y !== op.y) solverOpBlacken(s, ss, op.x, y, s.nums[i]);
        }
      }
    }
  }
  ss.ops = [];
  return nOps;
}

/* --- once-only deductions (number-only) --- */

/** SP/ST: identical numbers one cell apart force the middle cell white. */
function solveSinglesep(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  for (let x = 0; x < s.w; x++) {
    for (let y = 0; y < s.h; y++) {
      const i = y * s.w + x;
      const ir = i + 1;
      const irr = ir + 1;
      if (x < s.w - 2 && s.nums[i] === s.nums[irr] && !(s.flags[ir] & F_CIRCLE)) {
        solverOpAdd(ss, x + 1, y, OP_CIRCLE);
      }
      const id = i + s.w;
      const idd = id + s.w;
      if (y < s.h - 2 && s.nums[i] === s.nums[idd] && !(s.flags[id] & F_CIRCLE)) {
        solverOpAdd(ss, x, y + 1, OP_CIRCLE);
      }
    }
  }
  return ss.ops.length - before;
}

/** PI: an adjacent identical pair blackens every other matching number in
 * that row/column. */
function solveDoubles(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  for (let y = 0, i = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++, i++) {
      if (s.flags[i] & F_BLACK) continue;

      let ii = i + 1;
      if (x < s.w - 1 && !(s.flags[ii] & F_BLACK) && s.nums[i] === s.nums[ii]) {
        for (let xy = 0; xy < s.w; xy++) {
          if (xy === x || xy === x + 1) continue;
          const j = y * s.w + xy;
          if (s.nums[j] === s.nums[i] && !(s.flags[j] & F_BLACK)) {
            solverOpAdd(ss, xy, y, OP_BLACK);
          }
        }
      }

      ii = i + s.w;
      if (y < s.h - 1 && !(s.flags[ii] & F_BLACK) && s.nums[i] === s.nums[ii]) {
        for (let xy = 0; xy < s.h; xy++) {
          if (xy === y || xy === y + 1) continue;
          const j = xy * s.w + x;
          if (s.nums[j] === s.nums[i] && !(s.flags[j] & F_BLACK)) {
            solverOpAdd(ss, x, xy, OP_BLACK);
          }
        }
      }
    }
  }
  return ss.ops.length - before;
}

/** QC/TC/DC: deductions from a 2×2 grid corner (dx,dy point inward). */
function solveCorner(
  s: SinglesState,
  ss: SolverState,
  x: number,
  y: number,
  dx: number,
  dy: number,
): void {
  const w = s.w;
  const is: number[] = [];
  const ns: number[] = [];
  for (let yy = 0; yy < 2; yy++) {
    for (let xx = 0; xx < 2; xx++) {
      const idx = (y + dy * yy) * w + (x + dx * xx);
      is[yy * 2 + xx] = idx;
      ns[yy * 2 + xx] = s.nums[idx];
    }
  } /* order: (corner, side1, side2, inner) */

  if (ns[0] === ns[1] && ns[0] === ns[2] && ns[0] === ns[3]) {
    solverOpAdd(ss, is[0] % w, (is[0] / w) | 0, OP_BLACK);
    solverOpAdd(ss, is[3] % w, (is[3] / w) | 0, OP_BLACK);
  } else if (ns[0] === ns[1] && ns[0] === ns[2]) {
    solverOpAdd(ss, is[0] % w, (is[0] / w) | 0, OP_BLACK);
  } else if (ns[1] === ns[2] && ns[1] === ns[3]) {
    solverOpAdd(ss, is[3] % w, (is[3] / w) | 0, OP_BLACK);
  } else if (ns[0] === ns[1] || ns[1] === ns[3]) {
    solverOpAdd(ss, is[2] % w, (is[2] / w) | 0, OP_CIRCLE);
  } else if (ns[0] === ns[2] || ns[2] === ns[3]) {
    solverOpAdd(ss, is[1] % w, (is[1] / w) | 0, OP_CIRCLE);
  }
}

function solveCorners(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  solveCorner(s, ss, 0, 0, 1, 1);
  solveCorner(s, ss, s.w - 1, 0, -1, 1);
  solveCorner(s, ss, s.w - 1, s.h - 1, -1, -1);
  solveCorner(s, ss, 0, s.h - 1, 1, -1);
  return ss.ops.length - before;
}

/** IP: an offset pair of identical numbers forces two whites. */
function solveOffsetpairPair(
  s: SinglesState,
  ss: SolverState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const w = s.w;
  let ox: number;
  let oy: number;
  if (x1 === x2) {
    ox = 1;
    oy = 0;
  } else {
    ox = 0;
    oy = 1;
  }

  const ax = x1 + ox;
  const ay = y1 + oy;
  const an = s.nums[ay * w + ax];

  const dx = [x2 + ox + oy, x2 + ox - oy];
  const dy = [y2 + oy + ox, y2 + oy - ox];

  for (let d = 0; d < 2; d++) {
    if (ingrid(s, dx[d], dy[d]) && (dx[d] !== ax || dy[d] !== ay)) {
      const dn = s.nums[dy[d] * w + dx[d]];
      if (an === dn) {
        const xd = dx[d] - x2;
        const yd = dy[d] - y2;
        solverOpAdd(ss, x2 + xd, y2, OP_CIRCLE);
        solverOpAdd(ss, x2, y2 + yd, OP_CIRCLE);
      }
    }
  }
}

function solveOffsetpair(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  for (let x = 0; x < s.w - 1; x++) {
    for (let y = 0; y < s.h; y++) {
      const n1 = s.nums[y * s.w + x];
      for (let yy = y + 1; yy < s.h; yy++) {
        if (n1 === s.nums[yy * s.w + x]) {
          solveOffsetpairPair(s, ss, x, y, x, yy);
          solveOffsetpairPair(s, ss, x, yy, x, y);
        }
      }
    }
  }
  for (let y = 0; y < s.h - 1; y++) {
    for (let x = 0; x < s.w; x++) {
      const n1 = s.nums[y * s.w + x];
      for (let xx = x + 1; xx < s.w; xx++) {
        if (n1 === s.nums[y * s.w + xx]) {
          solveOffsetpairPair(s, ss, x, y, xx, y);
          solveOffsetpairPair(s, ss, xx, y, x, y);
        }
      }
    }
  }
  return ss.ops.length - before;
}

/* --- loop deductions --- */

/** CC/CE/QM: a white cell whose only non-black neighbour must be white. */
export function solveAllblackbutone(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  const dis = [-s.w, 1, s.w, -1];

  for (let y = 0, i = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++, i++) {
      if (s.flags[i] & F_BLACK) continue;

      let ifree = -1;
      let skip = false;
      for (let d = 0; d < 4; d++) {
        const xd = x + DXS[d];
        const yd = y + DYS[d];
        const id = i + dis[d];
        if (!ingrid(s, xd, yd)) continue;
        if (s.flags[id] & F_CIRCLE) {
          skip = true;
          break; /* this cell already has a way out */
        }
        if (!(s.flags[id] & F_BLACK)) {
          if (ifree !== -1) {
            skip = true;
            break; /* >1 white cell around it */
          }
          ifree = id;
        }
      }
      if (skip) continue;
      if (ifree !== -1) {
        solverOpAdd(ss, ifree % s.w, (ifree / s.w) | 0, OP_CIRCLE);
      } else {
        s.impossible = true;
        return 0;
      }
    }
  }
  return ss.ops.length - before;
}

/** Flood-fill from one white cell; true iff every white cell is reached
 * (the white region is contiguous). Mirrors solve_hassinglewhiteregion. */
function hasSingleWhiteRegion(s: SinglesState, ss: SolverState): boolean {
  let nwhite = 0;
  let lwhite = -1;
  for (let i = 0; i < s.n; i++) {
    if (!(s.flags[i] & F_BLACK)) {
      nwhite++;
      lwhite = i;
    }
    s.flags[i] &= ~F_SCRATCH;
  }
  if (lwhite === -1) {
    s.impossible = true;
    return false;
  }
  ss.scratch.fill(-1);
  ss.scratch[0] = lwhite;
  s.flags[lwhite] |= F_SCRATCH;
  let start = 0;
  let end = 1;
  let next = 1;
  while (start < end) {
    for (let a = start; a < end; a++) {
      const i = ss.scratch[a];
      for (let d = 0; d < 4; d++) {
        const x = (i % s.w) + DXS[d];
        const y = ((i / s.w) | 0) + DYS[d];
        const j = y * s.w + x;
        if (!ingrid(s, x, y)) continue;
        if (s.flags[j] & (F_BLACK | F_SCRATCH)) continue;
        ss.scratch[next++] = j;
        s.flags[j] |= F_SCRATCH;
      }
    }
    start = end;
    end = next;
  }
  return next === nwhite;
}

function solveRemovesplitsCheck(
  s: SinglesState,
  ss: SolverState,
  x: number,
  y: number,
): void {
  if (!ingrid(s, x, y)) return;
  const i = y * s.w + x;
  if (s.flags[i] & (F_CIRCLE | F_BLACK)) return;

  s.flags[i] |= F_BLACK;
  const issingle = hasSingleWhiteRegion(s, ss);
  s.flags[i] &= ~F_BLACK;

  if (!issingle) solverOpAdd(ss, x, y, OP_CIRCLE);
}

/** MC: a cell diagonal to a black that, if blackened, would split the
 * white region must itself be white. */
export function solveRemovesplits(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  if (!hasSingleWhiteRegion(s, ss)) {
    s.impossible = true;
    return 0;
  }
  for (let i = 0; i < s.n; i++) {
    if (!(s.flags[i] & F_BLACK)) continue;
    const x = i % s.w;
    const y = (i / s.w) | 0;
    solveRemovesplitsCheck(s, ss, x - 1, y - 1);
    solveRemovesplitsCheck(s, ss, x + 1, y - 1);
    solveRemovesplitsCheck(s, ss, x + 1, y + 1);
    solveRemovesplitsCheck(s, ss, x - 1, y + 1);
  }
  return ss.ops.length - before;
}

/** SNEAKY: a generation-artefact step — a number unique in its row AND
 * column must be white. Not implied by the rules; used only to grade a
 * board "too easy". `ss === null` counts without queuing ops. */
export function solveSneaky(s: SinglesState, ss: SolverState | null): number {
  let nunique = 0;
  for (let i = 0; i < s.n; i++) s.flags[i] &= ~F_SCRATCH;

  for (let x = 0; x < s.w; x++) {
    for (let y = 0; y < s.h; y++) {
      const i = y * s.w + x;
      for (let xx = x; xx < s.w; xx++) {
        const ii = y * s.w + xx;
        if (i === ii) continue;
        if (s.nums[i] === s.nums[ii]) {
          s.flags[i] |= F_SCRATCH;
          s.flags[ii] |= F_SCRATCH;
        }
      }
      for (let yy = y; yy < s.h; yy++) {
        const ii = yy * s.w + x;
        if (i === ii) continue;
        if (s.nums[i] === s.nums[ii]) {
          s.flags[i] |= F_SCRATCH;
          s.flags[ii] |= F_SCRATCH;
        }
      }
    }
  }

  for (let i = 0; i < s.n; i++) {
    if (!(s.flags[i] & F_SCRATCH)) {
      if (ss) solverOpAdd(ss, i % s.w, (i / s.w) | 0, OP_CIRCLE);
      nunique++;
    } else {
      s.flags[i] &= ~F_SCRATCH;
    }
  }
  return nunique;
}

/* --- completion check --- */

export const CC_MARK_ERRORS = 1;
export const CC_MUST_FILL = 2;

function connectIfSame(s: SinglesState, dsf: Dsf, i1: number, i2: number): void {
  if ((s.flags[i1] & F_BLACK) !== (s.flags[i2] & F_BLACK)) return;
  dsf.merge(i1, i2);
}

/** Count duplicate white numbers along one row/column; mark both circled
 * duplicates as errors when requested. Returns the error count. */
function checkRowcol(
  s: SinglesState,
  starti: number,
  di: number,
  sz: number,
  flags: number,
): number {
  let nerr = 0;
  for (let n = 0, i = starti; n < sz; n++, i += di) {
    if (s.flags[i] & F_BLACK) continue;
    for (let m = n + 1, j = i + di; m < sz; m++, j += di) {
      if (s.flags[j] & F_BLACK) continue;
      if (s.nums[i] !== s.nums[j]) continue;

      nerr++;
      if (!(flags & CC_MARK_ERRORS)) continue;
      if (s.flags[i] & F_CIRCLE && s.flags[j] & F_CIRCLE) {
        s.flags[i] |= F_ERROR;
        s.flags[j] |= F_ERROR;
      }
    }
  }
  return nerr;
}

/** Returns true when the board has no errors. In MUST_FILL mode an
 * undecided cell counts as an error (solver completeness). */
export function checkComplete(s: SinglesState, flags: number): boolean {
  const dsf = new Dsf(s.n);
  let error = 0;
  const w = s.w;
  const h = s.h;

  if (flags & CC_MARK_ERRORS) {
    for (let i = 0; i < s.n; i++) s.flags[i] &= ~F_ERROR;
  }

  /* Connected blocks: connections tracked right and down. */
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      if (x < w - 1) connectIfSame(s, dsf, i, i + 1);
      if (y < h - 1) connectIfSame(s, dsf, i, i + w);
    }
  }

  if (flags & CC_MUST_FILL) {
    for (let i = 0; i < s.n; i++) {
      if (!(s.flags[i] & F_BLACK) && !(s.flags[i] & F_CIRCLE)) error += 1;
    }
  }

  let nwhite = 0;
  for (let i = 0; i < s.n; i++) {
    if (s.flags[i] & F_BLACK) {
      if (dsf.size(i) > 1) {
        error += 1;
        if (flags & CC_MARK_ERRORS) s.flags[i] |= F_ERROR;
      }
    } else {
      nwhite += 1;
    }
  }

  for (let x = 0; x < w; x++) error += checkRowcol(s, x, w, h, flags);
  for (let y = 0; y < h; y++) error += checkRowcol(s, y * w, 1, w, flags);

  /* Largest white region is canonical; all other white regions are errors. */
  let largest = 0;
  let canonical = -1;
  for (let i = 0; i < s.n; i++) {
    if (!(s.flags[i] & F_BLACK)) {
      const size = dsf.size(i);
      if (largest < size) {
        largest = size;
        canonical = dsf.canonify(i);
      }
    }
  }
  if (largest < nwhite) {
    for (let i = 0; i < s.n; i++) {
      if (!(s.flags[i] & F_BLACK) && dsf.canonify(i) !== canonical) {
        error += 1;
        if (flags & CC_MARK_ERRORS) s.flags[i] |= F_ERROR;
      }
    }
  }

  return error === 0;
}

/* --- the driver --- */

/** Solve `state` (mutating its flags) at `diff`, optionally running the
 * sneaky pre-step. Returns -1 impossible, 0 stuck, 1 solved. */
export function solveSpecific(
  state: SinglesState,
  diff: number,
  sneaky: boolean,
): number {
  const ss = newSolverState(state);

  if (sneaky) solveSneaky(state, ss);

  solveSinglesep(state, ss);
  solveDoubles(state, ss);
  solveCorners(state, ss);
  if (diff >= DIFF_TRICKY) solveOffsetpair(state, ss);

  while (true) {
    if (ss.ops.length > 0) solverOpsDo(state, ss);
    if (state.impossible) break;

    if (solveAllblackbutone(state, ss) > 0) continue;
    if (state.impossible) break;

    if (diff >= DIFF_TRICKY) {
      if (solveRemovesplits(state, ss) > 0) continue;
      if (state.impossible) break;
    }

    break;
  }

  if (state.impossible) return -1;
  return checkComplete(state, CC_MUST_FILL) ? 1 : 0;
}
