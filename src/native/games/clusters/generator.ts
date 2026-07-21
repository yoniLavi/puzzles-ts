/**
 * Clusters generator — port of `clusters_generate` / `new_game_desc` in
 * `puzzles/unreleased/clusters.c`.
 *
 * This is the byte-match surface (see clusters-differential.test.ts): the only
 * randomness is one `randomUpto(rs, 2)` per cell, and the solver is
 * deterministic, so the emitted desc is a pure function of the seed and
 * reproduces the C byte-for-byte. The scan orders, the flip-and-restart
 * `break`, and the `force`-every-100 cadence are transcribed verbatim — each
 * decides the outcome.
 */
import { type RandomState, randomUpto } from "../../random/index.ts";
import { type ClustersStatus, COMPLETE, solveGame } from "./solver.ts";
import {
  type ClustersParams,
  COLMASK,
  encodeDesc,
  F_COLOR_0,
  F_COLOR_1,
  F_SINGLE,
} from "./state.ts";

const DX = [-1, 1, 0, 0];
const DY = [0, 0, -1, 1];

/** Count same-colour orthogonal neighbours of cell `(x,y)` for colour `col`. */
function sameNeighbours(
  grid: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  col: number,
): number {
  let count = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    if ((grid[ny * w + nx] & COLMASK) === col) count++;
  }
  return count;
}

/**
 * One generation attempt (upstream `clusters_generate`). Fills the grid with a
 * candidate puzzle in place and returns the solver verdict the caller gates on:
 *
 *  1. Two-colour every cell at random (`force`, or only the still-blank ones).
 *  2. Repeatedly flip the first cell with **zero** same-colour neighbours,
 *     rescanning from the top after each flip, until none remains.
 *  3. Reduce to clues: a cell with exactly one same-colour neighbour becomes a
 *     dot (`F_SINGLE`); every other cell is cleared.
 *  4. Prune adjacent equal dot pairs (two adjacent identical dots are mutually
 *     derivable): in scan order, clear a dot and its left/upper twin.
 *  5. Gate: solve the resulting puzzle at difficulty 1.
 */
function clustersGenerate(
  grid: Uint8Array,
  w: number,
  h: number,
  rng: RandomState,
  force: boolean,
): ClustersStatus {
  const s = w * h;
  const counts = new Int32Array(s);

  // 1. Random two-colour fill. `randomUpto(rs, 2) ? F_COLOR_0 : F_COLOR_1` —
  //    1 → red, 0 → blue (the whole RNG draw the desc depends on).
  for (let i = 0; i < s; i++) {
    if (force || !grid[i]) grid[i] = randomUpto(rng, 2) ? F_COLOR_0 : F_COLOR_1;
  }

  // 2. Flip isolated cells until none remain, restarting the scan after each
  //    flip (the `break` is load-bearing for byte-match). The final pass, which
  //    finds nothing to flip, leaves `counts` holding the settled neighbour
  //    counts step 3 reads.
  let reset = true;
  while (reset) {
    reset = false;
    for (let i = 0; i < s; i++) {
      const x = i % w;
      const y = (i - x) / w;
      counts[i] = sameNeighbours(grid, w, h, x, y, grid[i] & COLMASK);
    }
    for (let i = 0; i < s; i++) {
      if (counts[i] === 0) {
        grid[i] ^= COLMASK; // swap this cell's colour
        reset = true;
        break;
      }
    }
  }

  // 3. Cells with exactly one same-colour neighbour become dot clues; clear all
  //    others.
  for (let i = 0; i < s; i++) {
    if (counts[i] === 1) grid[i] |= F_SINGLE;
    else grid[i] = 0;
  }

  // 4. Prune adjacent identical dot pairs.
  for (let i = 0; i < s; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && grid[i] & F_SINGLE && grid[i] === grid[i - 1]) {
      grid[i] = 0;
      grid[i - 1] = 0;
    } else if (y > 0 && grid[i] & F_SINGLE && grid[i] === grid[i - w]) {
      grid[i] = 0;
      grid[i - w] = 0;
    }
  }

  return solveGame(grid, w, h, 1);
}

const MAX_ATTEMPTS = 100;

export function newClustersDesc(p: ClustersParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const grid = new Uint8Array(w * h);
  let attempts = 0;
  let force = false;
  while (clustersGenerate(grid, w, h, rng, force) !== COMPLETE) {
    attempts++;
    force = attempts % MAX_ATTEMPTS === 0;
  }
  return { desc: encodeDesc(grid, w, h) };
}
