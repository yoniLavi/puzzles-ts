/**
 * Sokoban level generation (upstream `sokoban_generate` + `new_game_desc`).
 *
 * A level is built by playing the game *backwards*: start from a walled ring
 * of `INITIAL` interior, drop the player somewhere, then repeatedly make legal
 * inverse moves — *pulling* a barrel after the player (rather than pushing it),
 * inventing new barrels-on-targets out of untouched `INITIAL` squares, and
 * carving corridors through `INITIAL` as needed. Because the level is
 * constructed by reversing a real solution, every generated level is solvable
 * by construction — which is exactly why there is no solver to gate generation
 * (design D1 A). Leftover `INITIAL` squares become walls in the desc.
 *
 * This is a byte-match-faithful port: the reachability search is upstream's
 * hand-rolled binary min-heap (keyed on how many `INITIAL` squares a route
 * carves through), and every `randomUpto` draw happens in the same order as C,
 * so the generated desc reproduces the C engine's byte-for-byte over the
 * bit-identical `random.ts`. The differential test is the whole assurance here
 * (there is no solver to otherwise exercise the generation path).
 */

import { type RandomState, randomUpto } from "../../random/index.ts";
import {
  BARREL,
  BARRELTARGET,
  DEEP_PIT,
  INITIAL,
  PLAYER,
  PLAYERTARGET,
  type SokobanParams,
  SPACE,
  TARGET,
  WALL,
} from "./state.ts";

// DX/DY over the four orthogonal directions (upstream DX/DY macros):
// 0 → (-1,0), 1 → (0,-1), 2 → (+1,0), 3 → (0,+1).
const DX = (d: number): number => (d === 0 ? -1 : d === 2 ? 1 : 0);
const DY = (d: number): number => (d === 1 ? -1 : d === 3 ? 1 : 0);

const NEW_BARREL_SCORE = 10;
const NEW_SPACE_SCORE = 3;

interface Pull {
  ox: number;
  oy: number;
  nx: number;
  ny: number;
  score: number;
}

/**
 * Fill `grid` (length `w*h`) with a generated Sokoban level. Mutates `grid`
 * in place, exactly as the C does. `moves` bounds the number of inverse moves
 * attempted; `nethack` toggles the (unused-by-`newDesc`) NetHack variant.
 */
export function sokobanGenerate(
  w: number,
  h: number,
  grid: Uint8Array,
  moves: number,
  nethack: boolean,
  rs: RandomState,
): void {
  const dist = new Int32Array(w * h);
  const prev = new Int32Array(w * h);
  const heap = new Int32Array(w * h);

  // Initial grid: a solid wall ring, INITIAL everywhere inside.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      grid[y * w + x] =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ? WALL : INITIAL;
  if (nethack) grid[1] = DEEP_PIT;

  // Place the player at a random interior square.
  const i = randomUpto(rs, (w - 2) * (h - 2));
  let px = 1 + (i % (w - 2));
  let py = 1 + Math.floor(i / (w - 2));
  grid[py * w + px] = SPACE;

  // Each iteration aims to make one real barrel-pull, plus whatever free
  // moves are needed to get into position for it.
  while (moves-- >= 0) {
    // Enumerate every viable barrel-pull (two directions of the same barrel
    // count as different). A pull can also *create* a barrel from an INITIAL.
    // Each pull is scored by how much violence it does to INITIAL squares.
    const pulls: Pull[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let d = 0; d < 4; d++) {
          const dx = DX(d);
          const dy = DY(d);
          const nx = x + dx;
          const ny = y + dy;
          const npx = nx + dx;
          const npy = ny + dy;
          let score = 0;

          // The player ends at (nx,ny) having stepped from (npx,npy), pulling
          // a barrel at (x,y) to (nx,ny). Checking npx,npy in bounds suffices.
          if (npx < 0 || npx >= w || npy < 0 || npy >= h) continue;

          // (x,y) must be a barrel, or convertible into one.
          switch (grid[y * w + x]) {
            case BARREL:
            case BARRELTARGET:
              break;
            case INITIAL:
              if (nethack) continue;
              score += NEW_BARREL_SCORE;
              break;
            case DEEP_PIT:
              if (!nethack) continue;
              break;
            default:
              continue;
          }

          // (nx,ny) must be a space, or convertible into one.
          switch (grid[ny * w + nx]) {
            case SPACE:
            case TARGET:
              break;
            case INITIAL:
              score += NEW_SPACE_SCORE;
              break;
            default:
              continue;
          }

          // (npx,npy) likewise.
          switch (grid[npy * w + npx]) {
            case SPACE:
            case TARGET:
              break;
            case INITIAL:
              score += NEW_SPACE_SCORE;
              break;
            default:
              continue;
          }

          pulls.push({ ox: x, oy: y, nx, ny, score });
        }

    // No pulls available at all: give up.
    if (pulls.length === 0) break;

    // BFS from the current player position to find every square the player can
    // reach, giving a *positive* distance only to squares reached by carving
    // through INITIAL — hence a proper priority queue, not a plain FIFO.
    for (let k = 0; k < w * h; k++) {
      dist[k] = -1;
      prev[k] = -1;
    }
    heap[0] = py * w + px;
    let heapsize = 1;
    dist[py * w + px] = 0;

    while (heapsize > 0) {
      // Pull the smallest element (at position 0); move the last element into
      // its place and sift it down.
      const top = heap[0];
      const y = Math.floor(top / w);
      const x = top % w;

      heapsize--;
      heap[0] = heap[heapsize];
      let hi = 0;
      while (true) {
        const lc = 2 * hi + 1;
        const rc = 2 * hi + 2;
        if (lc >= heapsize) break; // hit bottom
        if (rc >= heapsize) {
          // Only one child to check.
          if (dist[heap[hi]] > dist[heap[lc]]) {
            const t = heap[hi];
            heap[hi] = heap[lc];
            heap[lc] = t;
          }
          break;
        }
        if (dist[heap[hi]] > dist[heap[lc]] || dist[heap[hi]] > dist[heap[rc]]) {
          // Swap with the child that would want to be the parent.
          if (dist[heap[lc]] > dist[heap[rc]]) {
            const t = heap[hi];
            heap[hi] = heap[rc];
            heap[rc] = t;
            hi = rc;
          } else {
            const t = heap[hi];
            heap[hi] = heap[lc];
            heap[lc] = t;
            hi = lc;
          }
        } else {
          break; // this element is in the right place
        }
      }

      // Expand (x,y) in all four directions.
      for (let d = 0; d < 4; d++) {
        const nx = x + DX(d);
        const ny = y + DY(d);
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const g = grid[ny * w + nx];
        if (g !== SPACE && g !== TARGET && g !== INITIAL) continue;
        if (dist[ny * w + nx] === -1) {
          dist[ny * w + nx] = dist[y * w + x] + (g === INITIAL ? 1 : 0);
          prev[ny * w + nx] = y * w + x;
          // Insert at the end of the heap and sift up.
          let ii = heapsize;
          heap[heapsize++] = ny * w + nx;
          while (ii > 0) {
            const p = (ii - 1) >> 1;
            if (dist[heap[p]] > dist[heap[ii]]) {
              const t = heap[p];
              heap[p] = heap[ii];
              heap[ii] = t;
              ii = p;
            } else break;
          }
        }
      }
    }

    // Re-score each pull by how hard its starting point is to reach, dropping
    // any whose start is genuinely unreachable.
    const feasible: Pull[] = [];
    for (const pull of pulls) {
      const x = pull.nx;
      const y = pull.ny;
      if (dist[y * w + x] < 0) continue; // unreachable
      // A pull whose start (nx,ny) is INITIAL was counted both as "can become a
      // barrel" and "can become a space to walk to"; it can't be both, and if
      // (ox,oy) lies on the route it must be exactly one step from the end.
      if (prev[y * w + x] === pull.oy * w + pull.ox) continue;
      feasible.push({ ...pull, score: pull.score + dist[y * w + x] * NEW_SPACE_SCORE });
    }
    if (feasible.length === 0) break;

    // Choose a pull. (Upstream leaves the score unused here — "very simple
    // indeed" — and just picks uniformly. Reproduce that draw exactly.)
    const chosen = feasible[randomUpto(rs, feasible.length)];

    // Carve a path to the pull site, then apply the pull.
    let x = chosen.nx;
    let y = chosen.ny;
    while (prev[y * w + x] >= 0) {
      if (grid[y * w + x] === INITIAL) grid[y * w + x] = SPACE;
      const p = prev[y * w + x];
      y = Math.floor(p / w);
      x = p % w;
    }
    px = 2 * chosen.nx - chosen.ox;
    py = 2 * chosen.ny - chosen.oy;
    if (grid[py * w + px] === INITIAL) grid[py * w + px] = SPACE;
    grid[chosen.ny * w + chosen.nx] =
      grid[chosen.ny * w + chosen.nx] === TARGET ? BARRELTARGET : BARREL;
    if (grid[chosen.oy * w + chosen.ox] === BARREL)
      grid[chosen.oy * w + chosen.ox] = SPACE;
    else if (grid[chosen.oy * w + chosen.ox] !== DEEP_PIT)
      grid[chosen.oy * w + chosen.ox] = TARGET;
  }

  // Finalise the player's square.
  grid[py * w + px] = grid[py * w + px] === TARGET ? PLAYERTARGET : PLAYER;
}

// --- run-length desc encoding (upstream `new_game_desc`) --------------

/** Map an internal grid cell to its desc character. Leftover INITIAL squares
 * (never touched during generation) become walls. */
function descChar(v: number): string {
  switch (v) {
    case INITIAL:
      return "w";
    case SPACE:
      return "s";
    case WALL:
      return "w";
    case TARGET:
      return "t";
    case BARREL:
      return "b";
    case BARRELTARGET:
      return "f";
    case DEEP_PIT:
      return "d";
    case PLAYER:
      return "u";
    case PLAYERTARGET:
      return "v";
    default:
      throw new Error(`sokoban: ungeneratable cell ${v}`);
  }
}

export function newSokobanDesc(p: SokobanParams, rng: RandomState): { desc: string } {
  const { w, h } = p;
  const grid = new Uint8Array(w * h);
  sokobanGenerate(w, h, grid, w * h, false, rng);

  // Run-length encode: a char, then a decimal count when the run repeats.
  let desc = "";
  let i = 0;
  while (i < w * h) {
    const ch = descChar(grid[i]);
    let n = 1;
    while (i + n < w * h && descChar(grid[i + n]) === ch) n++;
    desc += n > 1 ? `${ch}${n}` : ch;
    i += n;
  }
  return { desc };
}
