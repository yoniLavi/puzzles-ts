/**
 * Random 2×1 domino tiling of a `w × h` grid — an idiomatic TS port of
 * `domino_layout` (`puzzles/laydomino.c`). Returns an `Int32Array` of length
 * `w·h` where `grid[i]` is the index of the other end of the domino covering
 * cell `i` (or `i` itself for a lone singleton, which happens only when `w·h`
 * is odd).
 *
 * Byte-match critical: the RNG draw order reproduces C exactly — the initial
 * `shuffle` of the `2·w·h − w − h` candidate positions, then the per-BFS-node
 * `shuffle` of a cell's neighbour directions during the chessboard-parity
 * singleton fixup. The shared `shuffle` (engine/shuffle.ts) matches
 * `misc.c shuffle` byte-for-byte, so a faithful port over the bit-identical
 * `random.ts` reproduces the layout for a given seed.
 *
 * Consumers: Magnets (ported); Dominosa (still C — `laydomino.c` stays until
 * its last C consumer ports, like `random.c`).
 */
import type { RandomState } from "../random/index.ts";
import { shuffle } from "./shuffle.ts";

export function dominoLayout(w: number, h: number, rs: RandomState): Int32Array {
  const wh = w * h;
  const grid = new Int32Array(wh);
  // grid2 holds BFS distance / backtrack data; list is the work queue.
  const grid2 = new Int32Array(wh);

  // Every square starts a singleton (points at itself).
  for (let i = 0; i < wh; i++) grid[i] = i;

  // Candidate domino positions: a vertical domino with top at square `i` is
  // encoded `2·i`, a horizontal one with left half at `i` as `2·i + 1`.
  const list: number[] = [];
  for (let j = 0; j < h - 1; j++)
    for (let i = 0; i < w; i++) list.push(2 * (j * w + i));
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w - 1; i++) list.push(2 * (j * w + i) + 1);

  shuffle(list, rs);

  // Greedily place every domino whose two squares are still free.
  for (const code of list) {
    const horiz = code % 2;
    const xy = (code - horiz) / 2;
    const xy2 = xy + (horiz ? 1 : w);
    if (grid[xy] === xy && grid[xy2] === xy2) {
      grid[xy] = xy2;
      grid[xy2] = xy;
    }
  }

  // The remaining singletons come in pairs of opposite chessboard colour; deal
  // with them two at a time by finding a path between two singletons through
  // covered squares and shuffling every domino on it up by one.
  const queue = new Int32Array(wh);
  while (true) {
    let start = -1;
    let nsingleton = 0;
    for (let j = 0; j < wh; j++) {
      if (grid[j] === j) {
        nsingleton++;
        start = j;
      }
    }
    // Even area ⇒ no singletons left; odd area ⇒ exactly one. Either way done.
    if (nsingleton === wh % 2) break;

    grid2.fill(-1);
    grid2[start] = 0;

    let done = 0;
    let todo = 1;
    queue[0] = start;
    let target = -1; // the far singleton this BFS terminates on

    while (done < todo) {
      const i = queue[done++];
      const x = i % w;
      const y = (i - x) / w;
      const d: number[] = [];
      if (x > 0) d.push(i - 1);
      if (x + 1 < w) d.push(i + 1);
      if (y > 0) d.push(i - w);
      if (y + 1 < h) d.push(i + w);
      // Random neighbour order to avoid directional bias.
      shuffle(d, rs);

      let hitSingleton = -1;
      for (const k of d) {
        if (grid[k] === k) {
          // Found the far singleton: record its predecessor and stop.
          grid2[k] = i;
          hitSingleton = k;
          break;
        }
        // Step through the domino on `k`: store the came-from square in
        // grid2[k] and the BFS distance in grid2 at the domino's far end `m`.
        const m = grid[k];
        if (grid2[m] < 0 || grid2[m] > grid2[i] + 1) {
          grid2[m] = grid2[i] + 1;
          grid2[k] = i;
          queue[todo++] = m;
        }
      }
      if (hitSingleton >= 0) {
        target = hitSingleton;
        break;
      }
    }

    // Follow the trail back to the start singleton, re-laying dominoes.
    let i = target;
    while (true) {
      const j = grid2[i];
      const k = grid[j];
      grid[i] = j;
      grid[j] = i;
      if (j === k) break; // reached the other singleton
      i = k;
    }
  }

  return grid;
}
