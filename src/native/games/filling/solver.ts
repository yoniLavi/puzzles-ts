/**
 * Filling (Fillomino) solver — idiomatic TS port of `filling.c`'s `solver`
 * and its four `learn_*` deductions.
 *
 * Every deduction only fills an *empty* cell with a *forced* value, so the
 * solver is **confluent**: the final filled set is independent of the order
 * the techniques fire. We therefore port the four techniques idiomatically
 * (no `connected[]` cyclic-linked-list mirroring) and iterate to fixpoint;
 * the solved/stuck verdict — which the generator's clue minimisation depends
 * on — is identical to C's because both reach the same fixpoint.
 */
import { Dsf } from "../../engine/dsf.ts";
import { DX, DY } from "./state.ts";

class FillingSolver {
  readonly w: number;
  readonly h: number;
  readonly sz: number;
  /** Working board (0 = empty, 1..9 = value). */
  readonly board: Int32Array;
  /** Connected components of filled equal-valued cells. */
  dsf: Dsf;
  /** Per-cell "next member of my component" cyclic linked list, kept in step
   * with `dsf` (upstream `connected`). It lets `learnCriticalSquare` walk a
   * region's members — including ones it fills *during the same pass*, which
   * is load-bearing for differential parity (the distance pre-filter sees the
   * grown region, exactly as C). */
  private readonly connected: Int32Array;
  nempty: number;

  constructor(orig: ArrayLike<number>, w: number, h: number) {
    this.w = w;
    this.h = h;
    this.sz = w * h;
    this.board = Int32Array.from(orig);
    this.dsf = new Dsf(this.sz);
    this.connected = new Int32Array(this.sz);
    for (let i = 0; i < this.sz; i++) this.connected[i] = i;
    this.nempty = 0;
    for (let i = 0; i < this.sz; i++) {
      if (this.board[i] === 0) this.nempty++;
      else this.filledSquare(i);
    }
  }

  /** Merge cells `a` and `b`'s components in both the dsf and the cyclic
   * `connected` list (upstream `merge`): splice the two cycles by swapping
   * the roots' `connected` pointers. */
  private mergeCC(a: number, b: number): void {
    const ra = this.dsf.canonify(a);
    const rb = this.dsf.canonify(b);
    if (ra === rb) return;
    this.dsf.merge(ra, rb);
    const c = this.connected[ra];
    this.connected[ra] = this.connected[rb];
    this.connected[rb] = c;
  }

  /** Merge a newly-filled cell with same-valued orthogonal neighbours. */
  private filledSquare(i: number): void {
    const { w, h, board } = this;
    const x = i % w;
    const y = (i / w) | 0;
    for (let j = 0; j < 4; j++) {
      const nx = x + DX[j];
      const ny = y + DY[j];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const idx = ny * w + nx;
      if (board[i] === board[idx]) this.mergeCC(i, idx);
    }
  }

  /** Fill empty cell `t` with the value of filled cell `f`, merging. */
  private expand(t: number, f: number): void {
    this.board[t] = this.board[f];
    this.filledSquare(t);
    this.nempty--;
  }

  /** Size of the region if empty cell `i` were filled with value `n`:
   * 1 + the (deduplicated) sizes of the value-`n` regions it would join. */
  private expandsize(i: number, n: number): number {
    const { w, h, board, dsf } = this;
    const x = i % w;
    const y = (i / w) | 0;
    let size = 1;
    const hits: number[] = [];
    for (let j = 0; j < 4; j++) {
      const nx = x + DX[j];
      const ny = y + DY[j];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const idx = ny * w + nx;
      if (board[idx] !== n) continue;
      const root = dsf.canonify(idx);
      if (hits.includes(root)) continue;
      size += dsf.size(root);
      hits.push(root);
    }
    return size;
  }

  /** Can the region containing filled cell `i` (value n) still reach size n
   * by flooding over empty / same-value cells, treating `blocked` as a wall?
   * (Upstream `check_capacity` / `flood_count`, with an explicit visited set
   * instead of negative-sentinel board mutation.) */
  private checkCapacity(i: number, blocked: number): boolean {
    const { w, h, board, sz } = this;
    const n = board[i];
    const visited = new Uint8Array(sz);
    const stack = [i];
    visited[i] = 1;
    let count = 0;
    while (stack.length > 0) {
      const c = stack.pop() as number;
      if (++count >= n) return true;
      const x = c % w;
      const y = (c / w) | 0;
      for (let j = 0; j < 4; j++) {
        const nx = x + DX[j];
        const ny = y + DY[j];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const idx = ny * w + nx;
        if (visited[idx] || idx === blocked) continue;
        if (board[idx] === 0 || board[idx] === n) {
          visited[idx] = 1;
          stack.push(idx);
        }
      }
    }
    return count >= n;
  }

  /** Cells of the canonical region rooted at `root` (value-equal connected). */
  private regionCells(root: number, value: number): number[] {
    const { sz, board, dsf } = this;
    const cells: number[] = [];
    for (let c = 0; c < sz; c++) {
      if (board[c] === value && dsf.canonify(c) === root) cells.push(c);
    }
    return cells;
  }

  /** A region with exactly one legal growth cell must grow into it. */
  private learnBlockedExpansion(): boolean {
    const { w, h, board, dsf, sz } = this;
    let learn = false;
    for (let i = 0; i < sz; i++) {
      if (board[i] === 0) continue;
      if (i !== dsf.canonify(i)) continue; // canonical only
      if (dsf.size(i) === board[i]) continue; // already complete
      const targets = new Set<number>();
      let bail = false;
      for (const c of this.regionCells(i, board[i])) {
        const x = c % w;
        const y = (c / w) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + DX[k];
          const ny = y + DY[k];
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const idx = ny * w + nx;
          if (board[idx] !== 0 || targets.has(idx)) continue;
          if (this.expandsize(idx, board[i]) > board[i]) continue;
          targets.add(idx);
          if (targets.size > 1) {
            bail = true;
            break;
          }
        }
        if (bail) break;
      }
      if (bail || targets.size !== 1) continue;
      this.expand(targets.values().next().value as number, i);
      learn = true;
    }
    return learn;
  }

  /** Either force an empty cell a neighbouring region must include to reach
   * capacity, or drop a `1` into an isolated cell no neighbour can extend. */
  private learnExpandOrOne(): boolean {
    const { w, h, board, dsf, sz } = this;
    let learn = false;
    for (let i = 0; i < sz; i++) {
      if (board[i] !== 0) continue;
      let one = true;
      let expanded = false;
      const x = i % w;
      const y = (i / w) | 0;
      for (let j = 0; j < 4; j++) {
        const nx = x + DX[j];
        const ny = y + DY[j];
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const idx = ny * w + nx;
        if (board[idx] === 0) {
          one = false;
          continue;
        }
        if (one && (board[idx] === 1 || board[idx] >= this.expandsize(i, board[idx]))) {
          one = false;
        }
        if (dsf.size(idx) === board[idx]) continue; // region complete
        if (this.checkCapacity(idx, i)) continue; // can still complete without i
        this.expand(i, idx);
        learn = true;
        expanded = true;
        break;
      }
      if (!expanded && one) {
        board[i] = 1;
        this.nempty--;
        learn = true;
      }
    }
    return learn;
  }

  /** A region with slack must include any empty cell (within Manhattan
   * distance = slack) it can't reach its size without. */
  private learnCriticalSquare(): boolean {
    const { w, board, dsf, sz, connected } = this;
    let learn = false;
    for (let i = 0; i < sz; i++) {
      if (board[i] === 0) continue;
      if (i !== dsf.canonify(i)) continue;
      const slack = board[i] - dsf.size(i);
      if (slack === 0) continue;
      for (let j = 0; j < sz; j++) {
        if (board[j] !== 0) continue;
        const jx = j % w;
        const jy = (j / w) | 0;
        // Walk the region's `connected` cycle from `i`, breaking on the first
        // member within `slack`. Upstream's post-loop `if (i == k) continue`
        // then skips `j` both when no member is in range AND when `i` itself is
        // (it is tested first, so the walk breaks at `k == i`). The cycle grows
        // as cells fill in this same loop, so later `j`s see the larger region
        // — both behaviours preserved for differential parity.
        let k = i;
        do {
          if (Math.abs((k % w) - jx) + Math.abs(((k / w) | 0) - jy) <= slack) break;
          k = connected[k];
        } while (k !== i);
        if (k === i) continue; // not within range (or only `i` is — the quirk)
        if (this.checkCapacity(i, j)) continue;
        board[j] = board[i];
        this.filledSquare(j);
        this.nempty--;
        learn = true;
      }
    }
    return learn;
  }

  /** Per-cell bitmap of still-possible numbers; a cell left with one
   * possibility is forced. The one technique that infers *ghost regions*
   * (a region with no clued cell). Upstream `learn_bitmap_deductions`. */
  private learnBitmapDeductions(): boolean {
    const { w, h, board, dsf, sz } = this;
    const bm = new Int32Array(sz);
    const bmdsf = new Dsf(sz);
    const minsize = new Int32Array(sz);
    let learn = false;
    const ALL = (1 << 10) - (1 << 1); // bits 1..9

    for (let i = 0; i < sz; i++) bm[i] = ALL;

    // Zero filled cells; clear their number from orthogonal neighbours.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const n = board[i];
        if (n !== 0) {
          bm[i] = 0;
          if (x > 0) bm[i - 1] &= ~(1 << n);
          if (x + 1 < w) bm[i + 1] &= ~(1 << n);
          if (y > 0) bm[i - w] &= ~(1 << n);
          if (y + 1 < h) bm[i + w] &= ~(1 << n);
        }
      }
    }

    // Winnow components too small to host a brand-new n-region.
    for (let n = 1; n <= 9; n++) {
      bmdsf.reinit();
      for (let y = 0; y < h; y++) {
        for (let x = 0; x + 1 < w; x++) {
          if (bm[y * w + x] & bm[y * w + x + 1] & (1 << n)) {
            bmdsf.merge(y * w + x, y * w + x + 1);
          }
        }
      }
      for (let y = 0; y + 1 < h; y++) {
        for (let x = 0; x < w; x++) {
          if (bm[y * w + x] & bm[(y + 1) * w + x] & (1 << n)) {
            bmdsf.merge(y * w + x, (y + 1) * w + x);
          }
        }
      }
      for (let i = 0; i < sz; i++) {
        if (bm[i] & (1 << n) && bmdsf.size(i) < n) bm[i] &= ~(1 << n);
      }
    }

    // BFS out from existing n-regions to re-admit reachable cells.
    for (let n = 1; n <= 9; n++) {
      for (let i = 0; i < sz; i++) {
        minsize[i] = board[i] === n ? dsf.size(i) : n + 1;
      }
      for (let j = 1; j < n; j++) {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (minsize[i] !== j) continue;
            if (x > 0 && minsize[i - 1] > j + 1) minsize[i - 1] = j + 1;
            if (x + 1 < w && minsize[i + 1] > j + 1) minsize[i + 1] = j + 1;
            if (y > 0 && minsize[i - w] > j + 1) minsize[i - w] = j + 1;
            if (y + 1 < h && minsize[i + w] > j + 1) minsize[i + w] = j + 1;
          }
        }
      }
      for (let i = 0; i < sz; i++) if (minsize[i] <= n) bm[i] |= 1 << n;
    }

    // A cell with a single possible number is forced.
    for (let i = 0; i < sz; i++) {
      const mask = bm[i];
      if (mask && !(mask & (mask - 1))) {
        let val = mask;
        let n = 0;
        if (val >> 8) {
          val >>= 8;
          n += 8;
        }
        if (val >> 4) {
          val >>= 4;
          n += 4;
        }
        if (val >> 2) {
          val >>= 2;
          n += 2;
        }
        if (val >> 1) {
          val >>= 1;
          n += 1;
        }
        if (board[i] === 0) {
          board[i] = n;
          this.filledSquare(i);
          this.nempty--;
          learn = true;
        }
      }
    }

    return learn;
  }

  run(): void {
    do {
      if (this.learnBlockedExpansion()) continue;
      if (this.learnExpandOrOne()) continue;
      if (this.learnCriticalSquare()) continue;
      if (this.learnBitmapDeductions()) continue;
      break;
    } while (this.nempty > 0);
  }
}

/** Solve from `orig` to fixpoint. `solved` is true iff every cell was
 * filled; `board` is the (possibly partial) deduced grid. */
export function solveFilling(
  orig: ArrayLike<number>,
  w: number,
  h: number,
): { solved: boolean; board: Int32Array } {
  const s = new FillingSolver(orig, w, h);
  s.run();
  return { solved: s.nempty === 0, board: s.board };
}
