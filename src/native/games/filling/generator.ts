/**
 * Filling (Fillomino) generator — byte-faithful port of `filling.c`'s
 * `make_board` + `minimize_clue_set`. Faithful means the RNG draw sequence
 * matches upstream exactly (same `shuffle` and `randomUpto` order over the
 * bit-identical `random.ts`), so a generated desc reproduces C's for the
 * same seed.
 *
 * Generation uses a plain mutable `number[]` board (negative sentinels appear
 * transiently in `mergeOnes`), distinct from the immutable game state.
 */
import { Dsf } from "../../engine/dsf.ts";
import { retryLimit } from "../../engine/retry-limit.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { solveFilling } from "./solver.ts";
import { DX, DY, encodeRun, type FillingParams, makeRegionDsf } from "./state.ts";

function maxRegionSize(w: number, h: number): number {
  // The `max(...,3)` is the documented w=h=2 special case (a 2×2 board needs
  // a size-3 region).
  return Math.min(Math.max(Math.max(w, h), 3), 9);
}

/** Flood the region of value `n` from `i`, marking cells `-1`; return false
 * as soon as a cell of value `m` is touched (upstream `mark_region`). */
function markRegion(
  board: number[],
  w: number,
  h: number,
  i: number,
  n: number,
  m: number,
): boolean {
  board[i] = -1;
  const x = i % w;
  const y = (i / w) | 0;
  for (let j = 0; j < 4; j++) {
    const nx = x + DX[j];
    const ny = y + DY[j];
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const ii = ny * w + nx;
    if (board[ii] === m) return false;
    if (board[ii] !== n) continue;
    if (!markRegion(board, w, h, ii, n, m)) return false;
  }
  return true;
}

/** Size of the region (equal-valued, connected) containing `i`, restoring
 * the board afterwards (upstream `region_size`). */
function regionSize(board: number[], w: number, h: number, i: number): number {
  if (board[i] === 0) return 0;
  const copy = board[i];
  markRegion(board, w, h, i, board[i], w * h + 1); // SENTINEL never matches
  let size = 0;
  const sz = w * h;
  for (let j = 0; j < sz; j++) {
    if (board[j] !== -1) continue;
    size++;
    board[j] = copy;
  }
  return size;
}

/** Absorb every size-1 region into a non-maxsize neighbour, renumbering the
 * merged region to its new size (upstream `merge_ones`). */
function mergeOnes(board: number[], w: number, h: number): void {
  const sz = w * h;
  const maxsize = maxRegionSize(w, h);
  let change: boolean;
  do {
    change = false;
    for (let i = 0; i < sz; i++) {
      if (board[i] !== 1) continue;
      let matched = false;
      for (let j = 0; j < 4; j++) {
        board[i] = 1; // upstream's per-iteration reset (the loop's increment)
        const x = (i % w) + DX[j];
        const y = ((i / w) | 0) + DY[j];
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const ii = y * w + x;
        if (board[ii] === maxsize) continue;
        const oldsize = board[ii];
        board[i] = oldsize;
        const newsize = regionSize(board, w, h, i);
        if (newsize > maxsize) continue;
        const ok = markRegion(board, w, h, i, oldsize, newsize);
        for (let k = 0; k < sz; k++) {
          if (board[k] === -1) board[k] = ok ? newsize : oldsize;
        }
        if (ok) {
          matched = true;
          break;
        }
      }
      // Mirror C's loop increment `board[i] = 1` after the final fall-through:
      // a 1-cell that failed to merge must be left as a 1 (else it stays part
      // of the neighbour region, overflowing it by one).
      if (!matched) board[i] = 1;
      if (matched) change = true;
    }
  } while (change);
}

/** Build a random valid board: a shuffled DSF region partition with
 * conflicting equal-size neighbours merged, then size-1 absorption. The
 * returned `number[]` holds each cell's region size (the full solution). */
function makeBoard(w: number, h: number, rng: RandomState): number[] {
  const sz = w * h;
  const maxsize = maxRegionSize(w, h);
  const board: number[] = [];
  for (let i = 0; i < sz; i++) board[i] = i; // shuffled cell-index list
  const dsf = new Dsf(sz);

  const attempt = retryLimit("filling: makeBoard");
  retry: while (true) {
    attempt();

    dsf.reinit();
    shuffle(board, rng);
    let change = true;
    while (change) {
      change = false;
      for (let i = 0; i < sz; i++) {
        const square = dsf.canonify(board[i]);
        const size = dsf.size(square);
        let merge = -1; // SENTINEL
        let min = maxsize - size + 1;
        let error = false;
        const directions = [0, 1, 2, 3];
        shuffle(directions, rng);
        for (let j = 0; j < 4; j++) {
          const x = (board[i] % w) + DX[directions[j]];
          const y = ((board[i] / w) | 0) + DY[directions[j]];
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          const neighbour = dsf.canonify(w * y + x);
          if (square === neighbour) continue;
          const neighbourSize = dsf.size(neighbour);
          if (size === neighbourSize) error = true;
          // The randomUpto(rng,10) draw is taken only when the size test
          // passes — short-circuit order preserved exactly as upstream.
          if (neighbourSize < min && randomUpto(rng, 10)) {
            min = neighbourSize;
            merge = neighbour;
          }
        }
        if (!error) continue;
        if (merge === -1) continue retry; // can't fix: restart the whole board
        dsf.merge(square, merge);
        change = true;
      }
    }
    break;
  }

  for (let i = 0; i < sz; i++) board[i] = dsf.size(i);
  mergeOnes(board, w, h);
  return board;
}

/** Reduce the full board to a minimal solvable clue set: first try removing
 * whole regions (a good "ghost region" puzzle), then individual clues, each
 * kept only while the solver still solves (upstream `minimize_clue_set`).
 * Its only RNG is one `shuffle(shuf)`. */
function minimizeClueSet(
  board: number[],
  w: number,
  h: number,
  rng: RandomState,
): void {
  const sz = w * h;
  const shuf: number[] = [];
  for (let i = 0; i < sz; i++) shuf[i] = i;
  shuffle(shuf, rng);

  // Region partition computed once from the full board (as upstream).
  const dsf = makeRegionDsf(board, w, h);
  const tried = new Set<number>();
  for (let i = 0; i < sz; i++) {
    const root = dsf.canonify(shuf[i]);
    if (tried.has(root)) continue;
    tried.add(root);
    const cells: number[] = [];
    for (let k = 0; k < sz; k++) if (dsf.canonify(k) === root) cells.push(k);
    const val = board[root];
    for (const c of cells) board[c] = 0;
    if (!solveFilling(board, w, h).solved) {
      for (const c of cells) board[c] = val;
    }
  }

  for (let i = 0; i < sz; i++) {
    const tmp = board[shuf[i]];
    board[shuf[i]] = 0;
    if (!solveFilling(board, w, h).solved) board[shuf[i]] = tmp;
  }
}

export function newFillingDesc(p: FillingParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const board = makeBoard(w, h, rng);
  minimizeClueSet(board, w, h, rng);

  let desc = "";
  let run = 0;
  for (let i = 0; i < w * h; i++) {
    if (board[i] === 0) {
      run++;
    } else {
      desc += encodeRun(run);
      run = 0;
      desc += String(board[i]);
    }
  }
  desc += encodeRun(run);
  return { desc };
}
