/**
 * Net's uniqueness solver — an idiomatic TS port of `net_solver` in net.c.
 *
 * It is used two ways: by the generator to *gate* a candidate grid for a unique
 * solution (and, with `perturb`, to steer generation toward one), and by Solve
 * when the game arrived without a stored solution. It is byte-match-critical:
 * the generator's desc depends on the solver's verdict on every candidate grid,
 * so a divergence here diverges the generated board.
 *
 * The deductions, verbatim from upstream:
 *  - **orientation elimination** — for each tile, keep only the (up to four)
 *    rotations of its wire mask consistent with what is known about its edges;
 *  - **edge deduction** — an edge that is wired in *every* surviving orientation
 *    is open, one wired in *none* is closed;
 *  - **loop avoidance** — an orientation that would connect two tiles already in
 *    the same connected component is ruled out (tracked with a `Dsf`);
 *  - **dead-end counting** — an orientation that would seal off a sub-network
 *    smaller than the whole grid is ruled out.
 *
 * A tile is *locked* once its orientation is fully determined. The return code
 * says whether the grid is inconsistent, still ambiguous, or uniquely solved.
 */

import { Dsf } from "../../engine/dsf.ts";
import { anticlockwise, offset, opposite } from "../../engine/wires.ts";

/** Proved to have no solution at all. */
export const SOLVER_INCONSISTENT = -1;
/** Consistent, but not narrowed to a single solution. */
export const SOLVER_AMBIGUOUS = 0;
/** Solved: every tile's orientation is determined. */
export const SOLVER_UNIQUE = 1;

const LOCKED = 0x10;

/**
 * A FIFO worklist with a "already queued" bitmap — upstream's `struct todo`.
 * Deductions are mostly local, so processing a to-do list of touched tiles
 * scales better than re-scanning the whole grid each pass.
 */
class Todo {
  private readonly marked: Uint8Array;
  private readonly buffer: Int32Array;
  private readonly buflen: number;
  private head = 0;
  private tail = 0;

  constructor(maxsize: number) {
    this.marked = new Uint8Array(maxsize);
    this.buflen = maxsize + 1;
    this.buffer = new Int32Array(this.buflen);
  }

  add(index: number): void {
    if (this.marked[index]) return;
    this.marked[index] = 1;
    this.buffer[this.tail++] = index;
    if (this.tail === this.buflen) this.tail = 0;
  }

  get(): number {
    if (this.head === this.tail) return -1;
    const ret = this.buffer[this.head++];
    if (this.head === this.buflen) this.head = 0;
    this.marked[ret] = 0;
    return ret;
  }
}

/**
 * Run the solver over `tiles` (mutated: locked tiles gain the `LOCKED` bit,
 * others lose it). `barriers` may be `null` (generator's first pass, no
 * barriers yet). Returns {@link SOLVER_INCONSISTENT}/{@link SOLVER_AMBIGUOUS}/
 * {@link SOLVER_UNIQUE}.
 */
export function netSolver(
  w: number,
  h: number,
  tiles: Uint8Array,
  barriers: Uint8Array | null,
  wrapping: boolean,
): number {
  const wh = w * h;

  /*
   * tilestate stores the possible orientations of each tile — up to four,
   * indexed in fours, clearing to 255 from the end as things are ruled out.
   * We also count the grid's area (non-empty tiles); it is w*h for a grid this
   * generator makes, but the solver stays general.
   */
  const tilestate = new Uint8Array(wh * 4);
  let area = 0;
  for (let i = 0; i < wh; i++) {
    tilestate[i * 4] = tiles[i] & 0xf;
    for (let j = 1; j < 4; j++) {
      if (
        tilestate[i * 4 + j - 1] === 255 ||
        anticlockwise(tilestate[i * 4 + j - 1]) === tilestate[i * 4]
      ) {
        tilestate[i * 4 + j] = 255;
      } else {
        tilestate[i * 4 + j] = anticlockwise(tilestate[i * 4 + j - 1]);
      }
    }
    if (tiles[i] !== 0) area++;
  }

  /*
   * edgestate: 0 unknown, 1 open, 2 closed. Five bytes per tile so that
   * direction d ∈ {1,2,4,8} indexes `(y*w+x)*5 + d` without overlap.
   */
  const edgeLen = (wh - 1) * 5 + 9;
  const edgestate = new Uint8Array(edgeLen);

  /*
   * deadends[(y*w+x)*5 + d]: at most this many tiles can be reached by heading
   * out of (x,y) in direction d. area+1 means "no dead end known".
   */
  const deadends = new Int32Array(edgeLen).fill(area + 1);

  /* equivalence classes of connected tiles, to avoid creating loops. */
  const equivalence = new Dsf(wh);

  /* On a non-wrapping grid the border edges are instantly closed. */
  if (!wrapping) {
    for (let i = 0; i < w; i++) {
      edgestate[i * 5 + 2] = 2;
      edgestate[((h - 1) * w + i) * 5 + 8] = 2;
    }
    for (let i = 0; i < h; i++) {
      edgestate[(i * w + w - 1) * 5 + 1] = 2;
      edgestate[i * w * 5 + 4] = 2;
    }
  }

  /* Barriers close their edges too. */
  if (barriers) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let d = 1; d <= 8; d += d) {
          if (barriers[y * w + x] & d) {
            const { x: x2, y: y2 } = offset(x, y, d, w, h);
            edgestate[(y * w + x) * 5 + d] = 2;
            edgestate[(y2 * w + x2) * 5 + opposite(d)] = 2;
          }
        }
      }
    }
  }

  const todo = new Todo(wh);

  let doneSomething = true; // prevent instant termination
  for (;;) {
    let index = todo.get();
    if (index === -1) {
      // Nothing immediate: scan the whole grid once more for longer-range
      // deductions, terminating if a full pass finds nothing.
      if (!doneSomething) break;
      for (let i = 0; i < wh; i++) todo.add(i);
      doneSomething = false;
      index = todo.get();
    }

    const y = Math.floor(index / w);
    const x = index % w;
    const ourclass = equivalence.canonify(y * w + x);
    // Indexed by direction (1,2,4,8).
    const deadendmax = new Int32Array(9);

    let i: number;
    let j = 0;
    for (i = 0; i < 4 && tilestate[(y * w + x) * 4 + i] !== 255; i++) {
      const val = tilestate[(y * w + x) * 4 + i];
      let valid = true;
      let nnondeadends = 0;
      const nondeadends: number[] = [];
      let deadendtotal = 0;
      const equiv = [ourclass];

      for (let d = 1; d <= 8; d += d) {
        // Rule out this orientation if it conflicts with a known edge.
        if (
          (edgestate[(y * w + x) * 5 + d] === 1 && !(val & d)) ||
          (edgestate[(y * w + x) * 5 + d] === 2 && val & d)
        ) {
          valid = false;
        }

        if (val & d) {
          // Dead-end statistics.
          if (deadends[(y * w + x) * 5 + d] <= area) {
            deadendtotal += deadends[(y * w + x) * 5 + d];
          } else {
            nondeadends[nnondeadends++] = d;
          }

          // Loop avoidance: don't link through an unknown edge to a tile
          // already in one of the classes we're about to be part of.
          if (edgestate[(y * w + x) * 5 + d] === 0) {
            const { x: x2, y: y2 } = offset(x, y, d, w, h);
            const c = equivalence.canonify(y2 * w + x2);
            let k = 0;
            for (; k < equiv.length; k++) if (c === equiv[k]) break;
            if (k === equiv.length) equiv.push(c);
            else valid = false;
          }
        }
      }

      if (nnondeadends === 0) {
        // Links only dead-ends: invalid if the sub-network it seals off is
        // smaller than the whole grid (+1 for this tile itself).
        if (deadendtotal > 0 && deadendtotal + 1 < area) valid = false;
      } else if (nnondeadends === 1) {
        // Links dead-ends plus exactly one non-dead-end — that non-dead-end may
        // become a dead end the other way, if every surviving orientation
        // agrees.
        deadendtotal++;
        if (deadendmax[nondeadends[0]] < deadendtotal) {
          deadendmax[nondeadends[0]] = deadendtotal;
        }
      } else {
        // Links two or more non-dead-ends: rule out new dead-end markings there.
        for (let k = 0; k < nnondeadends; k++) deadendmax[nondeadends[k]] = area + 1;
      }

      if (valid) tilestate[(y * w + x) * 4 + j++] = val;
    }

    if (j === 0) return SOLVER_INCONSISTENT; // no possible orientation

    if (j < i) {
      doneSomething = true;
      while (j < 4) tilestate[(y * w + x) * 4 + j++] = 255;
    }

    // Deduce new edge states: open in all surviving orientations, or closed in
    // all of them.
    {
      let a = 0xf;
      let o = 0;
      for (let k = 0; k < 4 && tilestate[(y * w + x) * 4 + k] !== 255; k++) {
        a &= tilestate[(y * w + x) * 4 + k];
        o |= tilestate[(y * w + x) * 4 + k];
      }
      for (let d = 1; d <= 8; d += d) {
        if (edgestate[(y * w + x) * 5 + d] === 0) {
          const { x: x2, y: y2 } = offset(x, y, d, w, h);
          const d2 = opposite(d);
          if (a & d) {
            edgestate[(y * w + x) * 5 + d] = 1;
            edgestate[(y2 * w + x2) * 5 + d2] = 1;
            equivalence.merge(y * w + x, y2 * w + x2);
            doneSomething = true;
            todo.add(y2 * w + x2);
          } else if (!(o & d)) {
            edgestate[(y * w + x) * 5 + d] = 2;
            edgestate[(y2 * w + x2) * 5 + d2] = 2;
            doneSomething = true;
            todo.add(y2 * w + x2);
          }
        }
      }
    }

    // Propagate any lowered dead-end markers.
    for (let d = 1; d <= 8; d += d) {
      const { x: x2, y: y2 } = offset(x, y, d, w, h);
      const d2 = opposite(d);
      if (deadendmax[d] > 0 && deadends[(y2 * w + x2) * 5 + d2] > deadendmax[d]) {
        deadends[(y2 * w + x2) * 5 + d2] = deadendmax[d];
        doneSomething = true;
        todo.add(y2 * w + x2);
      }
    }
  }

  // Mark every fully-determined tile as locked; the grid is unique iff all are.
  let unique = SOLVER_UNIQUE;
  for (let i = 0; i < wh; i++) {
    if (tilestate[i * 4 + 1] === 255) {
      tiles[i] = tilestate[i * 4] | LOCKED;
    } else {
      tiles[i] &= ~LOCKED;
      unique = SOLVER_AMBIGUOUS;
    }
  }

  return unique;
}
