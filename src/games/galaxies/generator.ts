/**
 * Galaxies generator: grow regions and place dots, then keep the board only if
 * the solver grades it at the requested difficulty. Derived from upstream's
 * `new_game_desc` and `generate_pass`.
 */

import type { RandomState } from "../../engine/random/index.ts";
import { shuffle } from "../../engine/shuffle.ts";
import type { Point } from "../../engine/types.ts";
import { clearForSolve, type GalaxiesDiff, solverState } from "./solver.ts";
import {
  addAssoc,
  addDot,
  adjacencies,
  blankGame,
  checkComplete,
  cloneState,
  dotTiles,
  encodeGame,
  F_DOT,
  F_DOT_BLACK,
  F_EDGE_SET,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  inGrid,
  rebuildDots,
  SpaceType,
  spaceOppositeDot,
  spaceTypeAt,
} from "./state.ts";

// --- dot and region helpers ----------------------------------------

/** Whether a dot fits at `(x, y)`: no other dot, set edge or associated tile
 * nearby. Upstream's `dot_is_possible(state, sp, false)`. */
function dotIsPossible(s: GalaxiesState, x: number, y: number): boolean {
  // The neighborhood reaches one space further along each axis on which the
  // dot sits between tiles (an even coordinate).
  const bx = x & 1 ? 1 : 2;
  const by = y & 1 ? 1 : 2;
  for (let dx = -bx; dx <= bx; dx++) {
    for (let dy = -by; dy <= by; dy++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inGrid(s, nx, ny)) continue;
      const f = s.flags[idx(s, nx, ny)];
      if (f & F_TILE_ASSOC) return false;
      if ((dx !== 0 || dy !== 0) && f & F_DOT) return false;
      if (Math.abs(dx) < bx && Math.abs(dy) < by && f & F_EDGE_SET) return false;
    }
  }
  return true;
}

/** Whether every tile of the dot at `(oldDx, oldDy)` would still have a usable
 * 180° image, empty or the same dot's, about `(newDx, newDy)`. */
function canMoveDot(
  s: GalaxiesState,
  oldDx: number,
  oldDy: number,
  newDx: number,
  newDy: number,
): boolean {
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const ti = idx(s, x, y);
      if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
      if (s.dotx[ti] !== oldDx || s.doty[ti] !== oldDy) continue;
      const opp = spaceOppositeDot(s, x, y, newDx, newDy);
      if (!opp) return false;
      const oi = idx(s, opp.x, opp.y);
      if (s.flags[oi] & F_TILE_ASSOC) {
        if (s.dotx[oi] !== oldDx || s.doty[oi] !== oldDy) return false;
      }
    }
  }
  return true;
}

/** Re-associate every tile of the old dot, and its new image, with the moved
 * dot. */
function moveDotAssociations(
  s: GalaxiesState,
  oldDx: number,
  oldDy: number,
  newDx: number,
  newDy: number,
): void {
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const ti = idx(s, x, y);
      if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
      if (s.dotx[ti] !== oldDx || s.doty[ti] !== oldDy) continue;
      const opp = spaceOppositeDot(s, x, y, newDx, newDy);
      if (!opp) continue;
      addAssoc(s, x, y, newDx, newDy);
      addAssoc(s, opp.x, opp.y, newDx, newDy);
    }
  }
}

/** Grow the dot's region to cover `toAdd`, each tile with its 180° image; if
 * that is impossible, try moving the dot to the center of mass of its old and
 * new tiles instead. Upstream's `dot_expand_or_move`; mutates `s` only on
 * success. */
function dotExpandOrMove(
  s: GalaxiesState,
  dx: number,
  dy: number,
  toAdd: Point[],
): boolean {
  const di = idx(s, dx, dy);
  // Straight expansion: every tile needs an empty image about the current dot.
  const expansions: { t: Point; opp: Point }[] = [];
  let allExpandable = true;
  for (const t of toAdd) {
    const opp = spaceOppositeDot(s, t.x, t.y, dx, dy);
    if (!opp || s.flags[idx(s, opp.x, opp.y)] & F_TILE_ASSOC) {
      allExpandable = false;
      break;
    }
    expansions.push({ t, opp });
  }
  if (allExpandable) {
    for (const { t, opp } of expansions) {
      addAssoc(s, t.x, t.y, dx, dy);
      addAssoc(s, opp.x, opp.y, dx, dy);
    }
    return true;
  }

  const oldCount = s.nassoc[di];
  const newCount = oldCount + toAdd.length;
  let cx = dx * oldCount;
  let cy = dy * oldCount;
  for (const t of toAdd) {
    cx += t.x;
    cy += t.y;
  }
  if (cx % newCount !== 0 || cy % newCount !== 0) return false;
  cx = (cx / newCount) | 0;
  cy = (cy / newCount) | 0;
  if (cx <= 0 || cy <= 0 || cx >= s.sx - 1 || cy >= s.sy - 1) return false;

  // Every tile, existing and new, needs a usable image about the new position.
  if (!canMoveDot(s, dx, dy, cx, cy)) return false;
  for (const t of toAdd) {
    const opp = spaceOppositeDot(s, t.x, t.y, cx, cy);
    if (!opp) return false;
    const oi = idx(s, opp.x, opp.y);
    if (s.flags[oi] & F_TILE_ASSOC) {
      if (s.dotx[oi] !== dx || s.doty[oi] !== dy) return false;
    }
  }

  // Give the new tiles to the old dot first, so the move carries them along.
  for (const t of toAdd) addAssoc(s, t.x, t.y, dx, dy);
  const wasBlack = s.flags[di] & F_DOT_BLACK;
  s.flags[di] &= ~(F_DOT | F_DOT_BLACK);
  s.nassoc[di] = 0;
  s.flags[idx(s, cx, cy)] |= F_DOT | wasBlack;
  s.nassoc[idx(s, cx, cy)] = 0;
  moveDotAssociations(s, dx, dy, cx, cy);
  s.dots = rebuildDots(s);
  return true;
}

/** Try to grow a neighboring region over the tiles in `(x1, y1)`–`(x2, y2)`:
 * one tile, or the two beside an edge. */
function generateTryBlock(
  s: GalaxiesState,
  rng: RandomState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (!inGrid(s, x1, y1) || !inGrid(s, x2, y2)) return false;
  const maxsz = Math.floor(Math.sqrt(s.w * s.h)) * 2;

  // Inner block tiles.
  const toAdd: Point[] = [];
  for (let x = x1; x <= x2; x += 2) {
    for (let y = y1; y <= y2; y += 2) {
      const i = idx(s, x, y);
      if (s.flags[i] & F_TILE_ASSOC) return false;
      toAdd.push({ x, y });
    }
  }

  // Outside tiles surrounding the block.
  const outside: Point[] = [];
  const push = (x: number, y: number) => {
    if (inGrid(s, x, y)) outside.push({ x, y });
  };
  for (let x = x1; x <= x2; x += 2) {
    push(x, y1 - 2);
    push(x, y2 + 2);
  }
  for (let y = y1; y <= y2; y += 2) {
    push(x1 - 2, y);
    push(x2 + 2, y);
  }
  shuffle(outside, rng);

  for (const o of outside) {
    const oi = idx(s, o.x, o.y);
    if (!(s.flags[oi] & F_TILE_ASSOC)) continue;
    const ddx = s.dotx[oi];
    const ddy = s.doty[oi];
    const di = idx(s, ddx, ddy);
    if (s.nassoc[di] >= maxsz) continue;
    if (dotExpandOrMove(s, ddx, ddy, toAdd)) return true;
  }
  return false;
}

/** One pass over every space in random order: grow a neighboring region over
 * it, or failing that place a new dot there. */
function generatePass(s: GalaxiesState, rng: RandomState): void {
  const order = Array.from({ length: s.sx * s.sy }, (_, i) => i);
  shuffle(order, rng);

  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const px = i % s.sx;
    const py = (i / s.sx) | 0;
    const t = spaceTypeAt(px, py);
    let x1 = px;
    let y1 = py;
    let x2 = px;
    let y2 = py;
    if (t === SpaceType.Edge) {
      if ((px & 1) === 0) {
        x1--;
        x2++;
      } else {
        y1--;
        y2++;
      }
    }
    if (t !== SpaceType.Vertex && generateTryBlock(s, rng, x1, y1, x2, y2)) continue;
    if (t === SpaceType.Edge && k % 2 === 1) continue;

    if (dotIsPossible(s, px, py)) {
      addDot(s, px, py);
      s.dots.push({ x: px, y: py });
      // A new dot claims the tiles it sits on at once, as upstream's
      // generate_pass does through solver_obvious_dot.
      claimDotTiles(s, px, py);
    }
  }
}

/** Associate each unclaimed tile the dot sits on, with its free 180° image. */
function claimDotTiles(s: GalaxiesState, dx: number, dy: number): void {
  for (const t of dotTiles(s, dx, dy)) {
    if (s.flags[idx(s, t.x, t.y)] & F_TILE_ASSOC) continue;
    const opp = spaceOppositeDot(s, t.x, t.y, dx, dy);
    if (!opp || s.flags[idx(s, opp.x, opp.y)] & F_TILE_ASSOC) continue;
    addAssoc(s, t.x, t.y, dx, dy);
    addAssoc(s, opp.x, opp.y, dx, dy);
  }
}

/** Set exactly the edges between this tile and neighbors in other regions.
 * Upstream's `outline_tile_fordot(state, tile, true)`. */
function outlineTileForDot(s: GalaxiesState, tx: number, ty: number): void {
  const ti = idx(s, tx, ty);
  const { edges, tiles } = adjacencies(s, tx, ty);
  for (let n = 0; n < 4; n++) {
    const e = edges[n];
    if (!e) continue;
    const ei = idx(s, e.x, e.y);
    const edgeSet = (s.flags[ei] & F_EDGE_SET) !== 0;
    const t2 = tiles[n];
    let same = false;
    if (t2) {
      const t2i = idx(s, t2.x, t2.y);
      if (!(s.flags[ti] & F_TILE_ASSOC)) {
        same = !(s.flags[t2i] & F_TILE_ASSOC);
      } else {
        same =
          (s.flags[t2i] & F_TILE_ASSOC) !== 0 &&
          s.dotx[ti] === s.dotx[t2i] &&
          s.doty[ti] === s.doty[t2i];
      }
    }
    if (!edgeSet && !same) s.flags[ei] |= F_EDGE_SET;
    else if (edgeSet && same) s.flags[ei] &= ~F_EDGE_SET;
  }
}

function measureWiggliness(s: GalaxiesState): number {
  let n = 0;
  for (let y = 1; y < s.sy; y += 2) {
    for (let x = 1; x < s.sx; x += 2) {
      if (y + 2 < s.sy) {
        n += isWiggle(s, x, y, 0, +1) ? 1 : 0;
        n += isWiggle(s, x, y, 0, -1) ? 1 : 0;
        n += isWiggle(s, x, y, +1, 0) ? 1 : 0;
        n += isWiggle(s, x, y, -1, 0) ? 1 : 0;
      }
    }
  }
  return n;
}

function isWiggle(
  s: GalaxiesState,
  x: number,
  y: number,
  dx: number,
  dy: number,
): boolean {
  const x1 = x + 2 * dx;
  const y1 = y + 2 * dy;
  const x2 = x - 2 * dy;
  const y2 = y + 2 * dx;
  if (!inGrid(s, x1, y1) || !inGrid(s, x2, y2)) return false;
  const ti = idx(s, x, y);
  const t1i = idx(s, x1, y1);
  const t2i = idx(s, x2, y2);
  // Every tile is associated by the time this runs; the check is defensive.
  if (
    !(s.flags[ti] & F_TILE_ASSOC) ||
    !(s.flags[t1i] & F_TILE_ASSOC) ||
    !(s.flags[t2i] & F_TILE_ASSOC)
  ) {
    return false;
  }
  return (
    s.dotx[t1i] === s.dotx[t2i] &&
    s.doty[t1i] === s.doty[t2i] &&
    !(s.dotx[t1i] === s.dotx[ti] && s.doty[t1i] === s.doty[ti])
  );
}

const GENERATE_TRIES = 10;
const MAX_REGENERATIONS = 200;

/** A desc for `params`, retried until the solver grades it at `params.diff`. */
export function newGameDesc(
  params: { w: number; h: number; diff: GalaxiesDiff },
  rng: RandomState,
): string {
  const { w, h } = params;

  for (let regen = 0; regen < MAX_REGENERATIONS; regen++) {
    // Keep the wiggliest of several boards.
    let best: GalaxiesState | null = null;
    let bestW = -1;
    for (let i = 0; i < GENERATE_TRIES; i++) {
      // At least two dots, since one dot is trivial; bounded for tiny grids.
      let attempt: GalaxiesState;
      let safety = 0;
      do {
        attempt = blankGame(w, h);
        generatePass(attempt, rng);
        attempt.dots = rebuildDots(attempt);
      } while (attempt.dots.length < 2 && ++safety < 20);
      const wig = measureWiggliness(attempt);
      if (wig > bestW) {
        bestW = wig;
        best = attempt;
      }
    }
    if (!best) continue;

    // Draw the walls between the regions.
    for (let y = 1; y < best.sy - 1; y += 2) {
      for (let x = 1; x < best.sx - 1; x += 2) {
        outlineTileForDot(best, x, y);
      }
    }
    if (!checkComplete(best, false).complete) continue;

    // Grade from the starting position: dots only.
    const probe = cloneState(best);
    clearForSolve(probe);
    if (solverState(probe, params.diff) !== params.diff) continue;

    return encodeGame(best);
  }
  throw new Error(`Galaxies generator: gave up after ${MAX_REGENERATIONS} attempts`);
}
