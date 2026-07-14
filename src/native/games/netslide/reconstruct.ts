/**
 * Recovering the finished grid from the board alone.
 *
 * Netslide has no solver, so `solve` and `hint` both plan against the
 * generator's `aux` — the unshuffled grid, saved when the board was made. A game
 * that arrives as a **descriptive id** (`3x3:52h9hbd4h4v34`, the kind you get
 * from a shared link or a bookmark) carries no `aux`, and both used to give up
 * with "Solution not known for this puzzle". That is a perfectly ordinary way to
 * play a puzzle, so giving up is not good enough.
 *
 * The finished grid *is* recoverable, because the board constrains it savagely:
 *
 * - **The tiles are the same tiles.** A slide only ever permutes them, so the
 *   finished grid uses exactly this multiset of wire masks.
 * - **The centre tile has not moved.** Neither the centre row nor the centre
 *   column can be slid, so whatever sits in the middle sits there in the
 *   solution too.
 * - **Wires must meet.** A tile's wire pointing right must be answered by its
 *   neighbour's wire pointing left — a dangling end would leave that neighbour
 *   unpowered — and no wire may cross a barrier.
 * - **The network is a tree.** It has to connect all `n` tiles, and the tiles
 *   between them carry exactly `n − 1` edges' worth of wire, so there is no slack
 *   for a loop. Any edge that closes one is therefore illegal.
 *
 * Every neighbour already placed *determines* one of a tile's wires, so filling
 * the grid most-hemmed-in cell first leaves very little to guess at, and the tree
 * rule prunes what is left. Under a millisecond on most boards; ~30 ms on the
 * worst 5×5.
 *
 * One property worth stating, because a great deal rests on it: the answer
 * depends only on the **tile multiset, the barriers and the centre tile**, and a
 * slide changes none of those. So the grid recovered here is the *same grid for
 * the whole game*, however the player scrambles the board — which is exactly the
 * stability a recomputed hint needs, obtained by construction rather than
 * defended. (It is also why the enumeration order must not depend on the current
 * board: picking, say, "the finished grid nearest to where the tiles are now"
 * would hand back the instability.)
 */

import { Dsf } from "../../engine/dsf.ts";
import {
  D,
  L,
  type NetslideState,
  offset,
  opposite,
  R,
  U,
  wireCount,
} from "./state.ts";

/** The four wire directions, in a fixed order so the search is deterministic. */
const DIRS = [R, U, L, D] as const;

/** How many distinct finished grids to look for before giving up counting. The
 * hint only needs one; the cap exists so a pathological board cannot make the
 * enumeration run away. */
const MAX_SOLUTIONS = 64;

/**
 * Every finished grid this board could be hiding, up to `limit`.
 *
 * Exported for the tests, which use it to check the reconstruction really does
 * recover the grid the generator drew, and to measure how often a board has more
 * than one answer at all.
 */
export function findSolutions(
  s: NetslideState,
  limit = MAX_SOLUTIONS,
  accept: (grid: Uint8Array) => boolean = () => true,
): Uint8Array[] {
  const { w, h, cx, cy, tiles, barriers } = s;
  const n = w * h;
  const centre = cy * w + cx;

  // The tiles we have to place, counted by mask. The centre one is spoken for.
  const available = new Int32Array(16);
  for (let cell = 0; cell < n; cell++) available[tiles[cell]]++;
  available[tiles[centre]]--;

  const grid = new Uint8Array(n);
  grid[centre] = tiles[centre];

  const solutions: Uint8Array[] = [];
  const trees = new Dsf(n);

  /** The wire bits a tile in `cell` is *forced* to have, and the ones it is
   * forbidden. Read off the neighbours already placed and the barriers. */
  const constraints = (cell: number, placed: Uint8Array) => {
    const x = cell % w;
    const y = Math.floor(cell / w);
    let required = 0;
    let forbidden = 0;

    for (const dir of DIRS) {
      // A wire may never cross a barrier. (Border walls are barriers too, so a
      // non-wrapping grid's edges are handled here without a special case.)
      if (barriers[cell] & dir) {
        forbidden |= dir;
        continue;
      }
      const nb = offset(x, y, dir, w, h);
      const other = nb.y * w + nb.x;
      if (!placed[other]) continue; // not decided yet — this wire is still free
      // The neighbour has spoken: our wire must answer its wire, or its absence.
      if (grid[other] & opposite(dir)) required |= dir;
      else forbidden |= dir;
    }
    return { required, forbidden };
  };

  const placed = new Uint8Array(n);
  placed[centre] = 1;

  /**
   * Which cell to decide next: the one hemmed in by the most neighbours already
   * placed, since every placed neighbour *forces* one of its wires. Ties go to
   * the lowest cell index.
   *
   * Filling the grid in reading order instead is the obvious thing and is far
   * worse on a wrapping board: the constraint between the last column and the
   * first is not felt until the end of every row, and the one between the last
   * row and the first not until the very end — so the search builds most of a
   * grid before discovering it never fitted (measured: ~1 s typical, 3.2 s worst
   * on 5×5 wrapping, against under a millisecond this way). Always taking the
   * most-constrained cell keeps the wrap-around neighbours in play from the
   * start. It depends only on the geometry, so the enumeration order stays fixed.
   */
  const mostConstrained = (): number => {
    let best = -1;
    let bestNeighbours = -1;
    for (let cell = 0; cell < n; cell++) {
      if (placed[cell]) continue;
      const x = cell % w;
      const y = Math.floor(cell / w);
      let count = 0;
      for (const dir of DIRS) {
        const nb = offset(x, y, dir, w, h);
        if (placed[nb.y * w + nb.x]) count++;
      }
      if (count > bestNeighbours) {
        bestNeighbours = count;
        best = cell;
      }
    }
    return best;
  };

  const search = (remaining: number): void => {
    if (solutions.length >= limit) return;

    if (remaining === 0) {
      // Every tile placed, every wire answered, no loop closed anywhere: with
      // n − 1 edges and no cycles this is a spanning tree, so every tile is
      // powered from the centre.
      const found = Uint8Array.from(grid);
      if (accept(found)) solutions.push(found);
      return;
    }

    const cell = mostConstrained();
    const { required, forbidden } = constraints(cell, placed);

    for (let mask = 0; mask < 16; mask++) {
      if (available[mask] === 0) continue;
      if ((mask & required) !== required) continue;
      if (mask & forbidden) continue;

      // Placing this tile joins it to every already-placed neighbour it wires to.
      // Joining two tiles already in the same component would close a loop, and
      // the wire budget has no room for one.
      const x = cell % w;
      const y = Math.floor(cell / w);
      const joins: number[] = [];
      let loops = false;
      for (const dir of DIRS) {
        if (!(mask & dir)) continue;
        const nb = offset(x, y, dir, w, h);
        const other = nb.y * w + nb.x;
        if (!placed[other]) continue;
        if (trees.canonify(cell) === trees.canonify(other)) {
          loops = true;
          break;
        }
        joins.push(other);
        trees.merge(cell, other);
      }

      if (!loops) {
        available[mask]--;
        grid[cell] = mask;
        placed[cell] = 1;

        search(remaining - 1);

        placed[cell] = 0;
        grid[cell] = 0;
        available[mask]++;
      }

      // Undo the unions. `Dsf` has no split, so rebuild the components this cell
      // touched from the grid as it stands without it — cheap at these sizes.
      if (joins.length > 0 || loops) rebuild(trees, grid, placed, w, h, n);
    }
  };

  // A board whose tiles cannot even form a tree is not a Netslide board.
  let ends = 0;
  for (let cell = 0; cell < n; cell++) ends += wireCount(tiles[cell]);
  if (ends !== 2 * (n - 1)) return [];

  search(n - 1);
  return solutions;
}

/** Rebuild the union-find from the tiles currently placed. */
function rebuild(
  trees: Dsf,
  grid: Uint8Array,
  placed: Uint8Array,
  w: number,
  h: number,
  n: number,
): void {
  trees.reinit();
  for (let cell = 0; cell < n; cell++) {
    if (!placed[cell]) continue;
    const x = cell % w;
    const y = Math.floor(cell / w);
    for (const dir of [R, D]) {
      if (!(grid[cell] & dir)) continue;
      const nb = offset(x, y, dir, w, h);
      const other = nb.y * w + nb.x;
      if (!placed[other]) continue;
      if (grid[other] & opposite(dir)) trees.merge(cell, other);
    }
  }
}

/**
 * Can this finished grid actually be *reached* from the board by sliding?
 *
 * Not every valid-looking answer can be. A slide of a line of length `k` is a
 * `k`-cycle, which is an **even** permutation exactly when `k` is odd — so on a
 * grid whose width and height are both odd, *every* move a player can make is
 * even, and only even rearrangements of the tiles exist. Half the finished grids
 * that satisfy every other rule are simply not among them. (Enumerating a 3×3's
 * whole reachable set gives 20 160 = 8!/2 arrangements — the alternating group
 * exactly — and three of its six valid finished grids lie outside it.)
 *
 * Two things let a board off:
 *
 * - **An even dimension.** A row of even length is an odd cycle, so both parities
 *   are reachable and every valid grid is fair game.
 * - **A repeated tile.** Swapping two tiles that look alike flips the parity
 *   while leaving the *picture* untouched — so if any wire mask occurs twice, a
 *   finished grid of either parity can be reached.
 *
 * Only an all-distinct board on an all-odd grid is genuinely pinned, and there the
 * rearrangement is unique and its parity decides.
 */
export function isReachable(s: NetslideState, target: Uint8Array): boolean {
  const { w, h, cx, cy, tiles } = s;
  if (w % 2 === 0 || h % 2 === 0) return true;

  const n = w * h;
  const centre = cy * w + cx;
  if (target[centre] !== tiles[centre]) return false; // the centre cannot move

  // The rearrangement is over the cells that can *move*, so the centre is not one
  // of them — and neither is it a source of the parity flip below. A duplicate
  // that merely matches the centre tile buys nothing: swapping with the centre is
  // not a rearrangement a player can make.
  const movable: number[] = [];
  for (let cell = 0; cell < n; cell++) if (cell !== centre) movable.push(cell);

  const seen = new Int32Array(16);
  for (const cell of movable) {
    // Two movable tiles that look alike: swap them and the picture is unchanged
    // while the parity flips, so a finished grid of either parity is reachable.
    if (++seen[tiles[cell]] > 1) return true;
  }

  // Every movable tile distinct, so exactly one rearrangement takes the board to
  // the target — where each tile is now, and where the target wants it. It has to
  // be an even one.
  const slot = new Int32Array(n).fill(-1);
  movable.forEach((cell, i) => {
    slot[cell] = i;
  });

  const wanted = new Int32Array(16).fill(-1);
  for (const cell of movable) wanted[target[cell]] = cell;

  const sigma = new Int32Array(movable.length);
  for (let i = 0; i < movable.length; i++) {
    const destination = wanted[tiles[movable[i]]];
    if (destination < 0) return false; // the target has no room for this tile
    sigma[i] = slot[destination];
  }

  // Parity is (size − number of cycles) mod 2.
  const visited = new Uint8Array(movable.length);
  let cycles = 0;
  for (let i = 0; i < movable.length; i++) {
    if (visited[i]) continue;
    cycles++;
    for (let at = i; !visited[at]; at = sigma[at]) visited[at] = 1;
  }
  return (movable.length - cycles) % 2 === 0;
}

/**
 * The finished grid to plan against, for a board that did not come with one: the
 * first that the board can actually be slid into.
 *
 * Deterministic, and — because the tile multiset, the barriers and the centre
 * tile are all untouched by sliding — the *same grid for the whole game*, however
 * the player scrambles the board.
 */
export function reconstructSolution(s: NetslideState): Uint8Array | null {
  const found = findSolutions(s, 1, (grid) => isReachable(s, grid));
  return found.length > 0 ? found[0] : null;
}
