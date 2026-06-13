/**
 * Palisade solver + generator.
 *
 * The solver is a faithful port of upstream's six DSF deductions, run
 * to a fixpoint; `solver()` returns whether the clue set is fully
 * solved. Discriminated `"progress"`-style booleans replace C's
 * changed-flag accumulation, but the deductions themselves mirror the C
 * one-to-one (each annotated with its upstream name). The generator
 * divides the rectangle (`divvyRectangle`), derives clues, and strips
 * them while the solver still uniquely solves the board.
 */

import { Dsf } from "../../engine/dsf.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { divvyRectangle } from "./divvy.ts";
import {
  BORDER,
  bitcount,
  DX,
  DY,
  EMPTY,
  encodeDesc,
  FLIP,
  initBorders,
  isSolved,
  outOfBounds,
  type PalisadeParams,
} from "./state.ts";

class SolverCtx {
  readonly w: number;
  readonly h: number;
  readonly k: number;
  readonly clues: Int8Array;
  readonly borders: Uint8Array;
  readonly dsf: Dsf;

  constructor(p: PalisadeParams, clues: Int8Array, borders: Uint8Array) {
    this.w = p.w;
    this.h = p.h;
    this.k = p.k;
    this.clues = clues;
    this.borders = borders;
    this.dsf = new Dsf(p.w * p.h);
  }

  /** Neighbour cell in direction `dir`, or -1 if off the grid. */
  nbr(i: number, dir: number): number {
    const x = (i % this.w) + DX[dir];
    const y = Math.floor(i / this.w) + DY[dir];
    if (outOfBounds(x, y, this.w, this.h)) return -1;
    return y * this.w + x;
  }

  connect(i: number, j: number): void {
    this.dsf.merge(i, j);
  }

  /** Is there a wall on edge `dir` of `i`? Bounds-safe (the rim is
   * always walled), so it never indexes off-grid. */
  disconnectedDir(i: number, dir: number): boolean {
    return (this.borders[i] & BORDER(dir)) !== 0;
  }

  /** Are `i` and its `dir`-neighbour known to be in one region? */
  connectedDir(i: number, dir: number): boolean {
    const j = this.nbr(i, dir);
    return j >= 0 && this.dsf.equivalent(i, j);
  }

  /** Neither walled nor known-connected: the edge is still undecided.
   * Order matters — `disconnectedDir` is bounds-safe, `connectedDir`
   * relies on the edge being interior. */
  maybe(i: number, dir: number): boolean {
    return !this.disconnectedDir(i, dir) && !this.connectedDir(i, dir);
  }

  /** Set a wall on edge `dir` of `i`, recording both shared sides. */
  disconnect(i: number, dir: number): void {
    const j = this.nbr(i, dir);
    this.borders[i] |= BORDER(dir);
    if (j >= 0) this.borders[j] |= BORDER(FLIP(dir));
  }
}

// --- the six deductions ---------------------------------------------------

/** `solver_connected_clues_versus_region_size` — idempotent, run once. */
function connectedCluesVersusRegionSize(ctx: SolverCtx): void {
  const { w, h, k, clues } = ctx;
  const wh = w * h;
  for (let i = 0; i < wh; i++) {
    if (clues[i] === EMPTY) continue;
    for (let dir = 0; dir < 4; dir++) {
      if (ctx.disconnectedDir(i, dir)) continue;
      const j = ctx.nbr(i, dir);
      if (j < 0 || clues[j] === EMPTY) continue;
      if (
        8 - clues[i] - clues[j] > k ||
        (clues[i] === 3 && clues[j] === 3 && k !== 2)
      ) {
        ctx.disconnect(i, dir);
      }
    }
  }
}

/** `solver_number_exhausted`. */
function numberExhausted(ctx: SolverCtx): boolean {
  const { w, h, clues, borders } = ctx;
  const wh = w * h;
  let changed = false;
  for (let i = 0; i < wh; i++) {
    if (clues[i] === EMPTY) continue;

    if (bitcount(borders[i]) === clues[i]) {
      // All this clue's walls are placed: the rest are non-walls.
      for (let dir = 0; dir < 4; dir++) {
        if (!ctx.maybe(i, dir)) continue;
        ctx.connect(i, ctx.nbr(i, dir));
        changed = true;
      }
      continue;
    }

    let off = 0;
    for (let dir = 0; dir < 4; dir++) {
      if (!ctx.disconnectedDir(i, dir) && ctx.connectedDir(i, dir)) off++;
    }
    if (clues[i] === 4 - off) {
      // Every remaining edge must be a wall to reach the clue.
      for (let dir = 0; dir < 4; dir++) {
        if (!ctx.maybe(i, dir)) continue;
        ctx.disconnect(i, dir);
        changed = true;
      }
    }
  }
  return changed;
}

/** `solver_not_too_big`. */
function notTooBig(ctx: SolverCtx): boolean {
  const { w, h, k } = ctx;
  const wh = w * h;
  let changed = false;
  for (let i = 0; i < wh; i++) {
    const size = ctx.dsf.size(i);
    for (let dir = 0; dir < 4; dir++) {
      if (!ctx.maybe(i, dir)) continue;
      const j = ctx.nbr(i, dir);
      if (size + ctx.dsf.size(j) <= k) continue;
      ctx.disconnect(i, dir);
      changed = true;
    }
  }
  return changed;
}

/** `solver_not_too_small` — a region with a single way to grow grows. */
function notTooSmall(ctx: SolverCtx): boolean {
  const { w, h, k } = ctx;
  const wh = w * h;
  const outs = new Int32Array(wh).fill(-1); // -1 none, -2 several
  let changed = false;

  for (let i = 0; i < wh; i++) {
    const ci = ctx.dsf.canonify(i);
    if (ctx.dsf.size(ci) === k) continue;
    for (let dir = 0; dir < 4; dir++) {
      if (!ctx.maybe(i, dir)) continue;
      const cj = ctx.dsf.canonify(ctx.nbr(i, dir));
      if (outs[ci] === -1) outs[ci] = cj;
      else if (outs[ci] !== cj) outs[ci] = -2;
    }
  }

  for (let i = 0; i < wh; i++) {
    const j = outs[i];
    if (i !== ctx.dsf.canonify(i)) continue;
    if (j < 0) continue;
    ctx.connect(i, j);
    changed = true;
  }
  return changed;
}

/** `solver_no_dangling_edges` — vertex parity of incident walls. */
function noDanglingEdges(ctx: SolverCtx): boolean {
  const { w, h, borders } = ctx;
  let changed = false;
  for (let r = 1; r < h; r++) {
    for (let c = 1; c < w; c++) {
      const i = r * w + c;
      const j = i - w - 1;
      let noline = 0;
      // Aligned with BORDER_[U0 R1 D2 L3].
      const squares = [i, j, j, i];
      let e = -1;
      let f = -1;
      let de = -1;
      let df = -1;

      for (let dir = 0; dir < 4; dir++) {
        if (!ctx.connectedDir(squares[dir], dir)) {
          df = dir;
          f = squares[df];
          if (e !== -1) continue;
          e = f;
          de = df;
        } else noline++;
      }

      if (4 - noline === 1) {
        ctx.disconnect(e, de);
        changed = true;
        continue;
      }
      if (4 - noline !== 2) continue;

      if (borders[e] & BORDER(de)) {
        if (!(borders[f] & BORDER(df))) {
          ctx.disconnect(f, df);
          changed = true;
        }
      } else if (borders[f] & BORDER(df)) {
        ctx.disconnect(e, de);
        changed = true;
      }
    }
  }
  return changed;
}

/** `solver_equivalent_edges` — two edges to one region share a fate. */
function equivalentEdges(ctx: SolverCtx): boolean {
  const { w, h, clues } = ctx;
  const wh = w * h;
  let changed = false;

  for (let i = 0; i < wh; i++) {
    if (clues[i] < 1 || clues[i] > 3) continue;
    let nOn = 0;
    let nOff = 0;
    if (clues[i] === 2) {
      for (let dir = 0; dir < 4; dir++) {
        if (ctx.disconnectedDir(i, dir)) nOn++;
        else if (ctx.connectedDir(i, dir)) nOff++;
      }
    }
    for (let dirj = 0; dirj < 4; dirj++) {
      if (!ctx.maybe(i, dirj)) continue;
      const j = ctx.nbr(i, dirj);
      for (let dirk = dirj + 1; dirk < 4; dirk++) {
        if (!ctx.maybe(i, dirk)) continue;
        const kk = ctx.nbr(i, dirk);
        if (!ctx.dsf.equivalent(j, kk)) continue;
        if (nOn + 2 > clues[i]) {
          ctx.connect(i, j);
          ctx.connect(i, kk);
          changed = true;
        } else if (nOff + 2 > 4 - clues[i]) {
          ctx.disconnect(i, dirj);
          ctx.disconnect(i, dirk);
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * Run the solver in place on `borders` (which must start as the grid
 * rim). Returns whether the clue set is fully solved.
 */
export function solver(
  p: PalisadeParams,
  clues: Int8Array,
  borders: Uint8Array,
): boolean {
  const ctx = new SolverCtx(p, clues, borders);
  connectedCluesVersusRegionSize(ctx); // idempotent
  let changed = true;
  while (changed) {
    changed = false;
    if (numberExhausted(ctx)) changed = true;
    if (notTooBig(ctx)) changed = true;
    if (notTooSmall(ctx)) changed = true;
    if (noDanglingEdges(ctx)) changed = true;
    if (equivalentEdges(ctx)) changed = true;
  }
  return isSolved(p.w, p.h, p.k, clues, borders);
}

/** Solve a clue set from the bare rim; returns the solution walls, or
 * null if the clue set is not (uniquely) solver-solvable. */
export function solveToBorders(p: PalisadeParams, clues: Int8Array): Uint8Array | null {
  const borders = initBorders(p.w, p.h);
  return solver(p, clues, borders) ? borders : null;
}

// --- generator ------------------------------------------------------------

/** Generate a uniquely solvable clue grid; returns its run-length desc. */
export function newDesc(p: PalisadeParams, rng: RandomState): { desc: string } {
  const { w, h, k } = p;
  const wh = w * h;
  const numbers = new Int8Array(wh);
  const rim = initBorders(w, h);

  // Divide into k-ominoes, derive clues + the solution walls, retry
  // until the full-clue board is solver-solvable (it nearly always is).
  do {
    const dsf = divvyRectangle(w, h, k, rng);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const i = r * w + c;
        numbers[i] = 0;
        for (let dir = 0; dir < 4; dir++) {
          const rr = r + DY[dir];
          const cc = c + DX[dir];
          if (outOfBounds(cc, rr, w, h) || !dsf.equivalent(i, rr * w + cc)) {
            numbers[i]++;
          }
        }
      }
    }
  } while (!solver(p, numbers, rim.slice()));

  // Strip clues in a random order, keeping each removed only while the
  // board stays uniquely solvable.
  const shuf: number[] = Array.from({ length: wh }, (_, i) => i);
  shuffle(shuf, rng);
  for (const idx of shuf) {
    const copy = numbers[idx];
    numbers[idx] = EMPTY;
    if (!solver(p, numbers, rim.slice())) numbers[idx] = copy;
  }

  return { desc: encodeDesc(numbers, wh) };
}
