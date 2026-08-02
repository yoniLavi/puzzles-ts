/**
 * Flood's heuristic solver, ported branch-for-branch from upstream
 * `flood.c` (`search` + `choosemove` + `choosemove_recurse`). It is
 * *not* optimal — it is a depth-3 greedy look-ahead — but it is exactly
 * what upstream uses to set each board's par at generation time, so it
 * must reproduce C's choices (see the design's D-RISK note and the
 * differential test). Keep the inner loops typed-array-tight.
 */

import { stepBudget } from "../../engine/step-budget.ts";

/** Upstream's `RECURSION_DEPTH`: depth-3 was empirically a clear win
 * over 2, with 4 only negligibly better than 3. */
export const RECURSION_DEPTH = 3;

/** Reusable scratch buffers, mirroring upstream's `solver_scratch`, so
 * generation (which runs the solver to completion, repeatedly) does no
 * per-move allocation. */
export class SolverScratch {
  readonly queue0: Int32Array;
  readonly queue1: Int32Array;
  readonly dist: Int32Array;
  /** `RECURSION_DEPTH` working grids, one per recursion level. */
  readonly rgrids: Uint8Array;
  private readonly wh: number;

  constructor(w: number, h: number) {
    const wh = w * h;
    this.wh = wh;
    this.queue0 = new Int32Array(wh);
    this.queue1 = new Int32Array(wh);
    this.dist = new Int32Array(wh);
    this.rgrids = new Uint8Array(wh * RECURSION_DEPTH);
  }

  /** The working grid for recursion `depth` (a view into `rgrids`). */
  rgrid(depth: number): Uint8Array {
    return this.rgrids.subarray(depth * this.wh, (depth + 1) * this.wh);
  }
}

/** Enact a flood-fill move on `grid` in place: recolour the corner
 * region (and everything it newly reaches) from `(x0,y0)`'s old colour
 * to `newcolour`. `queue` is scratch of length ≥ `w*h`. */
export function fill(
  w: number,
  h: number,
  grid: Uint8Array,
  x0: number,
  y0: number,
  newcolour: number,
  queue: Int32Array,
): void {
  const oldcolour = grid[y0 * w + x0];
  if (oldcolour === newcolour) return; // upstream asserts this never happens
  grid[y0 * w + x0] = newcolour;
  queue[0] = y0 * w + x0;
  let qtail = 0;
  let qhead = 1;

  while (qtail < qhead) {
    const pos = queue[qtail++];
    const y = Math.floor(pos / w);
    const x = pos % w;
    for (let dir = 0; dir < 4; dir++) {
      const y1 = y + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
      const x1 = x + (dir === 0 ? 1 : dir === 2 ? -1 : 0);
      if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) {
        const pos1 = y1 * w + x1;
        if (grid[pos1] === oldcolour) {
          grid[pos1] = newcolour;
          queue[qhead++] = pos1;
        }
      }
    }
  }
}

/** True iff every cell of `grid` is the same colour. */
export function completed(grid: Uint8Array): boolean {
  for (let i = 1; i < grid.length; i++) if (grid[i] !== grid[0]) return false;
  return true;
}

export interface SearchResult {
  /** The greatest "fill distance" of any cell from the corner. */
  dist: number;
  /** How many cells sit at that greatest distance. */
  number: number;
  /** Size of the controlled (distance-0) set. */
  control: number;
}

/**
 * Find the most distant square(s) from `(x0,y0)`. A cell's "distance"
 * is the number of fills needed to absorb it: stepping to a same-colour
 * neighbour is free (stays in the current layer), stepping to a
 * different-colour neighbour costs one. Returns that maximum distance,
 * the count of squares at it, and the size of the distance-0 set.
 *
 * Ported from upstream `search` — a two-queue layered BFS where
 * `queue[qcurr]` holds the current distance layer and `queue[qcurr^1]`
 * accumulates the next.
 */
export function search(
  w: number,
  h: number,
  grid: Uint8Array,
  x0: number,
  y0: number,
  scratch: SolverScratch,
): SearchResult {
  const wh = w * h;
  const { dist } = scratch;
  const queue = [scratch.queue0, scratch.queue1];

  for (let i = 0; i < wh; i++) dist[i] = -1;
  queue[0][0] = y0 * w + x0;
  queue[1][0] = y0 * w + x0;
  dist[y0 * w + x0] = 0;
  let currdist = 0;
  let qcurr = 0;
  let qtail = 0;
  let qhead = 1;
  let qnext = 1;
  let remaining = wh - 1;
  let control = qhead;

  while (true) {
    if (qtail === qhead) {
      // Switch to the next distance layer.
      if (currdist === 0) control = qhead;
      currdist++;
      qcurr ^= 1;
      qhead = qnext;
      qtail = 0;
      qnext = 0;
    } else if (remaining === 0 && qnext === 0) {
      break;
    } else {
      const pos = queue[qcurr][qtail++];
      const y = Math.floor(pos / w);
      const x = pos % w;
      for (let dir = 0; dir < 4; dir++) {
        const y1 = y + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
        const x1 = x + (dir === 0 ? 1 : dir === 2 ? -1 : 0);
        if (x1 >= 0 && x1 < w && y1 >= 0 && y1 < h) {
          const pos1 = y1 * w + x1;
          if (
            dist[pos1] === -1 &&
            ((grid[pos1] === grid[pos] && dist[pos] === currdist) ||
              (grid[pos1] !== grid[pos] && dist[pos] === currdist - 1))
          ) {
            queue[qcurr][qhead++] = pos1;
            queue[qcurr ^ 1][qnext++] = pos1;
            dist[pos1] = currdist;
            remaining--;
          }
        }
      }
    }
  }

  const result: SearchResult = { dist: currdist, number: qhead, control };
  if (currdist === 0) result.control = qhead;
  return result;
}

/**
 * Try every possible move and choose the one that minimises `search`'s
 * result, looking `RECURSION_DEPTH` moves ahead. A winning move is
 * immediately best (and records the depth at which it wins, so shallower
 * wins are preferred). Ported branch-for-branch from
 * `choosemove_recurse`; the tie-break order is `dist`, then `number`,
 * then larger `control`, then first colour to achieve it.
 */
function choosemoveRecurse(
  w: number,
  h: number,
  grid: Uint8Array,
  x0: number,
  y0: number,
  maxmove: number,
  scratch: SolverScratch,
  depth: number,
  out: SearchResult,
): number {
  const wh = w * h;
  const tmpgrid = scratch.rgrid(depth);

  let bestdist = wh + 1;
  let bestnumber = 0;
  let bestcontrol = 0;
  let bestmove = -1;
  const inner: SearchResult = { dist: 0, number: 0, control: 0 };

  for (let move = 0; move < maxmove; move++) {
    if (grid[y0 * w + x0] === move) continue;
    tmpgrid.set(grid);
    fill(w, h, tmpgrid, x0, y0, move, scratch.queue0);
    if (completed(tmpgrid)) {
      // A winning move is immediately the best; stop searching and
      // record the recursion depth so higher levels prefer faster wins.
      out.dist = -1;
      out.number = depth;
      out.control = wh;
      return move;
    }
    let dist: number;
    let number: number;
    let control: number;
    if (depth < RECURSION_DEPTH - 1) {
      choosemoveRecurse(w, h, tmpgrid, x0, y0, maxmove, scratch, depth + 1, inner);
      dist = inner.dist;
      number = inner.number;
      control = inner.control;
    } else {
      const s = search(w, h, tmpgrid, x0, y0, scratch);
      dist = s.dist;
      number = s.number;
      control = s.control;
    }
    if (
      dist < bestdist ||
      (dist === bestdist &&
        (number < bestnumber || (number === bestnumber && control > bestcontrol)))
    ) {
      bestdist = dist;
      bestnumber = number;
      bestcontrol = control;
      bestmove = move;
    }
  }

  out.dist = bestdist;
  out.number = bestnumber;
  out.control = bestcontrol;
  return bestmove;
}

/** Pick the solver's next fill colour for `grid` from `(x0,y0)`,
 * considering colours `0..maxmove-1`. */
export function choosemove(
  w: number,
  h: number,
  grid: Uint8Array,
  x0: number,
  y0: number,
  maxmove: number,
  scratch: SolverScratch,
): number {
  const out: SearchResult = { dist: 0, number: 0, control: 0 };
  return choosemoveRecurse(w, h, grid, x0, y0, maxmove, scratch, 0, out);
}

/** Run the solver to completion from `grid`, returning the full list of
 * fill colours it plays. Used by `solve` (snap) and `hint` (plan). */
export function solveMoves(
  w: number,
  h: number,
  grid: Uint8Array,
  colours: number,
): number[] {
  const scratch = new SolverScratch(w, h);
  const work = Uint8Array.from(grid);
  const moves: number[] = [];
  // Bound the hint/Solve completion loop against a regression where a chosen
  // move stops shrinking the unfilled region (generation grades via `search`/
  // `choosemove`, not this function, so it is unaffected).
  const budget = stepBudget("flood solve");
  while (!completed(work)) {
    budget.tick();
    const move = choosemove(w, h, work, 0, 0, colours, scratch);
    fill(w, h, work, 0, 0, move, scratch.queue0);
    moves.push(move);
  }
  return moves;
}
