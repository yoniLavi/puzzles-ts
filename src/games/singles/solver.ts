/**
 * Singles (Hitori) deductive solver, a port of the solver in `singles.c`.
 *
 * Works on a mutable working {@link SinglesState} (mutating `flags` and
 * `impossible`); the caller supplies a blank-flagged copy. The op-queue
 * cascade and each deduction mirror upstream so the difficulty grading —
 * and therefore the generator's published board — matches C exactly.
 */
import { runDeductionFixpoint } from "../../engine/deduction-fixpoint.ts";
import { Dsf } from "../../engine/dsf.ts";
import { stepBudget } from "../../engine/step-budget.ts";
import type { Point } from "../../engine/types.ts";
import {
  cloneState,
  DIFF_ANY,
  DIFF_EASY,
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

/** Defined here, beside the solver's hot loops, rather than in `state.ts`:
 * imported from there, generation and solving ran 1.2-1.4x slower under
 * vitest (paired timing, 2026-09-11). */
export function inGrid(s: SinglesState, x: number, y: number): boolean {
  return x >= 0 && x < s.w && y >= 0 && y < s.h;
}

export const OP_BLACK = 0;
export const OP_CIRCLE = 1;

/**
 * Why a cell is forced — the premise a hint narrates and highlights.
 * Each variant mirrors one named upstream deduction (the reason strings
 * `solver_op_add` carries in `singles.c`) or one of the two op-queue
 * cascade rules. The captured cells are the deduction's evidence.
 */
export type SinglesReason =
  /** SP/ST: two equal numbers one cell apart force the middle white. */
  | { kind: "sandwich"; ends: [Point, Point] }
  /** PI: an adjacent equal pair blackens the other copies in its line. */
  | { kind: "pair"; pair: [Point, Point] }
  /** QC: a 2×2 corner of four equal numbers blackens this diagonal. */
  | { kind: "corner4"; block: Point[] }
  /** TC: three equal numbers in a 2×2 corner blacken the apex. `corner`
   * is the board-corner cell that would be stranded; `matched` are the
   * three cells sharing the number. */
  | { kind: "corner3"; corner: Point; matched: Point[] }
  /** DC: two equal numbers in a 2×2 corner force the other neighbor
   * white. `corner` is the board-corner cell at risk of being sealed off;
   * `pair` are the two cells sharing the number. */
  | { kind: "corner2"; corner: Point; pair: [Point, Point] }
  /** IP: an offset pair of equal numbers forces two whites. */
  | { kind: "offset"; quad: Point[] }
  /** SB cascade: a cell next to a new black must be white. */
  | { kind: "adjBlack"; black: Point }
  /** SC cascade: a number sharing a line with a new circle must be black. */
  | { kind: "sameLine"; circled: Point }
  /** CC/CE/QM: a white cell with one non-black neighbor forces it white. */
  | { kind: "boxedIn"; cell: Point }
  /** MC: a cell whose shading would split the white region must be white. */
  | { kind: "split"; neighbors: Point[] };

/** One forced cell recorded for a hint, in deduction order. `group` ties
 * together the cells forced by one firing. */
export interface HintRecord extends Point {
  op: number;
  reason: SinglesReason;
  group: number;
}

interface Op extends Point {
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
  if (!inGrid(s, x, y)) return;
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
  if (!inGrid(s, x, y)) return;
  const i = y * s.w + x;
  if (s.nums[i] !== num) return;
  if (s.flags[i] & F_CIRCLE) {
    s.impossible = true;
    return;
  }
  if (!(s.flags[i] & F_BLACK)) solverOpAdd(ss, x, y, OP_BLACK, reason, group);
}

/** SB cascade: a black cell forces its four neighbors white — one firing. */
function cascadeFromBlack(
  s: SinglesState,
  ss: SolverState,
  x: number,
  y: number,
): void {
  const r = ss.records ? { kind: "adjBlack" as const, black: { x, y } } : undefined;
  const g = newGroup(ss);
  solverOpCircle(s, ss, x - 1, y, r, g);
  solverOpCircle(s, ss, x + 1, y, r, g);
  solverOpCircle(s, ss, x, y - 1, r, g);
  solverOpCircle(s, ss, x, y + 1, r, g);
}

/** SC cascade: a circle blackens every equal number in its row and column —
 * one firing. */
function cascadeFromCircle(
  s: SinglesState,
  ss: SolverState,
  x: number,
  y: number,
): void {
  const num = s.nums[y * s.w + x];
  const r = ss.records ? { kind: "sameLine" as const, circled: { x, y } } : undefined;
  const g = newGroup(ss);
  for (let xx = 0; xx < s.w; xx++) {
    if (xx !== x) solverOpBlacken(s, ss, xx, y, num, r, g);
  }
  for (let yy = 0; yy < s.h; yy++) {
    if (yy !== y) solverOpBlacken(s, ss, x, yy, num, r, g);
  }
}

/** Apply every queued op, cascading new ops as blacks/circles imply
 * their neighbors. */
export function solverOpsDo(s: SinglesState, ss: SolverState): void {
  for (let next = 0; next < ss.ops.length; next++) {
    const op = ss.ops[next];
    const i = op.y * s.w + op.x;
    const set = op.op === OP_BLACK ? F_BLACK : F_CIRCLE;
    const clash = op.op === OP_BLACK ? F_CIRCLE : F_BLACK;
    if (s.flags[i] & clash) {
      s.impossible = true;
      return;
    }
    if (s.flags[i] & set) continue;
    s.flags[i] |= set;
    recordOp(ss, op);
    if (op.op === OP_BLACK) cascadeFromBlack(s, ss, op.x, op.y);
    else cascadeFromCircle(s, ss, op.x, op.y);
  }
  ss.ops = [];
}

/* --- once-only deductions (number-only) --- */

/** SP/ST: identical numbers one cell apart force the middle cell white. */
function solveSinglesep(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  // The ends sit at (x, y) and two steps along (dx, dy).
  const sandwich = (x: number, y: number, dx: number, dy: number): void => {
    const i = y * s.w + x;
    const mid = i + dy * s.w + dx;
    if (s.nums[i] !== s.nums[mid + dy * s.w + dx] || s.flags[mid] & F_CIRCLE) return;
    const reason: SinglesReason | undefined = ss.records
      ? {
          kind: "sandwich",
          ends: [
            { x, y },
            { x: x + 2 * dx, y: y + 2 * dy },
          ],
        }
      : undefined;
    solverOpAdd(ss, x + dx, y + dy, OP_CIRCLE, reason, newGroup(ss));
  };
  for (let x = 0; x < s.w; x++) {
    for (let y = 0; y < s.h; y++) {
      if (x < s.w - 2) sandwich(x, y, 1, 0);
      if (y < s.h - 2) sandwich(x, y, 0, 1);
    }
  }
  return ss.ops.length - before;
}

/** PI: an adjacent identical pair blackens every other matching number in
 * that row/column. */
function solveDoubles(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  // The pair sits at (x, y) and one step along (dx, dy); one firing blackens
  // every other copy along that line.
  const pair = (x: number, y: number, dx: number, dy: number): void => {
    const i = y * s.w + x;
    const j = i + dy * s.w + dx;
    if (s.flags[j] & F_BLACK || s.nums[i] !== s.nums[j]) return;
    const reason: SinglesReason | undefined = ss.records
      ? {
          kind: "pair",
          pair: [
            { x, y },
            { x: x + dx, y: y + dy },
          ],
        }
      : undefined;
    const g = newGroup(ss);
    const at = dx ? x : y;
    for (let k = 0; k < (dx ? s.w : s.h); k++) {
      if (k === at || k === at + 1) continue;
      const cx = dx ? k : x;
      const cy = dx ? y : k;
      const c = cy * s.w + cx;
      if (s.nums[c] === s.nums[i] && !(s.flags[c] & F_BLACK)) {
        solverOpAdd(ss, cx, cy, OP_BLACK, reason, g);
      }
    }
  };
  for (let y = 0, i = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++, i++) {
      if (s.flags[i] & F_BLACK) continue;
      if (x < s.w - 1) pair(x, y, 1, 0);
      if (y < s.h - 1) pair(x, y, 0, 1);
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
  const corner = { x, y };
  const side1 = { x: x + dx, y };
  const side2 = { x, y: y + dy };
  const inner = { x: x + dx, y: y + dy };
  const [nc, n1, n2, ni] = [corner, side1, side2, inner].map(
    (p) => s.nums[p.y * s.w + p.x],
  );
  const rec = !!ss.records;

  if (nc === n1 && nc === n2 && nc === ni) {
    // QC: all four equal — both far-diagonal cells black, one firing.
    const reason: SinglesReason | undefined = rec
      ? { kind: "corner4", block: [corner, side1, side2, inner] }
      : undefined;
    const g = newGroup(ss);
    solverOpAdd(ss, corner.x, corner.y, OP_BLACK, reason, g);
    solverOpAdd(ss, inner.x, inner.y, OP_BLACK, reason, g);
  } else if (nc === n1 && nc === n2) {
    // TC: corner matches both sides — the corner itself is the apex.
    solverOpAdd(
      ss,
      corner.x,
      corner.y,
      OP_BLACK,
      rec ? { kind: "corner3", corner, matched: [corner, side1, side2] } : undefined,
      newGroup(ss),
    );
  } else if (n1 === n2 && n1 === ni) {
    // TC: inner matches both sides — the inner is the apex; the corner is
    // the cell that would be stranded.
    solverOpAdd(
      ss,
      inner.x,
      inner.y,
      OP_BLACK,
      rec ? { kind: "corner3", corner, matched: [side1, side2, inner] } : undefined,
      newGroup(ss),
    );
  } else if (nc === n1 || n1 === ni) {
    // DC: side1 is in a matching pair — the corner's other neighbor
    // (side2) stays white. The pair is (corner,side1) or (side1,inner).
    const pair: [Point, Point] = nc === n1 ? [corner, side1] : [side1, inner];
    solverOpAdd(
      ss,
      side2.x,
      side2.y,
      OP_CIRCLE,
      rec ? { kind: "corner2", corner, pair } : undefined,
      newGroup(ss),
    );
  } else if (nc === n2 || n2 === ni) {
    // DC mirror: side2 is in a matching pair — side1 stays white.
    const pair: [Point, Point] = nc === n2 ? [corner, side2] : [side2, inner];
    solverOpAdd(
      ss,
      side1.x,
      side1.y,
      OP_CIRCLE,
      rec ? { kind: "corner2", corner, pair } : undefined,
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
  // (ox, oy) steps from the pair's line to the next one.
  const ox = x1 === x2 ? 1 : 0;
  const oy = 1 - ox;
  const ax = x1 + ox;
  const ay = y1 + oy;
  const an = s.nums[ay * s.w + ax];

  for (const sign of [1, -1]) {
    const xd = ox + sign * oy;
    const yd = oy + sign * ox;
    const bx = x2 + xd;
    const by = y2 + yd;
    if (!inGrid(s, bx, by) || (bx === ax && by === ay)) continue;
    if (s.nums[by * s.w + bx] !== an) continue;
    // One firing: the two offset pairs (A at (x1,y1)&(x2,y2), B at
    // (ax,ay)&(bx,by)) force both these neighbors of (x2,y2) white.
    const reason: SinglesReason | undefined = ss.records
      ? {
          kind: "offset",
          quad: [
            { x: x1, y: y1 },
            { x: ax, y: ay },
            { x: x2, y: y2 },
            { x: bx, y: by },
          ],
        }
      : undefined;
    const g = newGroup(ss);
    solverOpAdd(ss, x2 + xd, y2, OP_CIRCLE, reason, g);
    solverOpAdd(ss, x2, y2 + yd, OP_CIRCLE, reason, g);
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

/** CC/CE/QM: a white cell whose only non-black neighbor must be white. */
export function solveAllblackbutone(s: SinglesState, ss: SolverState): number {
  const before = ss.ops.length;
  for (let y = 0, i = 0; y < s.h; y++) {
    cells: for (let x = 0; x < s.w; x++, i++) {
      if (s.flags[i] & F_BLACK) continue;

      let free = -1;
      for (let d = 0; d < 4; d++) {
        const xd = x + DXS[d];
        const yd = y + DYS[d];
        if (!inGrid(s, xd, yd)) continue;
        const id = yd * s.w + xd;
        if (s.flags[id] & F_CIRCLE) continue cells; /* already has a way out */
        if (s.flags[id] & F_BLACK) continue;
        if (free !== -1) continue cells; /* >1 white cell around it */
        free = id;
      }
      if (free === -1) {
        s.impossible = true;
        return 0;
      }
      solverOpAdd(
        ss,
        free % s.w,
        (free / s.w) | 0,
        OP_CIRCLE,
        ss.records ? { kind: "boxedIn", cell: { x, y } } : undefined,
        newGroup(ss),
      );
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
  // Breadth-first: `ss.scratch` is the queue, F_SCRATCH marks a queued cell.
  const queue = ss.scratch;
  queue[0] = lwhite;
  s.flags[lwhite] |= F_SCRATCH;
  let end = 1;
  for (let a = 0; a < end; a++) {
    const cx = queue[a] % s.w;
    const cy = (queue[a] / s.w) | 0;
    for (let d = 0; d < 4; d++) {
      const x = cx + DXS[d];
      const y = cy + DYS[d];
      if (!inGrid(s, x, y)) continue;
      const j = y * s.w + x;
      if (s.flags[j] & (F_BLACK | F_SCRATCH)) continue;
      queue[end++] = j;
      s.flags[j] |= F_SCRATCH;
    }
  }
  return end === nwhite;
}

function solveRemovesplitsCheck(
  s: SinglesState,
  ss: SolverState,
  x: number,
  y: number,
): void {
  if (!inGrid(s, x, y)) return;
  const i = y * s.w + x;
  if (s.flags[i] & (F_CIRCLE | F_BLACK)) return;

  s.flags[i] |= F_BLACK;
  const issingle = hasSingleWhiteRegion(s, ss);
  s.flags[i] &= ~F_BLACK;

  if (!issingle) {
    // Evidence: the non-black orthogonal neighbors this cell bridges —
    // shading it would split them into disconnected white regions.
    let reason: SinglesReason | undefined;
    if (ss.records) {
      const neighbors: Point[] = [];
      for (let d = 0; d < 4; d++) {
        const xd = x + DXS[d];
        const yd = y + DYS[d];
        if (inGrid(s, xd, yd) && !(s.flags[yd * s.w + xd] & F_BLACK)) {
          neighbors.push({ x: xd, y: yd });
        }
      }
      reason = { kind: "split", neighbors };
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

/** SNEAKY: a generation-artifact step — a number unique in its row AND
 * column must be white. Not implied by the rules; used only to grade a
 * board "too easy". */
function solveSneaky(s: SinglesState, ss: SolverState): void {
  for (let i = 0; i < s.n; i++) s.flags[i] &= ~F_SCRATCH;

  // Mark every number that repeats along its row or column.
  for (let x = 0; x < s.w; x++) {
    for (let y = 0; y < s.h; y++) {
      const i = y * s.w + x;
      for (let xx = x + 1; xx < s.w; xx++) {
        const ii = y * s.w + xx;
        if (s.nums[i] === s.nums[ii]) {
          s.flags[i] |= F_SCRATCH;
          s.flags[ii] |= F_SCRATCH;
        }
      }
      for (let yy = y + 1; yy < s.h; yy++) {
        const ii = yy * s.w + x;
        if (s.nums[i] === s.nums[ii]) {
          s.flags[i] |= F_SCRATCH;
          s.flags[ii] |= F_SCRATCH;
        }
      }
    }
  }

  for (let i = 0; i < s.n; i++) {
    if (s.flags[i] & F_SCRATCH) s.flags[i] &= ~F_SCRATCH;
    else solverOpAdd(ss, i % s.w, (i / s.w) | 0, OP_CIRCLE);
  }
}

/* --- completion check --- */

export const CC_MARK_ERRORS = 1;
export const CC_MUST_FILL = 2;

function connectIfSame(s: SinglesState, dsf: Dsf, i1: number, i2: number): void {
  if ((s.flags[i1] & F_BLACK) === (s.flags[i2] & F_BLACK)) dsf.merge(i1, i2);
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
  const { w, h } = s;

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
      if (!(s.flags[i] & (F_BLACK | F_CIRCLE))) error += 1;
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

  // The shared ordered technique ladder (`engine/deduction-fixpoint.ts`). Two
  // mappings are worth reading before editing this:
  //
  //  - **The op-queue drain is a technique, in position 0, that never fires.**
  //    The ladder restarts from the top the moment anything fires, so a
  //    technique that always reports `0` is attempted exactly once per
  //    iteration, before anything else — which is precisely "drain the queue at
  //    the top of the loop", said in terms the runner already guarantees.
  //  - **`state.impossible` is the `-1` arm**, consulted per technique, exactly
  //    where upstream's loop consults it.
  //
  // The ordering below is load-bearing: upstream tests the return `> 0` *before*
  // the flag, so a technique that makes progress **and** raises `impossible`
  // takes the restart — which drains the queue once more before the flag stops
  // the ladder. Each technique therefore returns its firing count when positive
  // and only then consults the flag; reversing those two skips that final drain,
  // which mutates `state.flags`, and the generator is gated on this solver.
  const impossibleOr = (fired: number) =>
    fired > 0 ? fired : state.impossible ? -1 : 0;
  runDeductionFixpoint({
    techniques: [
      {
        id: "drain-op-queue",
        tier: DIFF_EASY,
        run: () => {
          if (ss.ops.length > 0) solverOpsDo(state, ss);
          return state.impossible ? -1 : 0;
        },
      },
      {
        id: "all-black-but-one",
        tier: DIFF_EASY,
        run: () => impossibleOr(solveAllblackbutone(state, ss)),
      },
      {
        id: "remove-splits",
        tier: DIFF_TRICKY,
        run: () => impossibleOr(solveRemovesplits(state, ss)),
      },
    ],
    maxTier: diff,
    budget,
  });

  // The flag is Singles' own state and stays authoritative; the runner's
  // `impossible` says the same thing and would be a second copy of it.
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
  primeCascadeFromMarks(work, ss);
  solveSpecific(work, DIFF_ANY, false, ss);
  return ss.records;
}

/**
 * Seed the op queue with the cascades of the cells the player has already
 * decided. `solverOpsDo` fires a cell's cascade only when it *changes* that
 * cell during this run, and `solveSpecific` is written to run from an empty
 * board (upstream's only use), so resumed from the player's marks it would
 * never propagate from them and the solver would stall partway. Priming makes
 * the solve resumable from any consistent partial position, so a hint can
 * always make progress on a still-solvable board. (Hint-only: the generator
 * solves from empty and never calls this.)
 */
function primeCascadeFromMarks(s: SinglesState, ss: SolverState): void {
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const f = s.flags[y * s.w + x];
      if (f & F_BLACK) cascadeFromBlack(s, ss, x, y);
      else if (f & F_CIRCLE) cascadeFromCircle(s, ss, x, y);
    }
  }
}
