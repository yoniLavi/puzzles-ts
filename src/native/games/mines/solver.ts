/**
 * Minesweeper solver (`minesolve`, mines.c:702), used by the generator to
 * ensure a `unique` board is deducible without guessing.
 *
 * Idiomatic in shape (typed arrays, closures for the open/perturb callbacks,
 * a `SortedMultiset` for the set store) but faithful in *order*: the set store
 * is ordered by `setcmp = (y, x, mask)` and the square-todo is a FIFO, because
 * the generator picks its perturbation target by positional index into the
 * store at the deductive fixpoint (mines.c:1244) — so the deduction order is
 * byte-match surface (design D6.3), not a tidy convention.
 */

import { SortedMultiset } from "../../engine/sorted-multiset.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";

/** Count set bits in a value that never exceeds 9 bits (a 3×3 mask). */
function bitcount16(word: number): number {
  let w = word & 0xffff;
  w = ((w & 0xaaaa) >> 1) + (w & 0x5555);
  w = ((w & 0xcccc) >> 2) + (w & 0x3333);
  w = ((w & 0xf0f0) >> 4) + (w & 0x0f0f);
  w = ((w & 0xff00) >> 8) + (w & 0x00ff);
  return w;
}

interface MineSet {
  x: number;
  y: number;
  mask: number;
  mines: number;
  todo: boolean;
  prev: MineSet | null;
  next: MineSet | null;
}

/** `(y, x, mask)` total order (upstream `setcmp`, mines.c:361). */
function setcmp(a: MineSet, b: MineSet): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  return a.mask - b.mask;
}

/**
 * Munge set 1 by intersecting (or, when `diff`, subtracting) set 2, after
 * translating set 2 onto set 1's origin. Returns the new mask (upstream
 * `setmunge`, mines.c:400).
 */
function setmunge(
  x1: number,
  y1: number,
  mask1: number,
  x2: number,
  y2: number,
  mask2: number,
  diff: boolean,
): number {
  if (Math.abs(x2 - x1) >= 3 || Math.abs(y2 - y1) >= 3) {
    mask2 = 0;
  } else {
    while (x2 > x1) {
      mask2 &= ~(4 | 32 | 256);
      mask2 <<= 1;
      x2--;
    }
    while (x2 < x1) {
      mask2 &= ~(1 | 8 | 64);
      mask2 >>= 1;
      x2++;
    }
    while (y2 > y1) {
      mask2 &= ~(64 | 128 | 256);
      mask2 <<= 3;
      y2--;
    }
    while (y2 < y1) {
      mask2 &= ~(1 | 2 | 4);
      mask2 >>= 3;
      y2++;
    }
  }
  if (diff) mask2 ^= 511;
  return mask1 & mask2;
}

class SetStore {
  readonly sets = new SortedMultiset<MineSet>(setcmp);
  todoHead: MineSet | null = null;
  todoTail: MineSet | null = null;

  addTodo(s: MineSet): void {
    if (s.todo) return;
    s.prev = this.todoTail;
    if (s.prev) s.prev.next = s;
    else this.todoHead = s;
    this.todoTail = s;
    s.next = null;
    s.todo = true;
  }

  /** Normalise (x, y) to the mask's bounding box, then insert; if a set with
   * the same (x, y, mask) already exists it is left untouched (upstream
   * `ss_add`, mines.c:465). */
  add(x: number, y: number, mask: number, mines: number): void {
    while (!(mask & (1 | 8 | 64))) {
      mask >>= 1;
      x++;
    }
    while (!(mask & (1 | 2 | 4))) {
      mask >>= 3;
      y++;
    }
    const s: MineSet = { x, y, mask, mines, todo: false, prev: null, next: null };
    if (!this.sets.add(s)) return; // already present — drop the duplicate
    this.addTodo(s);
  }

  remove(s: MineSet): void {
    const { next, prev } = s;
    if (prev) prev.next = next;
    else if (s === this.todoHead) this.todoHead = next;
    if (next) next.prev = prev;
    else if (s === this.todoTail) this.todoTail = prev;
    s.todo = false;
    this.sets.delete(s);
  }

  /** All sets overlapping the input (x, y, mask) set, in store order
   * (upstream `ss_overlap`, mines.c:543 — its scan order feeds deduction
   * order, design D6.3). */
  overlap(x: number, y: number, mask: number): MineSet[] {
    const ret: MineSet[] = [];
    for (let xx = x - 3; xx < x + 3; xx++) {
      for (let yy = y - 3; yy < y + 3; yy++) {
        const probe: MineSet = {
          x: xx,
          y: yy,
          mask: 0,
          mines: 0,
          todo: false,
          prev: null,
          next: null,
        };
        let pos = this.sets.lastIndexLessThan(probe) + 1;
        while (pos < this.sets.size) {
          const s = this.sets.get(pos);
          if (s.x !== xx || s.y !== yy) break;
          if (setmunge(x, y, mask, s.x, s.y, s.mask, false)) ret.push(s);
          pos++;
        }
      }
    }
    return ret;
  }

  popTodo(): MineSet | null {
    if (!this.todoHead) return null;
    const ret = this.todoHead;
    this.todoHead = ret.next;
    if (this.todoHead) this.todoHead.prev = null;
    else this.todoTail = null;
    ret.next = ret.prev = null;
    ret.todo = false;
    return ret;
  }
}

/** FIFO of grid indices whose contents just became known (upstream
 * `struct squaretodo`, mines.c:614). */
class SquareTodo {
  readonly next: Int32Array;
  head = -1;
  tail = -1;
  constructor(wh: number) {
    this.next = new Int32Array(wh);
  }
  add(i: number): void {
    if (this.tail >= 0) this.next[this.tail] = i;
    else this.head = i;
    this.tail = i;
    this.next[i] = -1;
  }
}

/** A revealed square: mine count for a safe open, or -1 for *bang*. */
export type OpenCb = (x: number, y: number) => number;
export interface Perturbation {
  x: number;
  y: number;
  /** +1 = became a mine; -1 = cleared. */
  delta: number;
}
export type PerturbCb = (
  grid: Int8Array,
  setx: number,
  sety: number,
  mask: number,
) => Perturbation[] | null;

/**
 * Mark the squares of (x, y, mask) as known — mines when `mine`, else opened
 * via the `open` callback — adding freshly-known squares to `std` (upstream
 * `known_squares`, mines.c:631).
 */
function knownSquares(
  w: number,
  std: SquareTodo,
  grid: Int8Array,
  open: OpenCb,
  x: number,
  y: number,
  mask: number,
  mine: boolean,
): void {
  let bit = 1;
  for (let yy = 0; yy < 3; yy++) {
    for (let xx = 0; xx < 3; xx++) {
      if (mask & bit) {
        const i = (y + yy) * w + (x + xx);
        if (grid[i] === -2) {
          if (mine) {
            grid[i] = -1; // and don't open it
          } else {
            grid[i] = open(x + xx, y + yy);
            // grid[i] must not be -1 here — that would be *bang*.
          }
          std.add(i);
        }
      }
      bit <<= 1;
    }
  }
}

/**
 * Main solver (upstream `minesolve`, mines.c:702). Fills in as much of `grid`
 * as it can from the given knowledge (-1 mine, 0..8 open, -2 unknown), opening
 * squares via `open` and, when stuck, nudging the board via `perturb`.
 *
 * Returns -1 (stalled with unknowns left), 0 (fully solved), or the number of
 * perturbation steps required (>0). `n < 0` disables the global mine-count
 * deduction (used when the total is unknown).
 */
export function minesolve(
  w: number,
  h: number,
  n: number,
  grid: Int8Array,
  open: OpenCb,
  perturb: PerturbCb | null,
  rs: RandomState | null,
): number {
  const ss = new SetStore();
  const std = new SquareTodo(w * h);
  let nperturbs = 0;

  // Seed the square-todo with every already-known square.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (grid[i] !== -2) std.add(i);
    }
  }

  while (true) {
    let doneSomething = false;

    // Process known squares, constructing a set for each open one.
    while (std.head !== -1) {
      const i = std.head;
      std.head = std.next[i];
      if (std.head === -1) std.tail = -1;

      const x = i % w;
      const y = Math.floor(i / w);

      if (grid[i] >= 0) {
        // Empty square: build the set of unknown neighbours + its mine count.
        let mines = grid[i];
        let bit = 1;
        let val = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!(x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h)) {
              const g = grid[i + dy * w + dx];
              if (g === -1) mines--;
              else if (g === -2) val |= bit;
            }
            bit <<= 1;
          }
        }
        if (val) ss.add(x - 1, y - 1, val, mines);
      }

      // Whether empty or full, replace every set containing this square with
      // one that does not.
      {
        const list = ss.overlap(x, y, 1);
        for (const s of list) {
          const newmask = setmunge(s.x, s.y, s.mask, x, y, 1, true);
          const newmines = s.mines - (grid[i] === -1 ? 1 : 0);
          if (newmask) ss.add(s.x, s.y, newmask, newmines);
          ss.remove(s);
        }
      }

      doneSomething = true;
    }

    // Pick a set off the to-do list and attempt deductions.
    const s = ss.popTodo();
    if (s !== null) {
      // Mine count of zero or of its full cardinality → mark everything.
      if (s.mines === 0 || s.mines === bitcount16(s.mask)) {
        knownSquares(w, std, grid, open, s.x, s.y, s.mask, s.mines !== 0);
        continue;
      }

      // Otherwise search the sets overlapping this one.
      const list = ss.overlap(s.x, s.y, s.mask);
      for (const s2 of list) {
        const swing = setmunge(s.x, s.y, s.mask, s2.x, s2.y, s2.mask, true);
        const s2wing = setmunge(s2.x, s2.y, s2.mask, s.x, s.y, s.mask, true);
        const swc = bitcount16(swing);
        const s2wc = bitcount16(s2wing);

        // If the extra-mine count equals a wing's cardinality, that wing is
        // all mines and the other wing all clear.
        if (swc === s.mines - s2.mines || s2wc === s2.mines - s.mines) {
          knownSquares(w, std, grid, open, s.x, s.y, swing, swc === s.mines - s2.mines);
          knownSquares(
            w,
            std,
            grid,
            open,
            s2.x,
            s2.y,
            s2wing,
            s2wc === s2.mines - s.mines,
          );
          continue;
        }

        // Failing that, subset: divide the larger set's mines.
        if (swc === 0 && s2wc !== 0) {
          // s is a subset of s2.
          ss.add(s2.x, s2.y, s2wing, s2.mines - s.mines);
        } else if (s2wc === 0 && swc !== 0) {
          // s2 is a subset of s.
          ss.add(s.x, s.y, swing, s.mines - s2.mines);
        }
      }

      doneSomething = true;
    } else if (n >= 0) {
      // Global deduction on the total mine count (expensive; last resort).
      let squaresleft = 0;
      let minesleft = n;
      for (let i = 0; i < w * h; i++) {
        if (grid[i] === -1) minesleft--;
        else if (grid[i] === -2) squaresleft++;
      }

      if (squaresleft === 0) break; // solved (minesleft === 0 by invariant)

      // Simple case: no mines left, or as many mines as squares.
      if (minesleft === 0 || minesleft === squaresleft) {
        for (let i = 0; i < w * h; i++) {
          if (grid[i] === -2) {
            knownSquares(w, std, grid, open, i % w, Math.floor(i / w), 1, minesleft !== 0);
          }
        }
        continue;
      }

      // Real work: search every disjoint union of up to 10 sets for one whose
      // complement is provably all-mines or all-clear (upstream's virtual
      // recursion over `setused`, mines.c:1030).
      const nsets = ss.sets.size;
      if (nsets <= 10) {
        const setused: boolean[] = new Array(nsets).fill(false);
        const sets: MineSet[] = [];
        for (let i = 0; i < nsets; i++) sets[i] = ss.sets.get(i);

        let cursor = 0;
        while (true) {
          if (cursor < nsets) {
            let ok = true;
            for (let i = 0; i < cursor; i++) {
              if (
                setused[i] &&
                setmunge(
                  sets[cursor].x,
                  sets[cursor].y,
                  sets[cursor].mask,
                  sets[i].x,
                  sets[i].y,
                  sets[i].mask,
                  false,
                )
              ) {
                ok = false;
                break;
              }
            }
            if (ok) {
              minesleft -= sets[cursor].mines;
              squaresleft -= bitcount16(sets[cursor].mask);
            }
            setused[cursor++] = ok;
          } else {
            if (squaresleft > 0 && (minesleft === 0 || minesleft === squaresleft)) {
              for (let i = 0; i < w * h; i++) {
                if (grid[i] === -2) {
                  let outside = true;
                  const yy = Math.floor(i / w);
                  const xx = i % w;
                  for (let j = 0; j < nsets; j++) {
                    if (
                      setused[j] &&
                      setmunge(sets[j].x, sets[j].y, sets[j].mask, xx, yy, 1, false)
                    ) {
                      outside = false;
                      break;
                    }
                  }
                  if (outside) {
                    knownSquares(w, std, grid, open, xx, yy, 1, minesleft !== 0);
                  }
                }
              }
              doneSomething = true;
              break;
            }
            // Backtrack cursor to the nearest used set, unset it, advance past.
            while (--cursor >= 0 && !setused[cursor]);
            if (cursor >= 0) {
              minesleft += sets[cursor].mines;
              squaresleft += bitcount16(sets[cursor].mask);
              setused[cursor++] = false;
            } else {
              break; // exhausted all disjoint unions
            }
          }
        }
      }
    }

    if (doneSomething) continue;

    // Out of deductions: ask the perturb function to make the board easier.
    if (perturb) {
      nperturbs++;
      let ret: Perturbation[] | null;
      if (ss.sets.size === 0) {
        ret = perturb(grid, 0, 0, 0);
      } else {
        const pset = ss.sets.get(randomUpto(rs as RandomState, ss.sets.size));
        ret = perturb(grid, pset.x, pset.y, pset.mask);
      }

      if (ret) {
        // Adjust the mine counts of any set overlapping a changed square, put
        // those sets (and re-covered squares) back on the to-do lists.
        for (const change of ret) {
          if (change.delta < 0 && grid[change.y * w + change.x] !== -2) {
            std.add(change.y * w + change.x);
          }
          const list = ss.overlap(change.x, change.y, 1);
          for (const set of list) {
            set.mines += change.delta;
            ss.addTodo(set);
          }
        }
        continue;
      }
    }

    // No perturb function, or it gave up: we are done.
    break;
  }

  // Any unknown squares left ⇒ we failed to complete.
  for (let i = 0; i < w * h; i++) {
    if (grid[i] === -2) {
      nperturbs = -1;
      break;
    }
  }

  return nperturbs;
}
