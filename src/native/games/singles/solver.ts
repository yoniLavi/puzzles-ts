/**
 * Singles (Hitori) deductive solver — port of the solver in `singles.c`.
 *
 * Works on a mutable working {@link SinglesState} (mutating `flags` and
 * `impossible`); the caller supplies a blank-flagged copy. The op-queue
 * cascade and each deduction mirror upstream so the difficulty grading —
 * and therefore the generator's published board — matches C exactly.
 */
import { Dsf } from "../../engine/dsf.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import {
  cloneState,
  DIFF_ANY,
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

/** A grid coordinate. */
export interface Pt {
  x: number;
  y: number;
}

/**
 * Why a cell is forced — the premise a hint narrates and highlights.
 * Each variant mirrors one named upstream deduction (the reason strings
 * `solver_op_add` carries in `singles.c`) or one of the two op-queue
 * cascade rules. The captured cells are the deduction's evidence.
 */
export type SinglesReason =
  /** SP/ST: two equal numbers one cell apart force the middle white. */
  | { kind: "sandwich"; ends: [Pt, Pt] }
  /** PI: an adjacent equal pair blackens the other copies in its line. */
  | { kind: "pair"; pair: [Pt, Pt] }
  /** QC: a 2×2 corner of four equal numbers blackens this diagonal. */
  | { kind: "corner4"; block: Pt[] }
  /** TC: three equal numbers in a 2×2 corner blacken the apex. `corner`
   * is the board-corner cell that would be stranded; `matched` are the
   * three cells sharing the number. */
  | { kind: "corner3"; corner: Pt; matched: Pt[] }
  /** DC: two equal numbers in a 2×2 corner force the other neighbour
   * white. `corner` is the board-corner cell at risk of being sealed off;
   * `pair` are the two cells sharing the number. */
  | { kind: "corner2"; corner: Pt; pair: [Pt, Pt] }
  /** IP: an offset pair of equal numbers forces two whites. */
  | { kind: "offset"; quad: Pt[] }
  /** SB cascade: a cell next to a new black must be white. */
  | { kind: "adjBlack"; black: Pt }
  /** SC cascade: a number sharing a line with a new circle must be black. */
  | { kind: "sameLine"; circled: Pt }
  /** CC/CE/QM: a white cell with one non-black neighbour forces it white. */
  | { kind: "boxedIn"; cell: Pt }
  /** MC: a cell whose shading would split the white region must be white. */
  | { kind: "split"; neighbours: Pt[] };

/** One forced cell recorded for a hint, in deduction order. `group`
 * ties together cells forced by one firing (the only multi-cell firings
 * are corner-4 and offset-pair). */
export interface HintRecord {
  x: number;
  y: number;
  op: number;
  reason: SinglesReason;
  group: number;
}

interface Op {
  x: number;
  y: number;
  op: number;
  /** Present only when the solver runs in recording (hint) mode. */
  reason?: SinglesReason;
  group?: number;
}

/** The solver's op queue + flood-fill scratch (upstream solver_state).
 * In recording (hint) mode it also carries the ordered `records` and a
 * `group` counter; when those are absent the solver is byte-for-byte the
 * generator's path and records nothing. */
export interface SolverState {
  ops: Op[];
  scratch: Int32Array;
  records?: HintRecord[];
  group: number;
}

export function newSolverState(s: SinglesState): SolverState {
  return { ops: [], scratch: new Int32Array(s.n), group: 0 };
}

/** Allocate a fresh firing-group id (recording mode only). */
function newGroup(ss: SolverState): number {
  return ss.records ? ss.group++ : 0;
}

/** Record an applied op (recording mode only). Called the moment a flag
 * actually changes, so records land in deduction order. */
function recordOp(ss: SolverState, op: Op): void {
  if (ss.records && op.reason) {
    ss.records.push({
      x: op.x,
      y: op.y,
      op: op.op,
      reason: op.reason,
      group: op.group ?? newGroup(ss),
    });
  }
}

function ingrid(s: SinglesState, x: number, y: number): boolean {
  return x >= 0 && x < s.w && y >= 0 && y < s.h;
}

export function solverOpAdd(
  ss: SolverState,
  x: number,
  y: number,
  op: number,
  reason?: SinglesReason,
  group?: number,
): void {
  ss.ops.push({ x, y, op, reason, group });
}

function solverOpCircle(
  s: SinglesState,
  ss: SolverState,
  x: number,
  y: number,
  reason?: SinglesReason,
  group?: number,
): void {
  if (!ingrid(s, x, y)) return;
  const i = y * s.w + x;
  if (s.flags[i] & F_BLACK) {
    s.impossible = true;
    return;
  }
  if (!(s.flags[i] & F_CIRCLE)) solverOpAdd(ss, x, y, OP_CIRCLE, reason, group);
}

function solverOpBlacken(
  s: SinglesState,
  ss: SolverState,
  x: number,
  y: number,
  num: number,
  reason?: SinglesReason,
  group?: number,
): void {
  if (!ingrid(s, x, y)) return;
  const i = y * s.w + x;
  if (s.nums[i] !== num) return;
  if (s.flags[i] & F_CIRCLE) {
    s.impossible = true;
    return;
  }
  if (!(s.flags[i] & F_BLACK)) solverOpAdd(ss, x, y, OP_BLACK, reason, group);
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
        recordOp(ss, op);
        // SB cascade: a new black forces its neighbours white — one firing.
        const r = ss.records
          ? { kind: "adjBlack" as const, black: { x: op.x, y: op.y } }
          : undefined;
        const g = ss.records ? newGroup(ss) : undefined;
        solverOpCircle(s, ss, op.x - 1, op.y, r, g);
        solverOpCircle(s, ss, op.x + 1, op.y, r, g);
        solverOpCircle(s, ss, op.x, op.y - 1, r, g);
        solverOpCircle(s, ss, op.x, op.y + 1, r, g);
      }
    } else {
      if (s.flags[i] & F_BLACK) {
        s.impossible = true;
        return nOps;
      }
      if (!(s.flags[i] & F_CIRCLE)) {
        s.flags[i] |= F_CIRCLE;
        nOps++;
        recordOp(ss, op);
        // SC cascade: a new circle blackens its line-mates of equal
        // number — one firing forcing every other copy in its row/column.
        const r = ss.records
          ? { kind: "sameLine" as const, circled: { x: op.x, y: op.y } }
          : undefined;
        const g = ss.records ? newGroup(ss) : undefined;
        for (let x = 0; x < s.w; x++) {
          if (x !== op.x) solverOpBlacken(s, ss, x, op.y, s.nums[i], r, g);
        }
        for (let y = 0; y < s.h; y++) {
          if (y !== op.y) solverOpBlacken(s, ss, op.x, y, s.nums[i], r, g);
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
        solverOpAdd(
          ss,
          x + 1,
          y,
          OP_CIRCLE,
          ss.records
            ? {
                kind: "sandwich",
                ends: [
                  { x, y },
                  { x: x + 2, y },
                ],
              }
            : undefined,
          newGroup(ss),
        );
      }
      const id = i + s.w;
      const idd = id + s.w;
      if (y < s.h - 2 && s.nums[i] === s.nums[idd] && !(s.flags[id] & F_CIRCLE)) {
        solverOpAdd(
          ss,
          x,
          y + 1,
          OP_CIRCLE,
          ss.records
            ? {
                kind: "sandwich",
                ends: [
                  { x, y },
                  { x, y: y + 2 },
                ],
              }
            : undefined,
          newGroup(ss),
        );
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
        // One firing: this pair forces every other copy in the row black.
        const reason: SinglesReason | undefined = ss.records
          ? {
              kind: "pair",
              pair: [
                { x, y },
                { x: x + 1, y },
              ],
            }
          : undefined;
        const g = newGroup(ss);
        for (let xy = 0; xy < s.w; xy++) {
          if (xy === x || xy === x + 1) continue;
          const j = y * s.w + xy;
          if (s.nums[j] === s.nums[i] && !(s.flags[j] & F_BLACK)) {
            solverOpAdd(ss, xy, y, OP_BLACK, reason, g);
          }
        }
      }

      ii = i + s.w;
      if (y < s.h - 1 && !(s.flags[ii] & F_BLACK) && s.nums[i] === s.nums[ii]) {
        const reason: SinglesReason | undefined = ss.records
          ? {
              kind: "pair",
              pair: [
                { x, y },
                { x, y: y + 1 },
              ],
            }
          : undefined;
        const g = newGroup(ss);
        for (let xy = 0; xy < s.h; xy++) {
          if (xy === y || xy === y + 1) continue;
          const j = xy * s.w + x;
          if (s.nums[j] === s.nums[i] && !(s.flags[j] & F_BLACK)) {
            solverOpAdd(ss, x, xy, OP_BLACK, reason, g);
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

  const rec = !!ss.records;
  const P = (k: number): Pt => ({ x: is[k] % w, y: (is[k] / w) | 0 });
  const cx = (k: number): number => is[k] % w;
  const cy = (k: number): number => (is[k] / w) | 0;

  if (ns[0] === ns[1] && ns[0] === ns[2] && ns[0] === ns[3]) {
    // QC: all four equal — both far-diagonal cells black, one firing.
    const reason: SinglesReason | undefined = rec
      ? { kind: "corner4", block: [P(0), P(1), P(2), P(3)] }
      : undefined;
    const g = newGroup(ss);
    solverOpAdd(ss, cx(0), cy(0), OP_BLACK, reason, g);
    solverOpAdd(ss, cx(3), cy(3), OP_BLACK, reason, g);
  } else if (ns[0] === ns[1] && ns[0] === ns[2]) {
    // TC: corner matches both sides — the corner itself is the apex.
    solverOpAdd(
      ss,
      cx(0),
      cy(0),
      OP_BLACK,
      rec ? { kind: "corner3", corner: P(0), matched: [P(0), P(1), P(2)] } : undefined,
      newGroup(ss),
    );
  } else if (ns[1] === ns[2] && ns[1] === ns[3]) {
    // TC: inner matches both sides — the inner is the apex; the corner
    // (P(0)) is the cell that would be stranded.
    solverOpAdd(
      ss,
      cx(3),
      cy(3),
      OP_BLACK,
      rec ? { kind: "corner3", corner: P(0), matched: [P(1), P(2), P(3)] } : undefined,
      newGroup(ss),
    );
  } else if (ns[0] === ns[1] || ns[1] === ns[3]) {
    // DC: side1 is in a matching pair — the corner's other neighbour
    // (side2) stays white. The pair is (corner,side1) or (side1,inner).
    const pair: [Pt, Pt] = ns[0] === ns[1] ? [P(0), P(1)] : [P(1), P(3)];
    solverOpAdd(
      ss,
      cx(2),
      cy(2),
      OP_CIRCLE,
      rec ? { kind: "corner2", corner: P(0), pair } : undefined,
      newGroup(ss),
    );
  } else if (ns[0] === ns[2] || ns[2] === ns[3]) {
    // DC mirror: side2 is in a matching pair — side1 stays white.
    const pair: [Pt, Pt] = ns[0] === ns[2] ? [P(0), P(2)] : [P(2), P(3)];
    solverOpAdd(
      ss,
      cx(1),
      cy(1),
      OP_CIRCLE,
      rec ? { kind: "corner2", corner: P(0), pair } : undefined,
      newGroup(ss),
    );
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
        // One firing: the two offset pairs (A at (x1,y1)&(x2,y2), B at
        // (ax,ay)&(dx,dy)) force both these neighbours of (x2,y2) white.
        const reason: SinglesReason | undefined = ss.records
          ? {
              kind: "offset",
              quad: [
                { x: x1, y: y1 },
                { x: ax, y: ay },
                { x: x2, y: y2 },
                { x: dx[d], y: dy[d] },
              ],
            }
          : undefined;
        const g = newGroup(ss);
        solverOpAdd(ss, x2 + xd, y2, OP_CIRCLE, reason, g);
        solverOpAdd(ss, x2, y2 + yd, OP_CIRCLE, reason, g);
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
        solverOpAdd(
          ss,
          ifree % s.w,
          (ifree / s.w) | 0,
          OP_CIRCLE,
          ss.records ? { kind: "boxedIn", cell: { x, y } } : undefined,
          newGroup(ss),
        );
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

  if (!issingle) {
    // Evidence: the non-black orthogonal neighbours this cell bridges —
    // shading it would split them into disconnected white regions.
    let reason: SinglesReason | undefined;
    if (ss.records) {
      const neighbours: Pt[] = [];
      for (let d = 0; d < 4; d++) {
        const xd = x + DXS[d];
        const yd = y + DYS[d];
        if (ingrid(s, xd, yd) && !(s.flags[yd * s.w + xd] & F_BLACK)) {
          neighbours.push({ x: xd, y: yd });
        }
      }
      reason = { kind: "split", neighbours };
    }
    solverOpAdd(ss, x, y, OP_CIRCLE, reason, newGroup(ss));
  }
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
 * sneaky pre-step. Returns -1 impossible, 0 stuck, 1 solved. The caller
 * may pass a recording `ss` (see {@link deduceHintPlan}); otherwise a
 * fresh non-recording one is used (the generator's byte-identical path). */
export function solveSpecific(
  state: SinglesState,
  diff: number,
  sneaky: boolean,
  ss: SolverState = newSolverState(state),
): number {
  if (sneaky) solveSneaky(state, ss);

  solveSinglesep(state, ss);
  solveDoubles(state, ss);
  solveCorners(state, ss);
  if (diff >= DIFF_TRICKY) solveOffsetpair(state, ss);

  // Guard the hint/recording path against a non-terminating fixpoint; the
  // generator (non-recording `ss`) runs unguarded and byte-for-byte unchanged.
  const budget = ss.records ? stepBudget("singles hint") : undefined;
  while (true) {
    budget?.tick();
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

/** Run the deductive solver from the player's current marks (a clone of
 * `state`), recording every forced cell in deduction order with the
 * reason that forces it — the data a hint plan narrates. Uses `DIFF_ANY`
 * (every rule, no sneaky), the level `findMistakes`/`solve` use, so a
 * uniquely-solvable board yields the full remaining solution. */
export function deduceHintPlan(state: SinglesState): HintRecord[] {
  const work = cloneState(state);
  const ss = newSolverState(work);
  ss.records = [];
  ss.group = 0;
  primeCascadeFromMarks(work, ss);
  solveSpecific(work, DIFF_ANY, false, ss);
  return ss.records;
}

/**
 * Seed the op queue with the cascade implications of cells the player has
 * already decided. `solverOpsDo` fires a cell's cascade (a black forces its
 * neighbours white; a circle blackens its equal line-mates) only when it
 * *changes* that cell during this solve run. `solveSpecific` is written to run
 * from an empty board (upstream's only use), so resuming it from the player's
 * marks — the hint path — would never propagate from those marks and the
 * solver stalls partway. Priming the existing marks' implications makes the
 * solve resumable from any consistent partial position, so a hint can always
 * make progress on a still-solvable board. (Hint-only: the generator solves
 * from empty with a non-recording state, so its byte-identical path is
 * untouched.)
 */
function primeCascadeFromMarks(s: SinglesState, ss: SolverState): void {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (s.flags[i] & F_BLACK) {
        const r = ss.records
          ? { kind: "adjBlack" as const, black: { x, y } }
          : undefined;
        const g = ss.records ? newGroup(ss) : undefined;
        solverOpCircle(s, ss, x - 1, y, r, g);
        solverOpCircle(s, ss, x + 1, y, r, g);
        solverOpCircle(s, ss, x, y - 1, r, g);
        solverOpCircle(s, ss, x, y + 1, r, g);
      } else if (s.flags[i] & F_CIRCLE) {
        const r = ss.records
          ? { kind: "sameLine" as const, circled: { x, y } }
          : undefined;
        const g = ss.records ? newGroup(ss) : undefined;
        for (let xx = 0; xx < s.w; xx++) {
          if (xx !== x) solverOpBlacken(s, ss, xx, y, s.nums[i], r, g);
        }
        for (let yy = 0; yy < s.h; yy++) {
          if (yy !== y) solverOpBlacken(s, ss, x, yy, s.nums[i], r, g);
        }
      }
    }
  }
}
