/**
 * Divide a rectangle into equally-sized connected ominoes at random — an
 * idiomatic port of `divvy.c` (`divvy_rectangle`). Shared engine leaf: consumed
 * by Solo's jigsaw sub-block division, Palisade's region generation, and
 * Separate's `k`-omino partition (promoted here from `solo/` on the third
 * consumer per playbook §2.1).
 *
 * RNG-faithful to upstream over the bit-identical `random.ts`: the draw order
 * (the `order` shuffle, the per-iteration `random_upto` omino pick, the BFS over
 * the same `order` permutation) is preserved so a generated desc matches the C
 * reference byte-for-byte. The algorithm is ported logic-faithfully (typed
 * arrays instead of `void *` scratch), not control-flow-transliterated.
 *
 * The returned `Dsf` is consumed only for membership/connectivity (Solo's
 * `blocksFromDsf` numbers regions by ascending first-appearance), so the shared
 * union-by-size `Dsf` is byte-match-safe here regardless of its root choice — the
 * partition, not the root identity, is what feeds the desc (playbook §2.2).
 */

import { type RandomState, randomUpto } from "../random/index.ts";
import { Dsf } from "./dsf.ts";
import { shuffle } from "./shuffle.ts";

/**
 * `addremcommon`: walk the eight 8-adjacent neighbours of `(x, y)` in cyclic
 * order and count transitions between "owned by `val`" and "not owned". Returns
 * true iff that count is exactly 2 — the criterion that adding the square to (or
 * removing it from) omino `val` keeps the omino simply connected. First requires
 * 4-adjacency to `val`.
 */
function addremcommon(
  w: number,
  h: number,
  x: number,
  y: number,
  own: Int32Array,
  val: number,
): boolean {
  const neighbours = new Int32Array(8);
  for (let dir = 0; dir < 8; dir++) {
    const dx = (dir & 3) === 2 ? 0 : dir > 2 && dir < 6 ? 1 : -1;
    const dy = (dir & 3) === 0 ? 0 : dir < 4 ? -1 : 1;
    const sx = x + dx;
    const sy = y + dy;
    neighbours[dir] = sx < 0 || sx >= w || sy < 0 || sy >= h ? -1 : own[sy * w + sx];
  }

  // 4-adjacency check (directions 0/2/4/6 are the orthogonal neighbours).
  if (
    neighbours[0] !== val &&
    neighbours[2] !== val &&
    neighbours[4] !== val &&
    neighbours[6] !== val
  )
    return false;

  let count = 0;
  for (let dir = 0; dir < 8; dir++) {
    const next = (dir + 1) & 7;
    if ((neighbours[dir] === val) !== (neighbours[next] === val)) count++;
  }
  return count === 2;
}

/**
 * One attempt at partitioning a `w × h` rectangle into `n = w*h/k` ominoes of
 * size `k`. Returns a `w*h`-sized `Dsf` of the partition, or `null` if this
 * attempt got stuck (the caller retries). Faithful to `divvy_rectangle_attempt`.
 */
function divvyRectangleAttempt(
  w: number,
  h: number,
  k: number,
  rng: RandomState,
): Dsf | null {
  const wh = w * h;
  const n = (wh / k) | 0;

  const order = Array.from({ length: wh }, (_, i) => i);
  const tmp = new Int32Array(wh);
  const own = new Int32Array(wh).fill(-1);
  const sizes = new Int32Array(n);
  const queue = new Int32Array(n);
  const addable = new Int32Array(wh * 4);
  const removable = new Uint8Array(wh);

  // Random iteration order; prevents directional bias and feeds the BFS.
  shuffle(order, rng);

  // Choose a starting square for each omino (the first n of the shuffled order).
  for (let i = 0; i < n; i++) {
    own[order[i]] = i;
    sizes[i] = 1;
  }

  while (true) {
    // Compute, for each square, whether it can be removed from its omino and to
    // which 4-adjacent ominoes it could be added (ignoring contention).
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const yx = y * w + x;
        const curr = own[yx];
        if (curr < 0) removable[yx] = 0;
        else if (sizes[curr] === 1) removable[yx] = 1;
        else removable[yx] = addremcommon(w, h, x, y, own, curr) ? 1 : 0;

        for (let dir = 0; dir < 4; dir++) {
          const dx = dir === 0 ? -1 : dir === 1 ? 1 : 0;
          const dy = dir === 2 ? -1 : dir === 3 ? 1 : 0;
          const sx = x + dx;
          const sy = y + dy;
          addable[yx * 4 + dir] = -1;
          if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue;
          const syx = sy * w + sx;
          if (own[syx] < 0) continue;
          if (own[syx] === own[yx]) continue;
          if (!addremcommon(w, h, x, y, own, own[syx])) continue;
          addable[yx * 4 + dir] = own[syx];
        }
      }
    }

    // Pick a random incomplete omino to expand.
    let j = 0;
    for (let i = 0; i < n; i++) if (sizes[i] < k) tmp[j++] = i;
    if (j === 0) break; // all ominoes are complete
    j = tmp[randomUpto(rng, j)];

    // BFS outward from omino j across the space of ominoes. tmp is reused as the
    // back-pointer table: tmp[2*i] = the omino we reached i from, tmp[2*i+1] =
    // the grid square it stole from us.
    for (let i = 0; i < n; i++) {
      tmp[2 * i] = -1;
      tmp[2 * i + 1] = -1;
    }
    let qhead = 0;
    let qtail = 0;
    queue[qtail++] = j;
    tmp[2 * j] = -2; // special: starting point
    tmp[2 * j + 1] = -2;

    while (qhead < qtail) {
      j = queue[qhead];

      // Temporarily un-own the square j had stolen, so adjacency calcs don't
      // assume it belongs to j.
      const tmpsq = tmp[2 * j + 1];
      if (tmpsq >= 0) own[tmpsq] = -3;

      // First, look for an unclaimed square we can expand j into; success there
      // terminates the whole BFS.
      let found = -1;
      for (let i = 0; i < wh; i++) {
        if (own[order[i]] !== -1) continue;
        if (sizes[j] === 1 && tmpsq >= 0) {
          found = i;
          break;
        }
        let dir = 0;
        for (; dir < 4; dir++)
          if (addable[order[i] * 4 + dir] === j) {
            if (!addremcommon(w, h, order[i] % w, (order[i] / w) | 0, own, j)) continue;
            break;
          }
        if (dir === 4) continue;
        found = i;
        break;
      }

      if (found >= 0) {
        let i = order[found];
        // Restore the temporarily removed square before shifting ownerships.
        if (tmpsq >= 0) own[tmpsq] = j;
        // Backtrack the trail, moving squares between ominoes, finally growing
        // the starting omino by one.
        while (true) {
          own[i] = j;
          if (tmp[2 * j] === -2) break;
          i = tmp[2 * j + 1];
          j = tmp[2 * j];
        }
        sizes[j]++;
        break; // terminate BFS
      }

      // Otherwise, queue unvisited ominoes we could expand into by poaching a
      // removable square.
      for (let i = 0; i < wh; i++) {
        const nj = own[order[i]];
        if (nj < 0 || tmp[2 * nj] !== -1) continue;
        if (!removable[order[i]]) continue;
        for (let dir = 0; dir < 4; dir++)
          if (addable[order[i] * 4 + dir] === j) {
            if (!addremcommon(w, h, order[i] % w, (order[i] / w) | 0, own, j)) continue;
            queue[qtail++] = nj;
            tmp[2 * nj] = j;
            tmp[2 * nj + 1] = order[i];
            break;
          }
      }

      // Restore the temporarily removed square and advance.
      if (tmpsq >= 0) own[tmpsq] = j;
      qhead++;
    }

    if (qhead === qtail) return null; // BFS exhausted with no expansion: fail
  }

  // Build the output dsf: merge each square with a fixed representative of its
  // omino (the highest-indexed square owning it).
  for (let i = 0; i < wh; i++) tmp[own[i]] = i;
  const ret = new Dsf(wh);
  for (let i = 0; i < wh; i++) ret.merge(i, tmp[own[i]]);
  return ret;
}

const MAX_DIVVY_ATTEMPTS = 10000;

/**
 * Partition a `w × h` rectangle into size-`k` connected ominoes. Retries failed
 * attempts (faithful to `divvy_rectangle`'s `do { } while (!ret)`), capped so a
 * divergence fails loudly instead of hanging (playbook §4.6).
 */
export function divvyRectangle(w: number, h: number, k: number, rng: RandomState): Dsf {
  for (let attempt = 0; attempt < MAX_DIVVY_ATTEMPTS; attempt++) {
    const ret = divvyRectangleAttempt(w, h, k, rng);
    if (ret) return ret;
  }
  throw new Error(`divvyRectangle: no partition after ${MAX_DIVVY_ATTEMPTS} attempts`);
}
