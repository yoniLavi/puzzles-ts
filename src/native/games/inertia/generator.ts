/**
 * Inertia's board generator (upstream `gengrid`).
 *
 * Shuffle a grid that is one fifth walls, one fifth stops and one fifth mines,
 * with one start square and the rest blank — then ask the solver where a gem
 * could go, and reject the grid if there are too few such squares, or if they
 * are so unevenly spread that a large region of the board would be dead space.
 * Only then are the gems placed, on a random subset of the legal squares.
 *
 * Byte-match-critical: the RNG draws here (one `shuffle` per attempt, plus a
 * second on the attempt that succeeds) must match the C exactly, or the same
 * seed yields a different board.
 */

import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { findGemCandidates } from "./solver.ts";
import {
  BLANK,
  DIRECTIONS,
  DX,
  DY,
  encodeGrid,
  GEM,
  type InertiaParams,
  MINE,
  STOP,
  WALL,
} from "./state.ts";

/** The start square, while the grid is being shuffled. It then becomes a
 * `STOP` with the ball standing on it — upstream keeps a distinct `START`
 * character, but every consumer of it treats it as a stop. */
const START = 5;

/** Backstop against a faithful-but-broken port spinning forever. Generation
 * normally succeeds within a handful of attempts, and the threshold relaxes
 * every 50 rejections, so this is unreachable in practice (playbook §4.6). */
const MAX_ATTEMPTS = 100_000;

export function newInertiaDesc(p: InertiaParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const wh = w * h;
  const fifth = Math.floor(wh / 5);

  // The "reachable squares must be well spread" threshold can safely start as
  // low as 2; we raise it as we get more desperate.
  let maxDistThreshold = 2;
  let tries = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Fill with the piece types in roughly equal proportion — but leave the
    // gems out, because we don't yet know where they may legally go.
    const cells: number[] = [];
    for (let j = 0; j < fifth; j++) cells.push(WALL);
    for (let j = 0; j < fifth; j++) cells.push(STOP);
    for (let j = 0; j < fifth; j++) cells.push(MINE);
    cells.push(START);
    while (cells.length < wh) cells.push(BLANK);
    shuffle(cells, rng);

    const startIndex = cells.indexOf(START);
    const grid = Uint8Array.from(cells);
    grid[startIndex] = STOP;

    // Where could a gem go? Give up early if there aren't enough such squares.
    const { candidates, count } = findGemCandidates(grid, w, h, startIndex);
    if (count < fifth) continue;

    // This is already a viable level — but possibly one where a big chunk of
    // the board is dead space. Test for that by finding the largest distance
    // from any square to the nearest candidate (a purely geometric search,
    // ignoring walls and long ways round) and rejecting a grid whose worst
    // square is too far out.
    if (maxDistanceToCandidate(candidates, w, h) > maxDistThreshold) {
      tries++;
      if (tries === 50) {
        maxDistThreshold++;
        tries = 0;
      }
      continue;
    }

    // The reachable squares are now plausibly evenly spread. We don't go on to
    // *enforce* that the gems keep them that way — the RNG can be trusted to
    // pick a sensible subset.
    const list: number[] = [];
    for (let i = 0; i < wh; i++) if (candidates[i]) list.push(i);
    shuffle(list, rng);
    for (let i = 0; i < fifth; i++) grid[list[i]] = GEM;

    return { desc: encodeGrid(grid, startIndex) };
  }

  throw new Error(`inertia: failed to generate a ${w}x${h} grid`);
}

/** The furthest any square is from the nearest gem candidate, counting a
 * diagonal step as one — a breadth-first search seeded from every candidate. */
function maxDistanceToCandidate(candidates: Uint8Array, w: number, h: number): number {
  const wh = w * h;
  const dist = new Int32Array(wh).fill(-1);
  const list = new Int32Array(wh);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < wh; i++) {
    if (candidates[i]) {
      dist[i] = 0;
      list[tail++] = i;
    }
  }

  let maxDist = 0;
  while (head < tail) {
    const pos = list[head++];
    if (maxDist < dist[pos]) maxDist = dist[pos];

    const x = pos % w;
    const y = Math.floor(pos / w);
    for (let d = 0; d < DIRECTIONS; d++) {
      const x2 = x + DX[d];
      const y2 = y + DY[d];
      if (x2 < 0 || x2 >= w || y2 < 0 || y2 >= h) continue;
      const p2 = y2 * w + x2;
      if (dist[p2] < 0) {
        dist[p2] = dist[pos] + 1;
        list[tail++] = p2;
      }
    }
  }

  return maxDist;
}
