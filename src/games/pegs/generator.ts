/**
 * Pegs' board generator.
 *
 * A Random board is built backwards: start from the solved position (one peg)
 * and undo jumps, choosing among the legal reverse moves by a cost that
 * prefers a spread-out board. `genMoves` maintains the candidate set as the
 * grid changes, and `newDesc` runs the whole thing and writes the desc.
 */

import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { SortedMultiset } from "../../engine/sorted-multiset.ts";
import {
  GRID_HOLE,
  GRID_OBST,
  GRID_PEG,
  type PegsParams,
  TYPE_CROSS,
  TYPE_OCTAGON,
  TYPE_RANDOM,
} from "./state.ts";

// --- generator (Random boards) --------------------------------------

interface GenMove {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** 0, 1, or 2: how many OBST cells must become HOLE to play this move. */
  cost: number;
}

function genMoveCmpByMove(a: GenMove, b: GenMove): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  if (a.dy !== b.dy) return a.dy - b.dy;
  if (a.dx !== b.dx) return a.dx - b.dx;
  return 0;
}

function genMoveCmpByCost(a: GenMove, b: GenMove): number {
  if (a.cost !== b.cost) return a.cost - b.cost;
  return genMoveCmpByMove(a, b);
}

/**
 * Re-evaluate the twelve moves that can include (x,y) and update
 * the two sorted indexes. Mirrors C's `update_moves`.
 *
 * The C code uses `find234(byMove, &move, NULL)` to find an existing
 * move by position (since byMove's comparator ignores cost), then
 * checks if the cost changed. If so, it removes the old version from
 * both trees using the actual element (not the probe).
 *
 * We replicate this: first delete from byMove (position-only
 * comparator), then if we found the old element, delete *it* from
 * byCost (using the old element's actual cost for the comparator).
 * Then re-add if the move is still valid.
 */
function updateMoves(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  byMove: SortedMultiset<GenMove>,
  byCost: SortedMultiset<GenMove>,
): void {
  const DIRS: [number, number][] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  for (const [ddx, ddy] of DIRS) {
    for (let pos = 0; pos < 3; pos++) {
      const mx = x - pos * ddx;
      const my = y - pos * ddy;
      if (mx < 0 || mx >= w || my < 0 || my >= h) continue;
      const ex = mx + 2 * ddx;
      const ey = my + 2 * ddy;
      if (ex < 0 || ex >= w || ey < 0 || ey >= h) continue;

      const v1 = grid[my * w + mx];
      const v2 = grid[(my + ddy) * w + (mx + ddx)];
      const v3 = grid[ey * w + ex];

      const newCost = (v2 === GRID_OBST ? 1 : 0) + (v3 === GRID_OBST ? 1 : 0);

      // Probe for the existing move by position (cost doesn't matter
      // for the byMove comparator).
      const positionProbe: GenMove = {
        x: mx,
        y: my,
        dx: ddx,
        dy: ddy,
        cost: 0, // ignored by genMoveCmpByMove
      };

      // Remove from byMove (finds by position).
      byMove.delete(positionProbe);

      // Remove from byCost using the position probe. Since byCost
      // compares cost first, we need to try all possible costs.
      // But we can be smarter: just try deleting with the new cost.
      // If the old element had a different cost, this won't find it.
      // So we also need to try the other cost values.
      // Actually, the simplest correct approach: delete from byCost
      // for each possible cost (0, 1, 2). Only one will match.
      for (let c = 0; c <= 2; c++) {
        byCost.delete({ x: mx, y: my, dx: ddx, dy: ddy, cost: c });
      }

      if (v1 === GRID_PEG && v2 !== GRID_PEG && v3 !== GRID_PEG) {
        // Move is valid. Add fresh copies to both trees.
        const fresh: GenMove = { x: mx, y: my, dx: ddx, dy: ddy, cost: newCost };
        byMove.add({ ...fresh });
        byCost.add({ ...fresh });
      }
    }
  }
}

/**
 * Build a random board by reverse-moves. Mirrors C's `pegs_genmoves`.
 * The grid is mutated in place.
 */
function genMoves(grid: Uint8Array, w: number, h: number, rng: RandomState): void {
  const byMove = new SortedMultiset<GenMove>(genMoveCmpByMove);
  const byCost = new SortedMultiset<GenMove>(genMoveCmpByCost);

  // Seed the move trees from all pegs on the board.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === GRID_PEG) {
        updateMoves(grid, w, h, x, y, byMove, byCost);
      }
    }
  }

  let nMoves = 0;

  while (true) {
    // Find the cheapest available moves.
    const maxCost = nMoves < (w * h) / 2 ? 2 : 1;
    let limit = -1;
    let move: GenMove | undefined;

    for (let cost = 0; cost <= maxCost; cost++) {
      const probe: GenMove = { x: 0, y: h + 1, dx: 0, dy: 0, cost };
      limit = byCost.lastIndexLessThan(probe);
      if (limit >= 0) {
        move = byCost.get(limit);
        break;
      }
    }

    if (!move) break;

    // Pick a random move among those with the same cost.
    // `limit` is the index of the last element with cost <= move.cost.
    // We need the range of elements with cost == move.cost.
    const costProbe: GenMove = { x: 0, y: -1, dx: 0, dy: 0, cost: move.cost };
    const firstIdx = byCost.lastIndexLessThan(costProbe) + 1;
    const rangeSize = limit - firstIdx + 1;
    const pickIdx = firstIdx + randomUpto(rng, rangeSize);
    const picked = byCost.get(pickIdx);

    // Apply the reverse move: source becomes HOLE, middle becomes PEG, end becomes PEG.
    grid[picked.y * w + picked.x] = GRID_HOLE;
    grid[(picked.y + picked.dy) * w + (picked.x + picked.dx)] = GRID_PEG;
    grid[(picked.y + 2 * picked.dy) * w + (picked.x + 2 * picked.dx)] = GRID_PEG;

    // Re-evaluate moves around the three affected cells.
    for (let i = 0; i <= 2; i++) {
      const tx = picked.x + i * picked.dx;
      const ty = picked.y + i * picked.dy;
      updateMoves(grid, w, h, tx, ty, byMove, byCost);
    }

    nMoves++;
  }
}

/**
 * Generate a random board, retrying until it touches all four edges.
 * Mirrors C's `pegs_generate`.
 */
function generate(grid: Uint8Array, w: number, h: number, rng: RandomState): void {
  while (true) {
    grid.fill(GRID_OBST);
    grid[Math.floor(h / 2) * w + Math.floor(w / 2)] = GRID_PEG;
    genMoves(grid, w, h, rng);

    // Check that the board touches all four edges.
    let extremes = 0;
    for (let y = 0; y < h; y++) {
      if (grid[y * w] !== GRID_OBST) extremes |= 1;
      if (grid[y * w + w - 1] !== GRID_OBST) extremes |= 2;
    }
    for (let x = 0; x < w; x++) {
      if (grid[x] !== GRID_OBST) extremes |= 4;
      if (grid[(h - 1) * w + x] !== GRID_OBST) extremes |= 8;
    }

    if (extremes === 15) break;
  }
}

// --- newDesc ---------------------------------------------------------

export function newDesc(p: PegsParams, rng: RandomState): { desc: string } {
  const { w, h, type } = p;
  const grid = new Uint8Array(w * h);

  if (type === TYPE_RANDOM) {
    generate(grid, w, h, rng);
  } else {
    // Cross or Octagon layout.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = Math.abs(x - Math.floor(w / 2));
        const cy = Math.abs(y - Math.floor(h / 2));
        if (type === TYPE_CROSS) {
          if (cx === 0 && cy === 0) grid[y * w + x] = GRID_HOLE;
          else if (cx > 1 && cy > 1) grid[y * w + x] = GRID_OBST;
          else grid[y * w + x] = GRID_PEG;
        } else {
          // TYPE_OCTAGON
          if (cx + cy > 1 + Math.floor(Math.max(w, h) / 2)) {
            grid[y * w + x] = GRID_OBST;
          } else {
            grid[y * w + x] = GRID_PEG;
          }
        }
      }
    }

    // Octagon: the center hole is insoluble (parity proof in C comments).
    // Pick a random solvable starting hole from one of three equivalence classes.
    if (type === TYPE_OCTAGON) {
      const cls = randomUpto(rng, 3);
      let dx: number;
      let dy: number;
      if (cls === 0) {
        // Remove a random corner piece.
        dx = randomUpto(rng, 2) * 2 - 1;
        dy = randomUpto(rng, 2) * 2 - 1;
        if (randomUpto(rng, 2)) dy *= 3;
        else dx *= 3;
      } else if (cls === 1) {
        // Remove a random piece two from the center.
        dx = 2 * (randomUpto(rng, 2) * 2 - 1);
        if (randomUpto(rng, 2)) dy = 0;
        else {
          dy = dx;
          dx = 0;
        }
      } else {
        // Remove a random piece one from the center.
        dx = randomUpto(rng, 2) * 2 - 1;
        if (randomUpto(rng, 2)) dy = 0;
        else {
          dy = dx;
          dx = 0;
        }
      }
      grid[(3 + dy) * w + (3 + dx)] = GRID_HOLE;
    }
  }

  // Encode: P=peg, H=hole, O=obstacle.
  let desc = "";
  for (let i = 0; i < w * h; i++) {
    desc += grid[i] === GRID_PEG ? "P" : grid[i] === GRID_HOLE ? "H" : "O";
  }
  return { desc };
}
