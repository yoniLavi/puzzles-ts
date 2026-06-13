/**
 * Divide a w×h rectangle into random equal-size polyominoes — idiomatic
 * TS port of upstream `divvy.c` (`divvy_rectangle`).
 *
 * Lazy idiomatic leaf, kept local to Palisade per the `ts-migration`
 * rule: Solo is its only other upstream consumer and is unported, so we
 * promote to `engine/` only when Solo lands. The algorithm is faithful
 * to C — the 8-neighbour simple-connectivity test (`addRemCommon`), the
 * per-iteration addable/removable scan, and the BFS square-stealing
 * chain — over the shared `Dsf` and `shuffle`/`randomUpto`.
 */

import { Dsf } from "../../engine/dsf.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";

/**
 * The shared add/remove test: walk the 8 neighbours of (x,y) in cyclic
 * order and count transitions between "owned by `val`" and not. A square
 * may be added to (or removed from) omino `val` without leaving a hole
 * (resp. disconnecting it) iff that count is exactly 2 — and it must be
 * 4-adjacent to `val` at all.
 */
function addRemCommon(
  w: number,
  h: number,
  x: number,
  y: number,
  own: Int32Array,
  val: number,
): boolean {
  const nb: number[] = new Array(8);
  for (let dir = 0; dir < 8; dir++) {
    const dx = (dir & 3) === 2 ? 0 : dir > 2 && dir < 6 ? +1 : -1;
    const dy = (dir & 3) === 0 ? 0 : dir < 4 ? -1 : +1;
    const sx = x + dx;
    const sy = y + dy;
    nb[dir] = sx < 0 || sx >= w || sy < 0 || sy >= h ? -1 : own[sy * w + sx];
  }
  // 4-adjacency first.
  if (nb[0] !== val && nb[2] !== val && nb[4] !== val && nb[6] !== val) return false;

  let count = 0;
  for (let dir = 0; dir < 8; dir++) {
    const next = (dir + 1) & 7;
    if ((nb[dir] === val) !== (nb[next] === val)) count++;
  }
  return count === 2;
}

/** One attempt; returns the partition dsf, or null if the BFS got stuck. */
function divvyRectangleAttempt(
  w: number,
  h: number,
  k: number,
  rng: RandomState,
): Dsf | null {
  const wh = w * h;
  const n = wh / k; // number of ominoes

  const order: number[] = Array.from({ length: wh }, (_, i) => i);
  const tmp = new Int32Array(wh);
  const own = new Int32Array(wh).fill(-1);
  const sizes = new Int32Array(n);
  const queue = new Int32Array(n);
  const addable = new Int32Array(wh * 4);
  const removable = new Uint8Array(wh);

  // Random scan order — kills directional bias, makes output non-deterministic.
  shuffle(order, rng);

  // One random starting square per omino.
  for (let i = 0; i < n; i++) {
    own[order[i]] = i;
    sizes[i] = 1;
  }

  // Repeatedly pick an undersized omino and expand it by one, possibly
  // stealing a square via a BFS chain that ends in an unclaimed square.
  while (true) {
    // Compute, per square, what can be added to / removed from each omino.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const yx = y * w + x;
        const curr = own[yx];
        if (curr < 0) removable[yx] = 0;
        else if (sizes[curr] === 1) removable[yx] = 1;
        else removable[yx] = addRemCommon(w, h, x, y, own, curr) ? 1 : 0;

        for (let dir = 0; dir < 4; dir++) {
          const dx = dir === 0 ? -1 : dir === 1 ? +1 : 0;
          const dy = dir === 2 ? -1 : dir === 3 ? +1 : 0;
          const sx = x + dx;
          const sy = y + dy;
          addable[yx * 4 + dir] = -1;
          if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
          const syx = sy * w + sx;
          if (own[syx] < 0) continue;
          if (own[syx] === own[yx]) continue;
          if (!addRemCommon(w, h, x, y, own, own[syx])) continue;
          addable[yx * 4 + dir] = own[syx];
        }
      }
    }

    // Pick a random undersized omino; if none, every omino is complete.
    let j = 0;
    let cand = 0;
    for (let i = 0; i < n; i++) if (sizes[i] < k) tmp[cand++] = i;
    if (cand === 0) break;
    j = tmp[randomUpto(rng, cand)];

    // BFS out from j across ominoes. tmp[2*i]=came-from omino,
    // tmp[2*i+1]=square it stole from us.
    for (let i = 0; i < n; i++) tmp[2 * i] = tmp[2 * i + 1] = -1;
    let qhead = 0;
    let qtail = 0;
    queue[qtail++] = j;
    tmp[2 * j] = tmp[2 * j + 1] = -2; // starting point

    while (qhead < qtail) {
      j = queue[qhead];

      // Temporarily un-own the square j was reached by stealing.
      const tmpsq = tmp[2 * j + 1];
      if (tmpsq >= 0) own[tmpsq] = -3;

      // Try to find an unclaimed square to expand j into; success ends the BFS.
      let found = -1;
      for (let ii = 0; ii < wh; ii++) {
        if (own[order[ii]] !== -1) continue;
        // Size-1 omino that just lost a square can expand anywhere.
        if (sizes[j] === 1 && tmpsq >= 0) {
          found = ii;
          break;
        }
        let dir = 0;
        for (; dir < 4; dir++) {
          if (addable[order[ii] * 4 + dir] === j) {
            if (!addRemCommon(w, h, order[ii] % w, Math.floor(order[ii] / w), own, j))
              continue;
            break;
          }
        }
        if (dir === 4) continue;
        found = ii;
        break;
      }

      if (found >= 0) {
        let i = order[found];
        if (tmpsq >= 0) own[tmpsq] = j; // restore before reshuffling ownership

        // Backtrack the trail, shifting squares between ominoes, ending
        // by expanding the starting omino.
        while (true) {
          own[i] = j;
          if (tmp[2 * j] === -2) break;
          i = tmp[2 * j + 1];
          j = tmp[2 * j];
        }
        sizes[j]++;
        break; // terminate the BFS
      }

      // No unclaimed square reachable. Enqueue unvisited ominoes we can steal from.
      for (let ii = 0; ii < wh; ii++) {
        const nj = own[order[ii]];
        if (nj < 0 || tmp[2 * nj] !== -1) continue; // unclaimed or wrong omino
        if (!removable[order[ii]]) continue;
        for (let dir = 0; dir < 4; dir++) {
          if (addable[order[ii] * 4 + dir] === j) {
            if (!addRemCommon(w, h, order[ii] % w, Math.floor(order[ii] / w), own, j))
              continue;
            queue[qtail++] = nj;
            tmp[2 * nj] = j;
            tmp[2 * nj + 1] = order[ii];
            break; // don't enqueue the same omino twice
          }
        }
      }

      if (tmpsq >= 0) own[tmpsq] = j; // restore
      qhead++;
    }

    if (qhead === qtail) return null; // BFS exhausted: fail this attempt
  }

  // Build the output dsf: merge every square into its omino's representative.
  for (let i = 0; i < wh; i++) tmp[own[i]] = i;
  const ret = new Dsf(wh);
  for (let i = 0; i < wh; i++) ret.merge(i, tmp[own[i]]);

  return ret;
}

/** Divide a w×h rectangle into equal `k`-ominoes (k must divide w·h). */
export function divvyRectangle(w: number, h: number, k: number, rng: RandomState): Dsf {
  let ret: Dsf | null = null;
  while (ret === null) ret = divvyRectangleAttempt(w, h, k, rng);
  return ret;
}
