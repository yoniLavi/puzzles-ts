/**
 * Ascent generator — a backbite Hamiltonian path, then solver-gated clue
 * reduction (upstream `new_game_desc` / `generate_hamiltonian_path` /
 * `ascent_remove_numbers` / `ascent_add_edges`).
 *
 * The whole path is a pure function of the seed: the only RNG surface is
 * `randomUpto` per backbite step, one `shuffle` before removal, and the
 * `matching(..., rs)` draws for the Edges variant. The reduction is gated
 * by the graded solver, so the emitted desc reproduces byte-for-byte and a
 * single differential validates generator + solver + codec (design D4/D7).
 */

import { matching } from "../../engine/latin.ts";
import { type RandomState, randomUpto } from "../../engine/random/index.ts";
import { shuffle } from "../../engine/shuffle.ts";
import { ascentSolve, SolverScratch } from "./solver.ts";
import {
  type AscentMovement,
  type AscentParams,
  type AscentStep,
  ascentGridSize,
  checkCompletion,
  encodeGridDesc,
  isEdgeValid,
  isObstacle,
  MODE_EDGES,
  MODE_HEXAGON,
  MODE_HONEYCOMB,
  movementForMode,
  NUMBER_EMPTY,
  NUMBER_WALL,
  numberEdge,
} from "./state.ts";

const MAX_ATTEMPTS = 1000;

/** Reverse `path[i1..i2]` in place. */
function reversePath(i1: number, i2: number, path: Int32Array): void {
  const ilim = Math.trunc((i2 - i1 + 1) / 2);
  for (let i = 0; i < ilim; i++) {
    const temp = path[i1 + i];
    path[i1 + i] = path[i2 - i];
    path[i2 - i] = temp;
  }
}

function backbiteLeft(
  step: AscentStep,
  n: number,
  path: Int32Array,
  w: number,
  h: number,
  walls: Uint8Array | null,
): number {
  const neighx = (path[0] % w) + step.dx;
  const neighy = Math.trunc(path[0] / w) + step.dy;
  if (neighx < 0 || neighx >= w || neighy < 0 || neighy >= h) return n;

  const neigh = neighy * w + neighx;
  if (walls?.[neigh]) return n;

  for (let i = 1; i < n; i++) {
    if (neigh === path[i]) {
      reversePath(0, i - 1, path);
      return n;
    }
  }

  reversePath(0, n - 1, path);
  path[n] = neigh;
  return n + 1;
}

function backbiteRight(
  step: AscentStep,
  n: number,
  path: Int32Array,
  w: number,
  h: number,
  walls: Uint8Array | null,
): number {
  const neighx = (path[n - 1] % w) + step.dx;
  const neighy = Math.trunc(path[n - 1] / w) + step.dy;
  if (neighx < 0 || neighx >= w || neighy < 0 || neighy >= h) return n;

  const neigh = neighy * w + neighx;
  if (walls?.[neigh]) return n;

  for (let i = n - 2; i >= 0; i--) {
    if (neigh === path[i]) {
      reversePath(i + 1, n - 1, path);
      return n;
    }
  }

  path[n] = neigh;
  return n + 1;
}

function backbite(
  step: AscentStep,
  n: number,
  path: Int32Array,
  w: number,
  h: number,
  rs: RandomState,
  walls: Uint8Array | null,
): number {
  return randomUpto(rs, 2)
    ? backbiteLeft(step, n, path, w, h, walls)
    : backbiteRight(step, n, path, w, h, walls);
}

/** Build a random Hamiltonian path filling every non-wall cell, or `null`
 * if the backbite walk stalls for `MAX_ATTEMPTS`. */
function generateHamiltonianPath(
  w: number,
  h: number,
  rs: RandomState,
  params: AscentParams,
): Int16Array | null {
  const path = new Int32Array(w * h);
  let walls: Uint8Array | null = null;
  let wallcount = 0;
  const movement: AscentMovement = movementForMode(params.mode);

  if (params.mode === MODE_HEXAGON) {
    const center = Math.trunc(h / 2);
    walls = new Uint8Array(w * h);
    for (let j1 = 1; j1 <= center; j1++) {
      for (let j2 = 0; j2 < j1; j2++) {
        const i = (center - j1) * w + j2;
        walls[i] = 1;
        walls[w * h - (i + 1)] = 1;
        wallcount += 2;
      }
    }
  }
  if (params.mode === MODE_HONEYCOMB) {
    walls = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < Math.trunc(y / 2); x++) {
        walls[y * w + (w - x - 1)] = 1;
        wallcount++;
      }
      const extra = (h | y) & 1 ? 0 : 1;
      for (let x = 0; x + extra < Math.trunc((h - y) / 2); x++) {
        walls[y * w + x] = 1;
        wallcount++;
      }
    }
  }
  if (params.mode === MODE_EDGES) {
    walls = new Uint8Array(w * h);
    for (let i = 0; i < w; i++) {
      walls[i] = 1;
      walls[i + w * (h - 1)] = 1;
      wallcount += 2;
    }
    for (let i = 1; i < h - 1; i++) {
      walls[w * i] = 1;
      walls[w * i + (w - 1)] = 1;
      wallcount += 2;
    }
  }

  /* Find a starting position (never on a wall). */
  let start: number;
  do {
    start = randomUpto(rs, w * h);
  } while (walls?.[start]);
  path[0] = start;

  let n = 1;
  let attempts = 0;
  while (n + wallcount < w * h && attempts < MAX_ATTEMPTS) {
    const step = movement.dirs[randomUpto(rs, movement.dircount)];
    const nn = backbite(step, n, path, w, h, rs, walls);
    if (n === nn) attempts++;
    else attempts = 0;
    n = nn;
  }

  if (n + wallcount === w * h) {
    const ret = new Int16Array(w * h).fill(NUMBER_WALL);
    for (let i = 0; i < n; i++) ret[path[i]] = i;
    return ret;
  }

  return null;
}

/** Randomly move grid numbers out to edge arrows via a maximal bipartite
 * matching, accepting only a graded-solvable result (upstream
 * `ascent_add_edges`). Mutates `grid`; returns whether it succeeded. */
function ascentAddEdges(
  sc: SolverScratch,
  grid: Int16Array,
  params: AscentParams,
  rs: RandomState,
): boolean {
  const w = sc.w;
  const h = sc.h;
  const aw = w - 2;
  const ah = h - 2;

  const adjlists: number[][] = [];
  const adjsizes: number[] = [];
  for (let i = 0; i < aw * ah; i++) {
    const x = (i % aw) + 1;
    const y = Math.trunc(i / aw) + 1;

    /* Keep the starting position off the edge when "always show ends" is on. */
    if (!params.removeends && grid[y * w + x] === 0) {
      adjlists.push([]);
      adjsizes.push(0);
      continue;
    }

    const list: number[] = [];
    for (let j = 0; j < w * h; j++) {
      const x2 = j % w;
      const y2 = Math.trunc(j / w);
      if (
        (x2 === 0 || x2 === w - 1 || y2 === 0 || y2 === h - 1) &&
        isEdgeValid(j, y * w + x, w, h)
      ) {
        list.push(j);
      }
    }
    adjlists.push(list);
    adjsizes.push(list.length);
  }

  let attempts = 0;
  let match: Int32Array = new Int32Array(aw * ah).fill(-1);
  while (attempts < MAX_ATTEMPTS) {
    match = matching(aw * ah, w * h, adjlists, adjsizes, rs);

    sc.grid.set(grid);
    for (let i = 0; i < aw * ah; i++) {
      if (match[i] === -1) continue;
      const x = (i % aw) + 1;
      const y = Math.trunc(i / aw) + 1;
      sc.grid[match[i]] = numberEdge(grid[y * w + x]);
      sc.grid[y * w + x] = NUMBER_EMPTY;
    }

    /* Solve in place (puzzle === sc.grid, so no copy). */
    ascentSolve(sc.grid, params.diff, sc);
    if (checkCompletion(sc.grid, w, h, params.mode)) break;

    attempts++;
  }

  grid.set(sc.grid);
  for (let i = 0; i < aw * ah; i++) {
    if (match[i] === -1) continue;
    const x = (i % aw) + 1;
    const y = Math.trunc(i / aw) + 1;
    grid[y * w + x] = NUMBER_EMPTY;
  }

  return attempts < MAX_ATTEMPTS;
}

/** Blank as many clues as the graded solver still permits (upstream
 * `ascent_remove_numbers`). Mutates `grid`; always succeeds. */
function ascentRemoveNumbers(
  sc: SolverScratch,
  grid: Int16Array,
  params: AscentParams,
  rs: RandomState,
): boolean {
  const w = sc.w;
  const h = sc.h;
  const spaces: number[] = [];
  for (let j = 0; j < w * h; j++) spaces.push(j);

  shuffle(spaces, rs);
  for (let j = 0; j < w * h; j++) {
    const i1 = spaces[j];
    const i2 = w * h - (i1 + 1);
    const temp1 = grid[i1];
    const temp2 = grid[i2];
    if (temp1 < 0) continue;
    if (params.symmetrical && temp2 < 0) continue;
    if (!params.removeends && (temp1 === 0 || temp1 === sc.end)) continue;
    if (!params.removeends && params.symmetrical && (temp2 === 0 || temp2 === sc.end))
      continue;
    grid[i1] = NUMBER_EMPTY;
    if (params.symmetrical) grid[i2] = NUMBER_EMPTY;

    ascentSolve(grid, params.diff, sc);

    if (!checkCompletion(sc.grid, w, h, params.mode)) {
      if (params.symmetrical) grid[i2] = temp2;
      grid[i1] = temp1;
    }
  }

  return true;
}

/** Generate a fresh puzzle description for `params` (upstream `new_game_desc`). */
export function newAscentDesc(
  params: AscentParams,
  rng: RandomState,
): { desc: string } {
  const { w, h } = ascentGridSize(params);
  const sc = new SolverScratch(w, h, params.mode, w * h - 1);
  let grid: Int16Array | null = null;
  let success = false;

  do {
    sc.end = w * h - 1;

    grid = null;
    while (!grid) {
      grid = generateHamiltonianPath(w, h, rng, params);
    }

    for (let i = 0; i < w * h; i++) {
      if (isObstacle(grid[i])) sc.end--;
    }

    success =
      params.mode === MODE_EDGES
        ? ascentAddEdges(sc, grid, params, rng)
        : ascentRemoveNumbers(sc, grid, params, rng);
  } while (!success);

  return { desc: encodeGridDesc(grid, w * h) };
}
