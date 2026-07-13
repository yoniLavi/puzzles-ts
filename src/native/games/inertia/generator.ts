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
 * seed yields a different board. That constrains the order the two shuffled
 * lists are *built* in, and nothing else.
 */

import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { findGemCandidates } from "./solver.ts";
import {
  BLANK,
  Board,
  type Cell,
  DIRECTIONS,
  DX,
  DY,
  encodeBoard,
  GEM,
  type InertiaParams,
  MINE,
  STOP,
  WALL,
} from "./state.ts";

/** Where the ball starts. Only a marker while the grid is being shuffled: the
 * square then becomes a `STOP` with the ball standing on it. */
const START = -1;

/** Backstop against a faithful-but-broken port spinning forever. Generation
 * normally succeeds within a handful of attempts, and the threshold relaxes
 * every 50 rejections, so this is unreachable in practice (playbook §4.6). */
const MAX_ATTEMPTS = 100_000;

/** How many rejections before we accept a less evenly-spread board. */
const PATIENCE = 50;

export function newInertiaDesc(p: InertiaParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const area = w * h;
  const gemCount = Math.floor(area / 5);

  // How far a square may be from the nearest place a gem could go before we
  // call the board too sparse. Starts as low as 2; relaxes as we get desperate.
  let maxDistance = 2;
  let rejections = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Fill with the piece types in roughly equal proportion — but leave the
    // gems out, because we don't yet know where they may legally go.
    const cells: (Cell | typeof START)[] = [
      ...Array<Cell>(gemCount).fill(WALL),
      ...Array<Cell>(gemCount).fill(STOP),
      ...Array<Cell>(gemCount).fill(MINE),
      START,
      ...Array<Cell>(area - 3 * gemCount - 1).fill(BLANK),
    ];
    shuffle(cells, rng);

    const startSquare = cells.indexOf(START);
    const board = new Board(
      Uint8Array.from(cells, (cell) => (cell === START ? STOP : cell)),
      w,
      h,
    );

    // Where could a gem go? Give up early if there aren't enough such squares.
    const candidates = findGemCandidates(board, startSquare);
    if (candidates.length < gemCount) continue;

    // This is already a viable level — but possibly one where a big chunk of
    // the board is dead space. Test for that by finding the furthest any square
    // is from the nearest candidate (a purely geometric distance, ignoring
    // walls and long ways round) and rejecting a board whose worst square is
    // too far out.
    if (spread(board, candidates) > maxDistance) {
      if (++rejections === PATIENCE) {
        maxDistance++;
        rejections = 0;
      }
      continue;
    }

    // The reachable squares are plausibly evenly spread. We don't go on to
    // *enforce* that the gems keep them that way — the RNG can be trusted to
    // pick a sensible subset.
    shuffle(candidates, rng);
    for (const square of candidates.slice(0, gemCount)) board.cells[square] = GEM;

    return { desc: encodeBoard(board, startSquare) };
  }

  throw new Error(`inertia: failed to generate a ${w}x${h} grid`);
}

/** The furthest any square is from the nearest gem candidate, counting a
 * diagonal step as one — a breadth-first search seeded from every candidate. */
function spread(board: Board, candidates: readonly number[]): number {
  const distance = new Int32Array(board.area).fill(-1);
  const queue = [...candidates];
  for (const square of candidates) distance[square] = 0;

  let furthest = 0;
  for (let head = 0; head < queue.length; head++) {
    const square = queue[head];
    furthest = Math.max(furthest, distance[square]);

    const x = board.x(square);
    const y = board.y(square);
    for (let d = 0; d < DIRECTIONS; d++) {
      const x2 = x + DX[d];
      const y2 = y + DY[d];
      if (!board.inside(x2, y2)) continue;

      const next = board.square(x2, y2);
      if (distance[next] < 0) {
        distance[next] = distance[square] + 1;
        queue.push(next);
      }
    }
  }

  return furthest;
}
