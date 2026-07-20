/**
 * Loopy's graded solver: four deduction rungs run to a fixpoint.
 *
 * **There is no backtracking at any difficulty.** Upstream's `solve_game_rec`
 * is misnamed — it never recurses; it is a loop over an ordered list of
 * deduction functions. `DIFF_TRICKY` is not a solver of its own either: it only
 * unlocks two extra blocks *inside* `dlineDeductions`.
 *
 * The four rungs, in the order they are tried (cheapest first):
 *
 * | # | rung                  | difficulty  |
 * |---|-----------------------|-------------|
 * | 0 | {@link trivialDeductions} | Easy    |
 * | 1 | {@link dlineDeductions}   | Normal  |
 * | 2 | {@link linedsfDeductions} | Hard    |
 * | 3 | {@link loopDeductions}    | Easy    |
 *
 * **Why this does not use the shared `runDeductionFixpoint`.** That runner
 * restarts the ladder from rung 0 on any firing and reports a grade of "highest
 * rung that fired". Loopy grades differently — it runs with a difficulty *cap*
 * and asks whether the board came out solved — and, more importantly, its loop
 * carries a `(thresholdDiff, thresholdIndex)` pair that the shared runner has
 * no notion of. Each rung returns the *lowest* rung that could notice what it
 * just did (or `DIFF_MAX` for "no progress"), and the loop uses that to skip
 * re-running cheap rungs that provably cannot use the new information. That
 * started life as a speed optimisation, but because the generator is
 * solver-gated it is **load-bearing for which puzzles exist**: a solver that
 * explores in a different order accepts a different set of boards. So the loop
 * is ported exactly rather than adapted to the shared shape.
 */
import { Dsf, FlipDsf } from "../../engine/dsf.ts";
import type { Grid, GridEdge } from "../../engine/grid.ts";
import {
  dlineIndexFromDot,
  dlineIndexFromFace,
  isAtLeastOne,
  isAtMostOne,
  setAtLeastOne,
  setAtMostOne,
} from "./dlines.ts";
import { DIFF_HARD, DIFF_MAX, DIFF_NORMAL, DIFF_TRICKY } from "./params.ts";
import {
  cloneState,
  LINE_NO,
  LINE_UNKNOWN,
  LINE_YES,
  type LineState,
  type LoopyState,
  opp,
} from "./state.ts";

export type SolverStatus = "solved" | "mistake" | "ambiguous" | "incomplete";

/**
 * The solver's working state: a mutable copy of the board plus the caches and
 * equivalence structures the rungs share.
 *
 * Two upstream allocations are legitimately **absent at low difficulties** —
 * `dlines` only exists from Normal, `linedsf` only from Hard — so they are
 * typed `| null` and the compiler enforces the difficulty guards that upstream
 * can only maintain by discipline. That is a real safety win the C cannot have.
 */
export class SolverState {
  readonly state: LoopyState;
  status: SolverStatus = "incomplete";
  readonly diff: number;

  /** Dots joined by YES edges. */
  readonly dotDsf: Dsf;
  /** Per canonical dot, how many dots are joined into its chain. A `looplen` of
   * 1 means no lines reach that dot. */
  readonly looplen: Int32Array;

  readonly dotYesCount: Uint8Array;
  readonly dotNoCount: Uint8Array;
  readonly faceYesCount: Uint8Array;
  readonly faceNoCount: Uint8Array;
  readonly dotSolved: Uint8Array;
  readonly faceSolved: Uint8Array;

  /** Two bits per dline; `null` below Normal. */
  readonly dlines: Uint8Array | null;
  /** Lines known identical or opposite; `null` below Hard. */
  readonly linedsf: FlipDsf | null;

  /**
   * Scratch for `dlineDeductions`' per-face `maxs`/`mins` interval matrices,
   * allocated once and reused for every face.
   *
   * Upstream declares these as `int[MAX_FACE_SIZE][MAX_FACE_SIZE]` stack arrays
   * and asserts `N <= MAX_FACE_SIZE`, where `MAX_FACE_SIZE` is 14 — a bound
   * that exists purely so the arrays can live on the stack, and which is
   * *tight*, chosen to accommodate the 14-edged Hat and Spectre faces. In TS
   * the constant evaporates: size the buffer from the grid's actual maximum
   * face order and the limit is whatever the grid really contains.
   */
  readonly maxs: Int32Array;
  readonly mins: Int32Array;
  /** Row stride of {@link maxs}/{@link mins} — the grid's largest face order. */
  readonly faceStride: number;

  constructor(state: LoopyState, diff: number) {
    this.state = cloneState(state);
    this.diff = diff;

    const g = state.grid;
    this.dotDsf = new Dsf(g.numDots);
    this.looplen = new Int32Array(g.numDots).fill(1);

    this.dotYesCount = new Uint8Array(g.numDots);
    this.dotNoCount = new Uint8Array(g.numDots);
    this.faceYesCount = new Uint8Array(g.numFaces);
    this.faceNoCount = new Uint8Array(g.numFaces);
    this.dotSolved = new Uint8Array(g.numDots);
    this.faceSolved = new Uint8Array(g.numFaces);

    this.dlines = diff < DIFF_NORMAL ? null : new Uint8Array(2 * g.numEdges);
    this.linedsf = diff < DIFF_HARD ? null : new FlipDsf(g.numEdges);

    let stride = 0;
    for (const f of g.faces) stride = Math.max(stride, f.order);
    this.faceStride = stride;
    this.maxs = new Int32Array(stride * stride);
    this.mins = new Int32Array(stride * stride);
  }

  get grid(): Grid {
    return this.state.grid;
  }
}

/**
 * Recount the caches from scratch and check they match the incrementally
 * maintained ones — upstream's `check_caches`, which lives behind
 * `#ifdef DEBUG_CACHES`.
 *
 * Exported for tests rather than compiled in: a `solverSetLine` bookkeeping
 * slip otherwise surfaces three rungs later as a wrong deduction, which is a
 * miserable thing to debug. Here it fails at the point of damage.
 */
export function checkCaches(ss: SolverState): void {
  const g = ss.grid;
  const s = ss.state;
  for (let i = 0; i < g.numDots; i++) {
    const d = g.dots[i];
    let yes = 0;
    let no = 0;
    for (let j = 0; j < d.order; j++) {
      const line = s.lines[d.edges[j].index];
      if (line === LINE_YES) yes++;
      else if (line === LINE_NO) no++;
    }
    if (yes !== ss.dotYesCount[i] || no !== ss.dotNoCount[i]) {
      throw new Error(`loopy solver: dot ${i} cache desynchronised`);
    }
  }
  for (let i = 0; i < g.numFaces; i++) {
    const f = g.faces[i];
    let yes = 0;
    let no = 0;
    for (let j = 0; j < f.order; j++) {
      const e = f.edges[j];
      if (e === null) continue;
      const line = s.lines[e.index];
      if (line === LINE_YES) yes++;
      else if (line === LINE_NO) no++;
    }
    if (yes !== ss.faceYesCount[i] || no !== ss.faceNoCount[i]) {
      throw new Error(`loopy solver: face ${i} cache desynchronised`);
    }
  }
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

/** Set edge `i` to `lineNew`, updating the cached counts of both its dots and
 * both its faces. Returns whether the line's state actually changed. */
function solverSetLine(ss: SolverState, i: number, lineNew: LineState): boolean {
  const s = ss.state;
  if (s.lines[i] === lineNew) return false;
  s.lines[i] = lineNew;

  const e = ss.grid.edges[i];
  if (lineNew === LINE_YES) {
    ss.dotYesCount[e.dot1.index]++;
    ss.dotYesCount[e.dot2.index]++;
    if (e.face1) ss.faceYesCount[e.face1.index]++;
    if (e.face2) ss.faceYesCount[e.face2.index]++;
  } else {
    ss.dotNoCount[e.dot1.index]++;
    ss.dotNoCount[e.dot2.index]++;
    if (e.face1) ss.faceNoCount[e.face1.index]++;
    if (e.face2) ss.faceNoCount[e.face2.index]++;
  }
  return true;
}

/** Merge the two dots an edge joins, maintaining chain lengths. Returns true
 * iff they were already connected — i.e. this edge closes a loop. */
function mergeDots(ss: SolverState, edgeIndex: number): boolean {
  const e = ss.grid.edges[edgeIndex];
  let i = ss.dotDsf.canonify(e.dot1.index);
  const j = ss.dotDsf.canonify(e.dot2.index);
  if (i === j) return true;
  const len = ss.looplen[i] + ss.looplen[j];
  ss.dotDsf.merge(i, j);
  i = ss.dotDsf.canonify(i);
  ss.looplen[i] = len;
  return false;
}

/** Record that two lines are identical (`inverse` false) or opposite (true).
 * Returns whether this was new information. */
function mergeLines(ss: SolverState, i: number, j: number, inverse: boolean): boolean {
  const linedsf = ss.linedsf;
  if (linedsf === null) throw new Error("loopy solver: mergeLines below Hard");
  const c1 = linedsf.canonify(i);
  const c2 = linedsf.canonify(j);
  const inv = (inverse !== c1.inverse) !== c2.inverse;
  linedsf.mergeFlip(c1.root, c2.root, inv);
  return c1.root !== c2.root;
}

/** Set every line of `oldType` around a dot to `newType`. */
function dotSetall(
  ss: SolverState,
  dot: number,
  oldType: number,
  newType: LineState,
): boolean {
  if (oldType === newType) return false;
  let retval = false;
  const d = ss.grid.dots[dot];
  for (let i = 0; i < d.order; i++) {
    const lineIndex = d.edges[i].index;
    if (ss.state.lines[lineIndex] === oldType) {
      solverSetLine(ss, lineIndex, newType);
      retval = true;
    }
  }
  return retval;
}

/** Set every line of `oldType` around a face to `newType`. */
function faceSetall(
  ss: SolverState,
  face: number,
  oldType: number,
  newType: LineState,
): boolean {
  if (oldType === newType) return false;
  let retval = false;
  const f = ss.grid.faces[face];
  for (let i = 0; i < f.order; i++) {
    const e = f.edges[i];
    if (e === null) continue;
    if (ss.state.lines[e.index] === oldType) {
      solverSetLine(ss, e.index, newType);
      retval = true;
    }
  }
  return retval;
}

// ---------------------------------------------------------------------------
// Rung 0 — trivial deductions (Easy)
// ---------------------------------------------------------------------------

/**
 * Around `f`, find an adjacent pair of UNKNOWN edges whose shared dot already
 * has a YES edge incident on it from elsewhere. Returns the pair's edge
 * indices, or `null`.
 *
 * This is upstream's `goto found` multi-level break, extracted. The pair
 * matters because two such edges cannot *both* be YES (their shared dot would
 * reach degree 3), which is one line closer to pinning down the rest of a face
 * whose clue is one short of forcing everything.
 */
function findConstrainedUnknownPair(
  ss: SolverState,
  faceIndex: number,
): { e1: number; e2: number } | null {
  const g = ss.grid;
  const s = ss.state;
  const f = g.faces[faceIndex];

  for (let j = 0; j < f.order; j++) {
    const edgeA = f.edges[j];
    const edgeB = f.edges[j + 1 < f.order ? j + 1 : 0];
    if (edgeA === null || edgeB === null) continue;
    const e1 = edgeA.index;
    const e2 = edgeB.index;
    if (s.lines[e1] !== LINE_UNKNOWN || s.lines[e2] !== LINE_UNKNOWN) continue;

    // The two edges are consecutive around the face, so they share a dot.
    const a = g.edges[e1];
    const b = g.edges[e2];
    const shared = a.dot1 === b.dot1 || a.dot1 === b.dot2 ? a.dot1 : a.dot2;
    const d = g.dots[shared.index];
    for (let k = 0; k < d.order; k++) {
      if (s.lines[d.edges[k].index] === LINE_YES) return { e1, e2 };
    }
  }
  return null;
}

/** Rung 0: just the rules of the game — a clue that permits all its remaining
 * unknowns to be filled one way, and the degree constraints at each dot. */
function trivialDeductions(ss: SolverState): number {
  const g = ss.grid;
  const s = ss.state;
  let diff = DIFF_MAX;

  // ------ Per-face deductions ------
  for (let i = 0; i < g.numFaces; i++) {
    const f = g.faces[i];
    if (ss.faceSolved[i]) continue;

    const currentYes = ss.faceYesCount[i];
    const currentNo = ss.faceNoCount[i];

    if (currentYes + currentNo === f.order) {
      ss.faceSolved[i] = 1;
      continue;
    }
    const clue = s.clues[i];
    if (clue < 0) continue;

    // Is the clue so large that every remaining unknown must be YES, or so
    // small that they must all be NO?
    if (clue < currentYes) {
      ss.status = "mistake";
      return 0; // DIFF_EASY
    }
    if (clue === currentYes) {
      if (faceSetall(ss, i, LINE_UNKNOWN, LINE_NO)) diff = Math.min(diff, 0);
      ss.faceSolved[i] = 1;
      continue;
    }
    if (f.order - clue < currentNo) {
      ss.status = "mistake";
      return 0;
    }
    if (f.order - clue === currentNo) {
      if (faceSetall(ss, i, LINE_UNKNOWN, LINE_YES)) diff = Math.min(diff, 0);
      ss.faceSolved[i] = 1;
      continue;
    }

    if (f.order - clue === currentNo + 1 && f.order - currentYes - currentNo > 2) {
      // One short of forcing the face. If some adjacent pair of unknowns can't
      // both be YES, every *other* unknown around the face must be.
      const pair = findConstrainedUnknownPair(ss, i);
      if (pair === null) continue;
      for (let j = 0; j < f.order; j++) {
        const edge = f.edges[j];
        if (edge === null) continue;
        const e = edge.index;
        if (s.lines[e] === LINE_UNKNOWN && e !== pair.e1 && e !== pair.e2) {
          solverSetLine(ss, e, LINE_YES);
          diff = Math.min(diff, 0);
        }
      }
    }
  }

  // ------ Per-dot deductions ------
  for (let i = 0; i < g.numDots; i++) {
    const d = g.dots[i];
    if (ss.dotSolved[i]) continue;

    const yes = ss.dotYesCount[i];
    const no = ss.dotNoCount[i];
    const unknown = d.order - yes - no;

    if (yes === 0) {
      if (unknown === 0) {
        ss.dotSolved[i] = 1;
      } else if (unknown === 1) {
        // A single line into a dot would dead-end, so it must be NO.
        dotSetall(ss, i, LINE_UNKNOWN, LINE_NO);
        diff = Math.min(diff, 0);
        ss.dotSolved[i] = 1;
      }
    } else if (yes === 1) {
      if (unknown === 0) {
        ss.status = "mistake";
        return 0;
      } else if (unknown === 1) {
        // The line has to continue somewhere, and there is only one way out.
        dotSetall(ss, i, LINE_UNKNOWN, LINE_YES);
        diff = Math.min(diff, 0);
      }
    } else if (yes === 2) {
      if (unknown > 0) {
        dotSetall(ss, i, LINE_UNKNOWN, LINE_NO);
        diff = Math.min(diff, 0);
      }
      ss.dotSolved[i] = 1;
    } else {
      ss.status = "mistake";
      return 0;
    }
  }

  return diff;
}

// ---------------------------------------------------------------------------
// Rung 1 — dline deductions (Normal, with extra blocks at Tricky)
// ---------------------------------------------------------------------------

/**
 * Called from the dot half when a dot has four UNKNOWNs and an adjacent pair of
 * them has *exactly* one YES between them. Finds the opposite pair of UNKNOWNs
 * (if they too are adjacent) and marks their dline "at least one". The
 * corresponding "at most one" is already set by earlier deductions.
 */
function dlineSetOppAtLeastOne(
  ss: SolverState,
  dotIndex: number,
  edge: number,
): boolean {
  const dlines = ss.dlines;
  if (dlines === null) return false;
  const d = ss.grid.dots[dotIndex];
  const N = d.order;
  for (let o = 0; o < N; o++) {
    if (o === edge || o === edge + 1 || o === edge - 1) continue;
    if (o === 0 && edge === N - 1) continue;
    if (o === N - 1 && edge === 0) continue;
    const o2 = o + 1 === N ? 0 : o + 1;
    if (ss.state.lines[d.edges[o].index] !== LINE_UNKNOWN) continue;
    if (ss.state.lines[d.edges[o2].index] !== LINE_UNKNOWN) continue;
    return setAtLeastOne(dlines, dlineIndexFromDot(d, o));
  }
  return false;
}

/**
 * Rung 1: reason about **dlines** — adjacent pairs of edges at a dot, each
 * carrying "at least one is YES" and "at most one is YES" bits.
 *
 * The face half is the interesting part. For each clued face it builds two NxN
 * interval matrices, `maxs(j,k)` and `mins(j,k)`: the upper and lower bounds on
 * how many edges between positions `j` and `k` (clockwise around the face) can
 * be YES. The base cases are the single edges (`j`,`j+1`, from the line state)
 * and the dlines (`j`,`j+2`, from the at-most/at-least bits); the rest follow
 * from `mins(j,k) >= mins(j,u) + mins(u,k)` for any `u` between, and it is
 * sufficient in practice to try just `u = j+1` and `u = j+2`. The bounds so
 * computed are rigorous even if not always tightest.
 *
 * Then, comparing the *complementary* interval's bounds against the face's
 * clue, single edges and whole dlines can be forced. Upstream's worked example:
 * a pentagon clued 3, where at most one of (edge0, edge1) is YES and at most
 * one of (edge2, edge3) is YES, forces edge4 YES — because the other four can
 * supply at most 2 of the required 3.
 *
 * Both `DIFF_TRICKY`-gated blocks live in this function and nowhere else: they
 * are what lets deductions propagate along diagonal chains of faces joined at a
 * dot (the classic `3-2-…-2-3` chain in square grids).
 */
function dlineDeductions(ss: SolverState): number {
  const g = ss.grid;
  const s = ss.state;
  const dlines = ss.dlines;
  if (dlines === null) return DIFF_MAX;
  const { maxs, mins, faceStride: S } = ss;
  let diff = DIFF_MAX;

  // ------ Face deductions ------
  for (let i = 0; i < g.numFaces; i++) {
    const f = g.faces[i];
    const N = f.order;
    const clue = s.clues[i];
    if (ss.faceSolved[i]) continue;
    if (clue < 0) continue;

    // (j, j+1) and (j, j+2) entries.
    for (let j = 0; j < N; j++) {
      // biome-ignore lint/style/noNonNullAssertion: a consistent grid has every face edge.
      const line1 = s.lines[f.edges[j]!.index];
      let k = j + 1;
      if (k >= N) k = 0;
      maxs[j * S + k] = line1 === LINE_NO ? 0 : 1;
      mins[j * S + k] = line1 === LINE_YES ? 1 : 0;

      const dlineIndex = dlineIndexFromFace(f, k);
      // biome-ignore lint/style/noNonNullAssertion: ditto.
      const line2 = s.lines[f.edges[k]!.index];
      k++;
      if (k >= N) k = 0;

      let tmp = 2;
      if (line1 === LINE_NO) tmp--;
      if (line2 === LINE_NO) tmp--;
      if (tmp === 2 && isAtMostOne(dlines, dlineIndex)) tmp = 1;
      maxs[j * S + k] = tmp;

      tmp = 0;
      if (line1 === LINE_YES) tmp++;
      if (line2 === LINE_YES) tmp++;
      if (tmp === 0 && isAtLeastOne(dlines, dlineIndex)) tmp = 1;
      mins[j * S + k] = tmp;
    }

    // (j, j+m) for m from 3 to N-1, recursively.
    for (let m = 3; m < N; m++) {
      for (let j = 0; j < N; j++) {
        let k = j + m;
        let u = j + 1;
        let v = j + 2;
        if (k >= N) k -= N;
        if (u >= N) u -= N;
        if (v >= N) v -= N;
        maxs[j * S + k] = maxs[j * S + u] + maxs[u * S + k];
        mins[j * S + k] = mins[j * S + u] + mins[u * S + k];
        maxs[j * S + k] = Math.min(maxs[j * S + k], maxs[j * S + v] + maxs[v * S + k]);
        mins[j * S + k] = Math.max(mins[j * S + k], mins[j * S + v] + mins[v * S + k]);
      }
    }

    // Now see what the bounds force.
    for (let j = 0; j < N; j++) {
      // biome-ignore lint/style/noNonNullAssertion: a consistent grid has every face edge.
      const lineIndex = f.edges[j]!.index;
      if (s.lines[lineIndex] !== LINE_UNKNOWN) continue;
      let k = j + 1;
      if (k >= N) k = 0;

      // Bounds on the YES count in the complement of this edge.
      if (mins[k * S + j] > clue) {
        ss.status = "mistake";
        return 0;
      }
      if (mins[k * S + j] === clue) {
        // Setting this edge YES would take the face past its clue.
        solverSetLine(ss, lineIndex, LINE_NO);
        diff = Math.min(diff, 0);
      }
      if (maxs[k * S + j] < clue - 1) {
        ss.status = "mistake";
        return 0;
      }
      if (maxs[k * S + j] === clue - 1) {
        // The clue is only reachable if this edge is YES.
        solverSetLine(ss, lineIndex, LINE_YES);
        diff = Math.min(diff, 0);
      }

      if (ss.diff >= DIFF_TRICKY) {
        // Same reasoning one level up: what can we say about the *dline*
        // {j, j+1}? Only worth it when both are UNKNOWN — a dline with one
        // known edge is handled by the dot deductions below.
        // biome-ignore lint/style/noNonNullAssertion: ditto.
        if (s.lines[f.edges[k]!.index] !== LINE_UNKNOWN) continue;

        const dlineIndex = dlineIndexFromFace(f, k);
        k++;
        if (k >= N) k = 0;

        if (mins[k * S + j] > clue - 2) {
          // Two more YESs would break the clue.
          if (setAtMostOne(dlines, dlineIndex)) diff = Math.min(diff, DIFF_NORMAL);
        }
        if (maxs[k * S + j] < clue) {
          // Two more NOs would leave too few YESs.
          if (setAtLeastOne(dlines, dlineIndex)) diff = Math.min(diff, DIFF_NORMAL);
        }
      }
    }
  }

  if (diff < DIFF_NORMAL) return diff;

  // ------ Dot deductions ------
  for (let i = 0; i < g.numDots; i++) {
    const d = g.dots[i];
    const N = d.order;
    if (ss.dotSolved[i]) continue;
    const yes = ss.dotYesCount[i];
    const no = ss.dotNoCount[i];
    const unknown = N - yes - no;

    for (let j = 0; j < N; j++) {
      let k = j + 1;
      if (k >= N) k = 0;
      const dlineIndex = dlineIndexFromDot(d, j);
      const line1Index = d.edges[j].index;
      const line2Index = d.edges[k].index;
      const line1 = s.lines[line1Index];
      const line2 = s.lines[line2Index];

      // Infer dline state from line state.
      if (line1 === LINE_NO || line2 === LINE_NO) {
        if (setAtMostOne(dlines, dlineIndex)) diff = Math.min(diff, DIFF_NORMAL);
      }
      if (line1 === LINE_YES || line2 === LINE_YES) {
        if (setAtLeastOne(dlines, dlineIndex)) diff = Math.min(diff, DIFF_NORMAL);
      }
      // And line state from dline state.
      if (isAtMostOne(dlines, dlineIndex)) {
        if (line1 === LINE_YES && line2 === LINE_UNKNOWN) {
          solverSetLine(ss, line2Index, LINE_NO);
          diff = Math.min(diff, 0);
        }
        if (line2 === LINE_YES && line1 === LINE_UNKNOWN) {
          solverSetLine(ss, line1Index, LINE_NO);
          diff = Math.min(diff, 0);
        }
      }
      if (isAtLeastOne(dlines, dlineIndex)) {
        if (line1 === LINE_NO && line2 === LINE_UNKNOWN) {
          solverSetLine(ss, line2Index, LINE_YES);
          diff = Math.min(diff, 0);
        }
        if (line2 === LINE_NO && line1 === LINE_UNKNOWN) {
          solverSetLine(ss, line1Index, LINE_YES);
          diff = Math.min(diff, 0);
        }
      }

      // The remaining deductions count lines, and are only worth trying when
      // both edges are UNKNOWN — otherwise rung 0 or the block above has
      // already handled it.
      if (line1 !== LINE_UNKNOWN || line2 !== LINE_UNKNOWN) continue;

      if (yes === 0 && unknown === 2) {
        // These two unknowns are the dot's only options, so they stand or fall
        // together; either bit therefore settles both.
        if (isAtMostOne(dlines, dlineIndex)) {
          solverSetLine(ss, line1Index, LINE_NO);
          solverSetLine(ss, line2Index, LINE_NO);
          diff = Math.min(diff, 0);
        }
        if (isAtLeastOne(dlines, dlineIndex)) {
          solverSetLine(ss, line1Index, LINE_YES);
          solverSetLine(ss, line2Index, LINE_YES);
          diff = Math.min(diff, 0);
        }
      }
      if (yes === 1) {
        if (setAtMostOne(dlines, dlineIndex)) diff = Math.min(diff, DIFF_NORMAL);
        if (unknown === 2) {
          if (setAtLeastOne(dlines, dlineIndex)) diff = Math.min(diff, DIFF_NORMAL);
        }
      }

      if (ss.diff >= DIFF_TRICKY) {
        // "At least one of this pair" means every *opposite* dline at this dot
        // (one sharing no edge with it) has at most one, since a dot takes two
        // lines in total. Again only worth testing with both edges UNKNOWN: if
        // either were YES the `yes === 1` branch above would have fired.
        if (isAtLeastOne(dlines, dlineIndex)) {
          for (let o = 0; o < N; o++) {
            if (o === j || o === j + 1 || o === j - 1) continue;
            if (j === 0 && o === N - 1) continue;
            if (j === N - 1 && o === 0) continue;
            if (setAtMostOne(dlines, dlineIndexFromDot(d, o))) {
              diff = Math.min(diff, DIFF_NORMAL);
            }
          }
          if (yes === 0 && isAtMostOne(dlines, dlineIndex)) {
            // Exactly one YES in this pair, and no YESs elsewhere at the dot.
            if (unknown === 3) {
              // The dot's second line must be the remaining unknown.
              for (let o = 0; o < N; o++) {
                if (o === j || o === k) continue;
                const oppIndex = d.edges[o].index;
                if (s.lines[oppIndex] === LINE_UNKNOWN) {
                  solverSetLine(ss, oppIndex, LINE_YES);
                  diff = Math.min(diff, 0);
                }
              }
            } else if (unknown === 4) {
              // Exactly one of the opposite pair is YES too; "at most one" is
              // already set, so add "at least one".
              if (dlineSetOppAtLeastOne(ss, i, j)) diff = Math.min(diff, DIFF_NORMAL);
            }
          }
        }
      }
    }
  }
  return diff;
}

// ---------------------------------------------------------------------------
// Rung 2 — linedsf deductions (Hard)
// ---------------------------------------------------------------------------

/**
 * Set every pair of provably-identical UNKNOWN lines around a face to
 * `lineNew`.
 *
 * **This function always returns `false`, even when it changed the board — and
 * that is deliberate.** Upstream initialises `retval = false` and never
 * reassigns it, so the caller is told "no progress" whenever this fires. Do not
 * "fix" it: a linter's *value is never reassigned* hint points at exactly the
 * wrong cleanup here.
 *
 * The deduction it makes is *sound* (two lines known identical, with room for
 * only one more YES between them, must both be NO), so it never writes a wrong
 * line. What the lost return value costs is *strength*: the missing progress
 * report is only sometimes masked by the edge-dsf propagation loop that follows
 * it. When the flip-dsf canonical happens to be one of the two edges just set,
 * `linedsfDeductions` returns `DIFF_MAX` **despite having mutated the board**,
 * so `solveGameRec` does not reset to rung 0 and never re-runs
 * `trivialDeductions` over the lines just written — and can exit
 * `incomplete` early.
 *
 * The solver is therefore strictly weaker than its author intended, and **that
 * weakness is baked into which puzzles upstream generates**: `gameHasUniqueSoln`
 * gates every clue removal, the board-retry loop and the too-easy rejection.
 * Repairing it would produce different, generally sparser puzzles from the same
 * seed, and would break every seed-level differential. It is the difficulty
 * curve upstream ships, not a player-visible defect — so it is preserved, and
 * `solver.test.ts` asserts it returns `false` *even when it mutates*.
 */
function faceSetallIdentical(
  ss: SolverState,
  faceIndex: number,
  lineNew: LineState,
): boolean {
  const linedsf = ss.linedsf;
  if (linedsf === null) return false;
  const s = ss.state;
  const f = ss.grid.faces[faceIndex];
  const N = f.order;

  for (let i = 0; i < N; i++) {
    const edgeI = f.edges[i];
    if (edgeI === null) continue;
    const line1Index = edgeI.index;
    if (s.lines[line1Index] !== LINE_UNKNOWN) continue;
    for (let j = i + 1; j < N; j++) {
      const edgeJ = f.edges[j];
      if (edgeJ === null) continue;
      const line2Index = edgeJ.index;
      if (s.lines[line2Index] !== LINE_UNKNOWN) continue;

      const can1 = linedsf.canonify(line1Index);
      const can2 = linedsf.canonify(line2Index);
      if (can1.root === can2.root && can1.inverse === can2.inverse) {
        solverSetLine(ss, line1Index, lineNew);
        solverSetLine(ss, line2Index, lineNew);
      }
    }
  }
  // See the doc comment: upstream's lost return value, preserved on purpose.
  return false;
}

/** Collect the indices of the first `expectedCount` UNKNOWN edges in a list.
 * The count comes from the solver's caches, so a shortfall means those caches
 * are wrong — a bug, not a state to tolerate. */
function findUnknowns(
  s: LoopyState,
  edgeList: readonly (GridEdge | null)[],
  expectedCount: number,
): number[] {
  const e: number[] = [];
  for (const edge of edgeList) {
    if (edge === null) continue;
    if (s.lines[edge.index] === LINE_UNKNOWN) {
      e.push(edge.index);
      if (e.length === expectedCount) return e;
    }
  }
  throw new Error("loopy solver: fewer UNKNOWNs than the caches claim");
}

/**
 * Given a list of edges whose YES count has known parity and only a few
 * UNKNOWNs left, relate or force them. Returns the lowest rung that could
 * notice the result, or `DIFF_MAX` for no progress.
 *
 * **`totalParity` is a `number`, not a boolean, and the truthiness test is
 * deliberate.** The face caller passes `(clue - yes) % 2`, which is *negative*
 * when `clue < yes`; C's truncating `%` yields `-1`, which is truthy, so the
 * XOR always produces `LINE_YES` on that path. TypeScript's `%` truncates
 * identically, so the literal port and the idiomatic port are the same code —
 * the only trap is applying the hygiene fix `((x % 2) + 2) % 2`, which would
 * change the behaviour. Hence: keep the `number`, keep the truthiness test, and
 * do not normalise.
 *
 * That path is in fact **unreachable on any board this game constructs**.
 * `clue < yes` means a face already has more YES edges than its clue allows —
 * an already-contradictory board. `trivialDeductions` detects exactly that
 * condition and returns `mistake`; it is rung 0 at Easy so it always runs
 * first, and any progress by any rung restarts the ladder and forces it to
 * re-verify. Every deduction here is sound, so on a board admitting at least
 * one solution no face can ever exceed its clue. The generator cannot produce
 * such a board (clues are derived from a real loop, and clue removal only ever
 * erases) and gameplay cannot either (`solve` builds its solver state from the
 * *pristine* puzzle, not the player's board). The only door is a hand-typed
 * malformed game ID, where these deductions are transient garbage on a board
 * already heading for `mistake`. A real latent bug, then — but dead code, and
 * preserving it costs nothing.
 */
function parityDeductions(
  ss: SolverState,
  edgeList: readonly (GridEdge | null)[],
  totalParity: number,
  unknownCount: number,
): number {
  const s = ss.state;
  const linedsf = ss.linedsf;
  if (linedsf === null) return DIFF_MAX;
  let diff = DIFF_MAX;
  // NOTE: `totalParity` is used **raw** below, never normalised to 0/1. See the
  // doc comment: a negative value is truthy and XORs exactly as C's does, and
  // normalising it would silently change the deduction on that path (e.g.
  // `-1 ^ 1` is -2 and truthy, where `1 ^ 1` is 0 and falsy).

  if (unknownCount === 2) {
    // The two are alike or opposite, depending on the parity.
    const e = findUnknowns(s, edgeList, 2);
    if (mergeLines(ss, e[0], e[1], totalParity !== 0)) diff = Math.min(diff, DIFF_HARD);
  } else if (unknownCount === 3) {
    const e = findUnknowns(s, edgeList, 3);
    const can = e.map((x) => linedsf.canonify(x));
    const inv = can.map((c) => (c.inverse ? 1 : 0));
    if (can[0].root === can[1].root) {
      const v = totalParity ^ inv[0] ^ inv[1] ? LINE_YES : LINE_NO;
      if (solverSetLine(ss, e[2], v)) diff = Math.min(diff, 0);
    }
    if (can[0].root === can[2].root) {
      const v = totalParity ^ inv[0] ^ inv[2] ? LINE_YES : LINE_NO;
      if (solverSetLine(ss, e[1], v)) diff = Math.min(diff, 0);
    }
    if (can[1].root === can[2].root) {
      const v = totalParity ^ inv[1] ^ inv[2] ? LINE_YES : LINE_NO;
      if (solverSetLine(ss, e[0], v)) diff = Math.min(diff, 0);
    }
  } else if (unknownCount === 4) {
    const e = findUnknowns(s, edgeList, 4);
    const can = e.map((x) => linedsf.canonify(x));
    const inv = can.map((c) => (c.inverse ? 1 : 0));
    const link = (a: number, b: number, x: number, y: number): void => {
      if (mergeLines(ss, e[a], e[b], (totalParity ^ inv[x] ^ inv[y]) !== 0)) {
        diff = Math.min(diff, DIFF_HARD);
      }
    };
    // Upstream's chain of `else if`s: only the first matching pair is used.
    if (can[0].root === can[1].root) link(2, 3, 0, 1);
    else if (can[0].root === can[2].root) link(1, 3, 0, 2);
    else if (can[0].root === can[3].root) link(1, 2, 0, 3);
    else if (can[1].root === can[2].root) link(0, 3, 1, 2);
    else if (can[1].root === can[3].root) link(0, 2, 1, 3);
    else if (can[2].root === can[3].root) link(0, 1, 2, 3);
  }
  return diff;
}

/**
 * Rung 2: reason with the **line dsf** — equivalence classes of edges known to
 * be identical to, or the opposite of, one another.
 *
 * A fully general deduction over these classes looks NP-complete, so upstream
 * restricts itself to *pairs* of UNKNOWN edges known identical: if setting both
 * YES (or both NO) would break a clue, set them both the other way. The rest of
 * the rung relates dlines to the dsf in both directions, applies the parity
 * deductions to faces and dots, and finally propagates known line states along
 * each equivalence class.
 */
function linedsfDeductions(ss: SolverState): number {
  const g = ss.grid;
  const s = ss.state;
  const dlines = ss.dlines;
  const linedsf = ss.linedsf;
  if (dlines === null || linedsf === null) return DIFF_MAX;
  let diff = DIFF_MAX;

  // ------ Face deductions ------
  for (let i = 0; i < g.numFaces; i++) {
    if (ss.faceSolved[i]) continue;
    const clue = s.clues[i];
    if (clue < 0) continue;

    const N = g.faces[i].order;
    let yes = ss.faceYesCount[i];
    if (yes + 1 === clue) {
      if (faceSetallIdentical(ss, i, LINE_NO)) diff = Math.min(diff, 0);
    }
    const no = ss.faceNoCount[i];
    if (no + 1 === N - clue) {
      if (faceSetallIdentical(ss, i, LINE_YES)) diff = Math.min(diff, 0);
    }

    // Reload the YES count — the calls above may have changed it.
    yes = ss.faceYesCount[i];
    const unknown = N - no - yes;

    diff = Math.min(
      diff,
      parityDeductions(ss, g.faces[i].edges, (clue - yes) % 2, unknown),
    );
  }

  // ------ Dot deductions ------
  for (let i = 0; i < g.numDots; i++) {
    const d = g.dots[i];
    const N = d.order;

    for (let j = 0; j < N; j++) {
      const dlineIndex = dlineIndexFromDot(d, j);
      const line1Index = d.edges[j].index;
      if (s.lines[line1Index] !== LINE_UNKNOWN) continue;
      const j2 = j + 1 === N ? 0 : j + 1;
      const line2Index = d.edges[j2].index;
      if (s.lines[line2Index] !== LINE_UNKNOWN) continue;

      // Infer dline flags from the dsf.
      const can1 = linedsf.canonify(line1Index);
      const can2 = linedsf.canonify(line2Index);
      if (can1.root === can2.root && can1.inverse !== can2.inverse) {
        // Opposites: exactly one of the pair is YES.
        if (setAtMostOne(dlines, dlineIndex)) diff = Math.min(diff, DIFF_NORMAL);
        if (setAtLeastOne(dlines, dlineIndex)) diff = Math.min(diff, DIFF_NORMAL);
        continue;
      }
      // And the dsf from the dline flags.
      if (isAtMostOne(dlines, dlineIndex) && isAtLeastOne(dlines, dlineIndex)) {
        if (mergeLines(ss, line1Index, line2Index, true)) {
          diff = Math.min(diff, DIFF_HARD);
        }
      }
    }

    const yes = ss.dotYesCount[i];
    const no = ss.dotNoCount[i];
    diff = Math.min(diff, parityDeductions(ss, d.edges, yes % 2, N - yes - no));
  }

  // ------ Edge dsf propagation ------
  // If either a line or its canonical is known, the other follows.
  for (let i = 0; i < g.numEdges; i++) {
    const c = linedsf.canonify(i);
    if (c.root === i) continue;
    let state = s.lines[c.root];
    if (state !== LINE_UNKNOWN) {
      if (solverSetLine(ss, i, c.inverse ? opp(state) : (state as LineState))) {
        diff = Math.min(diff, 0);
      }
    } else {
      state = s.lines[i];
      if (state !== LINE_UNKNOWN) {
        if (solverSetLine(ss, c.root, c.inverse ? opp(state) : (state as LineState))) {
          diff = Math.min(diff, 0);
        }
      }
    }
  }

  return diff;
}

// ---------------------------------------------------------------------------
// Rung 3 — loop deductions (Easy)
// ---------------------------------------------------------------------------

/**
 * Rung 3: the global loop-closure reasoning — whether the YES edges already
 * constitute the answer, and which UNKNOWN edges would close a premature loop.
 *
 * The second half is also where {@link SolverStatus} `"ambiguous"` comes from.
 * If adding an edge *would* produce a valid solution, we have found **a**
 * solution but not proved it is **the** solution — had it been provable we
 * would have deduced that edge earlier without loop detection. Pressing Solve
 * on a user-supplied puzzle should still fill that in, but the generator must
 * not count it as a fair deduction for a player to make, which is why
 * `gameHasUniqueSoln` requires exactly `"solved"`.
 */
function loopDeductions(ss: SolverState): number {
  const g = ss.grid;
  const s = ss.state;
  let edgecount = 0;
  let clues = 0;
  let satclues = 0;
  let sm1clues = 0;
  let shortestChainlen = g.numDots;
  let progress = false;

  // merge_dots is idempotent, so the simplest correct thing is to re-merge
  // every YES edge. Count them while we are here.
  for (let i = 0; i < g.numEdges; i++) {
    if (s.lines[i] === LINE_YES) {
      mergeDots(ss, i);
      edgecount++;
    }
  }

  for (let i = 0; i < g.numFaces; i++) {
    const c = s.clues[i];
    if (c >= 0) {
      const o = ss.faceYesCount[i];
      if (o === c) satclues++;
      else if (o === c - 1) sm1clues++;
      clues++;
    }
  }

  for (let i = 0; i < g.numDots; i++) {
    const dotsConnected = ss.looplen[ss.dotDsf.canonify(i)];
    if (dotsConnected > 1) shortestChainlen = Math.min(shortestChainlen, dotsConnected);
  }

  if (satclues === clues && shortestChainlen === edgecount) {
    ss.status = "solved";
    // Discovering this is progress even though no line changed.
    return 0;
  }

  // Look for UNKNOWN edges joining two dots already in the same class: adding
  // one would close a loop. Is that loop the solution?
  for (let i = 0; i < g.numEdges; i++) {
    const e = g.edges[i];
    if (s.lines[i] !== LINE_UNKNOWN) continue;

    const eqclass = ss.dotDsf.canonify(e.dot1.index);
    if (eqclass !== ss.dotDsf.canonify(e.dot2.index)) continue;

    let val: LineState = LINE_NO; // the loop is bad until proven otherwise

    if (ss.looplen[eqclass] === edgecount + 1) {
      // The loop would take in every YES edge in the grid, so it is a candidate
      // solution: every clue must be satisfied or one short, and the
      // one-short clues must be at most two, both adjacent to this edge.
      let sm1Nearby = 0;
      if (e.face1) {
        const f = e.face1.index;
        const c = s.clues[f];
        if (c >= 0 && ss.faceYesCount[f] === c - 1) sm1Nearby++;
      }
      if (e.face2) {
        const f = e.face2.index;
        const c = s.clues[f];
        if (c >= 0 && ss.faceYesCount[f] === c - 1) sm1Nearby++;
      }
      if (sm1clues === sm1Nearby && sm1clues + satclues === clues) {
        val = LINE_YES; // the loop is good
      }
    }

    progress = solverSetLine(ss, i, val);
    if (val === LINE_YES) {
      ss.status = "ambiguous";
      return 0;
    }
  }

  return progress ? 0 : DIFF_MAX;
}

// ---------------------------------------------------------------------------
// The fixpoint
// ---------------------------------------------------------------------------

/** The rungs, in the order they are tried, with the difficulty each belongs to.
 * The ordering is part of the solver's behaviour, not a presentation choice. */
const RUNGS: readonly { fn: (ss: SolverState) => number; diff: number }[] = [
  { fn: trivialDeductions, diff: 0 },
  { fn: dlineDeductions, diff: DIFF_NORMAL },
  { fn: linedsfDeductions, diff: DIFF_HARD },
  { fn: loopDeductions, diff: 0 },
];

/**
 * Run the rungs to a fixpoint over a copy of `state`, capped at `diff`.
 *
 * Merges upstream's `new_solver_state` + `dup_solver_state` + `solve_game_rec`
 * into one entry point. The dup is upstream's defensive copy at the top of
 * `solve_game_rec`, preserving "solving does not mutate the caller's state" —
 * but every caller hands it a freshly built solver state, and the constructor
 * already clones the game state, so building the working state here is exactly
 * equivalent and there is nothing left to free.
 *
 * The `(thresholdDiff, thresholdIndex)` pair is the speed optimisation
 * described in the module doc: a rung earlier in the list than `thresholdIndex`
 * is skipped when its difficulty is below `thresholdDiff`, because the
 * information the last firing produced is provably useless to it. Load-bearing
 * for which puzzles generate — do not simplify it away.
 */
export function solveGame(state: LoopyState, diff: number): SolverState {
  const ss = new SolverState(state, diff);

  let i = 0;
  let thresholdDiff = 0;
  let thresholdIndex = 0;

  while (i < RUNGS.length) {
    if (ss.status === "mistake") return ss;
    if (ss.status === "solved" || ss.status === "ambiguous") break;

    const rung = RUNGS[i];
    if ((rung.diff >= thresholdDiff || i >= thresholdIndex) && rung.diff <= ss.diff) {
      const nextDiff = rung.fn(ss);
      if (nextDiff !== DIFF_MAX) {
        // Progress: adopt the new thresholds and restart from the top.
        thresholdDiff = nextDiff;
        thresholdIndex = i;
        i = 0;
        continue;
      }
    }
    i++;
  }

  if (ss.status === "solved" || ss.status === "ambiguous") {
    // Everything still UNKNOWN is definitely not part of the loop.
    for (let e = 0; e < ss.state.lines.length; e++) {
      if (ss.state.lines[e] === LINE_UNKNOWN) ss.state.lines[e] = LINE_NO;
    }
  }
  return ss;
}

/**
 * Is this board uniquely solvable by a player working at `diff`? The generator
 * gates every clue removal on this.
 *
 * Note it demands exactly `"solved"`: an `"ambiguous"` verdict means the solver
 * found *a* solution only by trying a loop closure, which is not a deduction a
 * player could be expected to make (see {@link loopDeductions}).
 */
export function gameHasUniqueSoln(state: LoopyState, diff: number): boolean {
  const ss = solveGame(state, diff);
  if (ss.status === "mistake") {
    // The generator only ever asks about boards derived from a real loop, so a
    // contradiction here means the port is wrong, not the board.
    throw new Error("loopy: solver found a contradiction in a generated board");
  }
  return ss.status === "solved";
}

/** Exposed for `solver.test.ts` only — see {@link faceSetallIdentical}'s doc for
 * why its return value is asserted rather than trusted. */
export const _internals = { faceSetallIdentical, solverSetLine, parityDeductions };
