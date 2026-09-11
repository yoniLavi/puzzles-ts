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

/** A jump undone: the peg at (x,y) returns to (x+2dx, y+2dy), and the peg it
 * took reappears between. */
interface GenMove {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** 0, 1, or 2: how many obstacle cells the move adds to the board. */
  cost: number;
}

/** Cheapest first, then by position and direction. `genMoves` picks by index
 * into this order, so it decides which board a seed makes. */
function compareMoves(a: GenMove, b: GenMove): number {
  return a.cost - b.cost || a.y - b.y || a.x - b.x || a.dy - b.dy || a.dx - b.dx;
}

const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;

/**
 * Re-evaluate the twelve reverse moves that involve (x,y), so `moves` holds
 * exactly the legal ones, each at its current cost. Upstream's `update_moves`.
 */
function updateMoves(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  moves: SortedMultiset<GenMove>,
): void {
  for (const [dx, dy] of DIRECTIONS) {
    for (let pos = 0; pos < 3; pos++) {
      const mx = x - pos * dx;
      const my = y - pos * dy;
      if (mx < 0 || mx >= w || my < 0 || my >= h) continue;
      const ex = mx + 2 * dx;
      const ey = my + 2 * dy;
      if (ex < 0 || ex >= w || ey < 0 || ey >= h) continue;

      const v1 = grid[my * w + mx];
      const v2 = grid[(my + dy) * w + (mx + dx)];
      const v3 = grid[ey * w + ex];

      // The set orders by cost first, so an entry is found only by its own
      // cost: probe all three to drop a stale one.
      for (let cost = 0; cost <= 2; cost++) {
        moves.delete({ x: mx, y: my, dx, dy, cost });
      }
      if (v1 === GRID_PEG && v2 !== GRID_PEG && v3 !== GRID_PEG) {
        const cost = (v2 === GRID_OBST ? 1 : 0) + (v3 === GRID_OBST ? 1 : 0);
        moves.add({ x: mx, y: my, dx, dy, cost });
      }
    }
  }
}

/** Grow the board in `grid`, in place, by undoing jumps until none is cheap
 * enough. Upstream's `pegs_genmoves`. */
function genMoves(grid: Uint8Array, w: number, h: number, rng: RandomState): void {
  const moves = new SortedMultiset<GenMove>(compareMoves);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === GRID_PEG) updateMoves(grid, w, h, x, y, moves);
    }
  }

  for (let nMoves = 0; ; nMoves++) {
    // The cheapest moves on offer (two-cost ones only in the first w*h/2
    // moves). The set is cheapest first, and the probe sorts after every move
    // of its cost, so moves 0..last are exactly the cheapest class.
    const maxCost = nMoves < (w * h) / 2 ? 2 : 1;
    let last = -1;
    for (let cost = 0; cost <= maxCost && last < 0; cost++) {
      last = moves.lastIndexLessThan({ x: 0, y: h + 1, dx: 0, dy: 0, cost });
    }
    if (last < 0) break;
    const m = moves.get(randomUpto(rng, last + 1));

    // Undo the jump: the source empties, and the two cells beyond it fill.
    grid[m.y * w + m.x] = GRID_HOLE;
    grid[(m.y + m.dy) * w + (m.x + m.dx)] = GRID_PEG;
    grid[(m.y + 2 * m.dy) * w + (m.x + 2 * m.dx)] = GRID_PEG;
    for (let i = 0; i <= 2; i++) {
      updateMoves(grid, w, h, m.x + i * m.dx, m.y + i * m.dy, moves);
    }
  }
}

/**
 * Generate a random board, retrying until it touches all four edges.
 * Upstream's `pegs_generate`.
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
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cx = Math.abs(x - Math.floor(w / 2));
        const cy = Math.abs(y - Math.floor(h / 2));
        const i = y * w + x;
        if (type === TYPE_CROSS) {
          if (cx === 0 && cy === 0) grid[i] = GRID_HOLE;
          else grid[i] = cx > 1 && cy > 1 ? GRID_OBST : GRID_PEG;
        } else {
          grid[i] = cx + cy > 1 + Math.floor(Math.max(w, h) / 2) ? GRID_OBST : GRID_PEG;
        }
      }
    }

    // Octagon: the center hole is insoluble (parity proof in upstream's
    // comments), so start from a hole in one of the three soluble classes.
    if (type === TYPE_OCTAGON) {
      const cls = randomUpto(rng, 3);
      let dx = randomUpto(rng, 2) * 2 - 1;
      let dy = 0;
      if (cls === 0) {
        // A corner piece.
        dy = randomUpto(rng, 2) * 2 - 1;
        if (randomUpto(rng, 2)) dy *= 3;
        else dx *= 3;
      } else {
        // A piece two (class 1) or one (class 2) from the center.
        if (cls === 1) dx *= 2;
        if (!randomUpto(rng, 2)) {
          dy = dx;
          dx = 0;
        }
      }
      grid[(3 + dy) * w + (3 + dx)] = GRID_HOLE;
    }
  }

  // Encode: P=peg, H=hole, O=obstacle.
  let desc = "";
  for (const v of grid) desc += v === GRID_PEG ? "P" : v === GRID_HOLE ? "H" : "O";
  return { desc };
}
