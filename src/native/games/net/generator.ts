/**
 * Net board generation — an idiomatic port of `new_game_desc` in net.c.
 *
 * The RNG-consuming phases, in this exact order (the order is load-bearing: the
 * differential asserts the desc byte-for-byte against C for the same seed):
 *
 *   1. Grow the solved grid outward from the centre as a spanning tree.
 *   2. If `unique`, run the solver + `perturb` until the grid is uniquely
 *      solvable (regenerating from scratch if perturbation stalls).
 *   3. Collect the barrier candidates (edges the solution leaves unwired) and
 *      save the solved grid as `aux`.
 *   4. Shuffle: rotate every tile a random amount, reshuffle out of any loop,
 *      and require at least one mismatched non-wrapping edge (so the start isn't
 *      accidentally already solved).
 *   5. Choose barrier locations from the candidates.
 *
 * Barriers are chosen *after* the shuffle so that raising the barrier rate on a
 * fixed seed extends the previous barrier set rather than replacing it.
 */

import {
  anticlockwise,
  clockwise,
  collectBarrierCandidates,
  D,
  encodeWireDesc,
  growSpanningTree,
  L,
  offset,
  opposite,
  placeBarriers,
  R,
  rot,
  U,
  type Xyd,
} from "../../engine/wires.ts";
import { shuffle as shuffleArray } from "../../engine/shuffle.ts";
import { type RandomState, randomUpto } from "../../random/index.ts";
import { computeLoops } from "./loops.ts";
import { netSolver, SOLVER_UNIQUE } from "./solver.ts";
import type { NetParams } from "./state.ts";

const HEX = "0123456789abcdef";
const LOCKED = 0x10;

export function newDesc(
  p: NetParams,
  rs: RandomState,
): { desc: string; aux: string } {
  const { w, h } = p;
  const wh = w * h;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const tiles = new Uint8Array(wh);
  const barriers = new Uint8Array(wh);

  // The outer loop is upstream's `begin_generation` label: the uniqueness gate
  // may give up and restart the whole grid.
  beginGeneration: for (;;) {
    tiles.fill(0);
    barriers.fill(0);

    growSpanningTree(tiles, w, h, p.wrapping, cx, cy, rs);

    if (p.unique) {
      let prevn = -1;
      // The solver marks determined tiles LOCKED; the boundary between locked
      // and unlocked tiles bounds an ambiguous region, which `perturb` rewires.
      while (netSolver(w, h, tiles, null, p.wrapping) !== SOLVER_UNIQUE) {
        let n = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (x + 1 < w && (tiles[y * w + x] ^ tiles[y * w + x + 1]) & LOCKED) {
              n++;
              if (tiles[y * w + x] & LOCKED) {
                perturb(w, h, tiles, p.wrapping, rs, x + 1, y, L);
              } else {
                perturb(w, h, tiles, p.wrapping, rs, x, y, R);
              }
            }
            if (y + 1 < h && (tiles[y * w + x] ^ tiles[(y + 1) * w + x]) & LOCKED) {
              n++;
              if (tiles[y * w + x] & LOCKED) {
                perturb(w, h, tiles, p.wrapping, rs, x, y + 1, U);
              } else {
                perturb(w, h, tiles, p.wrapping, rs, x, y, D);
              }
            }
          }
        }

        // If we couldn't reduce the number of ambiguous sections, give up and
        // regenerate the whole grid.
        if (prevn !== -1 && prevn <= n) continue beginGeneration;
        prevn = n;
      }

      // The solver left LOCKED bits everywhere; clear them.
      for (let i = 0; i < wh; i++) tiles[i] &= ~LOCKED;
    }

    break;
  }

  // Barrier candidates are the edges the solution leaves unwired (before the
  // shuffle, since that is the grid the barriers must be compatible with).
  const candidates = collectBarrierCandidates(tiles, w, h, p.wrapping);

  // The unshuffled grid is the solution; `solve()` replays it.
  const aux = Array.from(tiles, (t) => HEX[t & 0xf]).join("");

  shuffle(tiles, w, h, rs);
  placeBarriers(barriers, candidates, w, h, p.barrierProbability, rs);

  return { desc: encodeWireDesc(tiles, barriers, w, h, p.wrapping), aux };
}

/**
 * Scramble the solved grid: rotate every tile a random amount, then repeatedly
 * reshuffle just the tiles that form a loop until there are none, and finally
 * require at least one mismatched non-wrapping edge so the start is not
 * accidentally already solved. Every draw and every retry must match C, so this
 * is transcribed rather than tidied.
 */
function shuffle(tiles: Uint8Array, w: number, h: number, rs: RandomState): void {
  const wh = w * h;

  reshuffle: for (;;) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const orig = tiles[y * w + x];
        tiles[y * w + x] = rot(orig, randomUpto(rs, 4));
      }
    }

    // Fix loops by reshuffling just the squares involved.
    let prevLoopsquares = wh + 1;
    for (;;) {
      const loops = computeLoops(w, h, tiles, null, true);
      let thisLoopsquares = 0;
      for (let i = 0; i < wh; i++) {
        if (loops[i]) {
          tiles[i] = rot(tiles[i], randomUpto(rs, 4));
          thisLoopsquares++;
        }
      }
      if (thisLoopsquares > prevLoopsquares) {
        // Making it worse: give up and go back to a full shuffle.
        continue reshuffle;
      }
      if (thisLoopsquares === 0) break;
      prevLoopsquares = thisLoopsquares;
    }

    // Require a mismatch across a non-wrapping edge (always possible).
    let mismatches = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (
          x + 1 < w &&
          (rot(tiles[y * w + x], 2) ^ tiles[y * w + x + 1]) & L
        ) {
          mismatches++;
        }
        if (
          y + 1 < h &&
          (rot(tiles[y * w + x], 2) ^ tiles[(y + 1) * w + x]) & U
        ) {
          mismatches++;
        }
      }
    }

    if (mismatches === 0) continue;
    break;
  }
}

/**
 * Randomly perturb an ambiguous section to steer toward unique solvability —
 * an idiomatic port of `perturb` in net.c. We know the tile at
 * `(startx, starty)` is ambiguous and its neighbour in direction `startd` is
 * fully specified.
 *
 * The technique: trace the perimeter of the ambiguous area; find a perimeter
 * edge we can newly join without making a cross either side; join it; find the
 * loop that join created; sever that loop at a random other point; and finally
 * lock the whole section so it isn't perturbed again this pass.
 */
function perturb(
  w: number,
  h: number,
  tiles: Uint8Array,
  wrapping: boolean,
  rs: RandomState,
  startx: number,
  starty: number,
  startd: number,
): void {
  // Trace all the way round the ambiguous area, wall-following.
  const perimeter: Xyd[] = [];
  let x = startx;
  let y = starty;
  let d = startd;
  do {
    perimeter.push({ x, y, direction: d });

    // Try to simply turn left and find another locked square.
    const d2 = anticlockwise(d);
    let o = offset(x, y, d2, w, h);
    if (
      (!wrapping && (Math.abs(o.x - x) > 1 || Math.abs(o.y - y) > 1)) ||
      tiles[o.y * w + o.x] & LOCKED
    ) {
      d = d2;
    } else {
      // Step left into the new square and look in front.
      x = o.x;
      y = o.y;
      o = offset(x, y, d, w, h);
      if (
        (wrapping || (Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1)) &&
        !(tiles[o.y * w + o.x] & LOCKED)
      ) {
        // Step forward into that square and turn right.
        x = o.x;
        y = o.y;
        d = clockwise(d);
      }
    }
  } while (x !== startx || y !== starty || d !== startd);

  // Search the (shuffled) perimeter for a join we can make.
  const perim2 = perimeter.slice();
  shuffleArray(perim2, rs);
  let joined = false;
  for (let i = 0; i < perim2.length; i++) {
    x = perim2[i].x;
    y = perim2[i].y;
    d = perim2[i].direction;

    const o = offset(x, y, d, w, h);
    if (!wrapping && (Math.abs(o.x - x) > 1 || Math.abs(o.y - y) > 1)) continue;
    if (tiles[y * w + x] & d) continue; // already linked this way
    if (((tiles[y * w + x] | d) & 15) === 15) continue; // would make a cross
    if (((tiles[o.y * w + o.x] | opposite(d)) & 15) === 15) continue; // other side

    tiles[y * w + x] |= d;
    tiles[o.y * w + o.x] |= opposite(d);
    joined = true;
    break;
  }

  if (!joined) return; // nothing we can do

  // Find the loop the new link is part of, using two parallel wall-followers
  // (one hugging the left wall, one the right); stop as soon as either closes.
  const loop: Xyd[][] = [[], []];
  const looppos: Xyd[] = [
    { x, y, direction: d },
    { x, y, direction: d },
  ];
  outer: for (;;) {
    for (let i = 0; i < 2; i++) {
      x = looppos[i].x;
      y = looppos[i].y;
      d = looppos[i].direction;

      const o = offset(x, y, d, w, h);

      // Add this segment to the loop — unless it exactly reverses the previous
      // one, in which case take that one away.
      const last = loop[i][loop[i].length - 1];
      if (
        loop[i].length > 0 &&
        last.x === o.x &&
        last.y === o.y &&
        last.direction === opposite(d)
      ) {
        loop[i].pop();
      } else {
        loop[i].push(looppos[i]);
      }

      d = opposite(d);
      for (let j = 0; j < 4; j++) {
        d = i === 0 ? anticlockwise(d) : clockwise(d);
        if (tiles[o.y * w + o.x] & d) {
          looppos[i] = { x: o.x, y: o.y, direction: d };
          break;
        }
      }

      if (
        looppos[i].x === loop[i][0].x &&
        looppos[i].y === loop[i][0].y &&
        looppos[i].direction === loop[i][0].direction
      ) {
        // Sever the loop at a random point other than the join (loop[i][0]).
        const j = randomUpto(rs, loop[i].length - 1) + 1;
        x = loop[i][j].x;
        y = loop[i][j].y;
        d = loop[i][j].direction;
        const so = offset(x, y, d, w, h);
        tiles[y * w + x] &= ~d;
        tiles[so.y * w + so.x] &= ~opposite(d);
        break outer;
      }
    }
  }

  // Lock the whole disputed section so it isn't perturbed again this pass. Sort
  // the perimeter into columns (each in vertical order) and fill each column
  // from an Up edge down to the matching Down edge.
  perimeter.sort((a, b) => a.x - b.x || a.y - b.y || a.direction - b.direction);
  x = -1;
  y = -1;
  for (let i = 0; i <= perimeter.length; i++) {
    if (i === perimeter.length || perimeter[i].x > x) {
      // Close out the previous column.
      if (x !== -1) {
        while (y < h) {
          tiles[y * w + x] |= LOCKED;
          y++;
        }
        x = -1;
        y = -1;
      }
      if (i === perimeter.length) break;
      x = perimeter[i].x;
      y = 0;
    }

    if (perimeter[i].direction === U) {
      x = perimeter[i].x;
      y = perimeter[i].y;
    } else if (perimeter[i].direction === D) {
      while (y <= perimeter[i].y) {
        tiles[y * w + x] |= LOCKED;
        y++;
      }
      x = -1;
      y = -1;
    }
  }
}
