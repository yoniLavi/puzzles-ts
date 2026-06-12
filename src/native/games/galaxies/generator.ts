/**
 * Galaxies generator — places dots, then validates that the
 * resulting board is uniquely solvable at the requested difficulty;
 * retries until it is. Idiomatic TS port of `new_game_desc` and
 * `generate_pass` in galaxies.c (D6).
 */
import { shuffle } from "../../engine/shuffle.ts";
import type { RandomState } from "../../random/index.ts";
import { clearForSolve, type GalaxiesDiff, solverState } from "./solver.ts";
import {
  addAssoc,
  addDot,
  adjacencies,
  blankGame,
  checkComplete,
  cloneState,
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

// --- dot/region utility helpers (mirror galaxies.c) ----------------

/** True iff placing a dot at `(x,y)` would not collide with another
 * dot or set edge nearby. Mirrors `dot_is_possible(state, sp, false)`.
 * `allowAssoc=false` means we also reject if any neighbour is already
 * associated with another dot. */
function dotIsPossible(s: GalaxiesState, sx: number, sy: number): boolean {
  const t = spaceTypeAt(sx, sy);
  let bx: number;
  let by: number;
  if (t === SpaceType.Tile) {
    bx = by = 1;
  } else if (t === SpaceType.Edge) {
    if ((sx & 1) === 0) {
      bx = 2;
      by = 1;
    } else {
      bx = 1;
      by = 2;
    }
  } else {
    bx = by = 2;
  }
  for (let dx = -bx; dx <= bx; dx++) {
    for (let dy = -by; dy <= by; dy++) {
      const nx = sx + dx;
      const ny = sy + dy;
      if (!inGrid(s, nx, ny)) continue;
      const ni = idx(s, nx, ny);
      const f = s.flags[ni];
      if (f & F_TILE_ASSOC) return false;
      if ((dx !== 0 || dy !== 0) && f & F_DOT) return false;
      if (Math.abs(dx) < bx && Math.abs(dy) < by && f & F_EDGE_SET) {
        return false;
      }
    }
  }
  return true;
}

/** Walk every tile associated with `oldDot` and check that, were the
 * dot moved to `(ndx, ndy)`, each tile would have a valid opposite
 * (empty, or also associated with `oldDot`). */
function movedotCheck(
  s: GalaxiesState,
  oldDx: number,
  oldDy: number,
  ndx: number,
  ndy: number,
): boolean {
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const ti = idx(s, x, y);
      if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
      if (s.dotx[ti] !== oldDx || s.doty[ti] !== oldDy) continue;
      const opp = spaceOppositeDot(s, x, y, ndx, ndy);
      if (!opp) return false;
      const oi = idx(s, opp.x, opp.y);
      if (s.flags[oi] & F_TILE_ASSOC) {
        if (s.dotx[oi] !== oldDx || s.doty[oi] !== oldDy) return false;
      }
    }
  }
  return true;
}

function movedotApply(
  s: GalaxiesState,
  oldDx: number,
  oldDy: number,
  ndx: number,
  ndy: number,
): void {
  // Re-associate every tile (and its new opposite) with the moved dot.
  for (let y = 1; y < s.sy - 1; y += 2) {
    for (let x = 1; x < s.sx - 1; x += 2) {
      const ti = idx(s, x, y);
      if (!(s.flags[ti] & F_TILE_ASSOC)) continue;
      if (s.dotx[ti] !== oldDx || s.doty[ti] !== oldDy) continue;
      const opp = spaceOppositeDot(s, x, y, ndx, ndy);
      if (!opp) continue;
      addAssoc(s, x, y, ndx, ndy);
      addAssoc(s, opp.x, opp.y, ndx, ndy);
    }
  }
}

interface ToAdd {
  x: number;
  y: number;
}

/** Try expanding `dot`'s region to cover `toadd`. If straight
 * expansion (with opposites on each new tile) isn't possible, try
 * shifting the dot to a new CoG so the region covers them. Mirrors
 * `dot_expand_or_move`. Returns whether the operation succeeded
 * (state is mutated on success). */
function dotExpandOrMove(
  s: GalaxiesState,
  dx: number,
  dy: number,
  toadd: ToAdd[],
): boolean {
  const di = idx(s, dx, dy);
  // Straight expansion: every tile must have a valid empty opposite
  // (wrt the current dot). Record opposites on the first pass so we
  // don't recompute them on commit.
  const expansions: { t: ToAdd; opp: { x: number; y: number } }[] = [];
  let allExpandable = true;
  for (const t of toadd) {
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

  // Otherwise, try moving the dot. CoG of (existing tiles + new tiles).
  const nold = s.nassoc[di];
  const nnew = nold + toadd.length;
  let cx = dx * nold;
  let cy = dy * nold;
  for (const t of toadd) {
    cx += t.x;
    cy += t.y;
  }
  if (cx % nnew !== 0 || cy % nnew !== 0) return false;
  cx = (cx / nnew) | 0;
  cy = (cy / nnew) | 0;
  if (cx <= 0 || cy <= 0 || cx >= s.sx - 1 || cy >= s.sy - 1) return false;

  // Every existing assoc'd tile must have a good opposite wrt the new
  // dot position.
  if (!movedotCheck(s, dx, dy, cx, cy)) return false;

  // Every to-add tile must also have a valid opposite wrt the new dot.
  for (const t of toadd) {
    const opp = spaceOppositeDot(s, t.x, t.y, cx, cy);
    if (!opp) return false;
    const oi = idx(s, opp.x, opp.y);
    if (s.flags[oi] & F_TILE_ASSOC) {
      if (s.dotx[oi] !== dx || s.doty[oi] !== dy) return false;
    }
  }

  // OK to proceed: associate to-add tiles with the OLD dot first (so
  // movedotApply picks them up), then move the dot.
  for (const t of toadd) addAssoc(s, t.x, t.y, dx, dy);
  const wasBlack = s.flags[di] & F_DOT_BLACK;
  s.flags[di] &= ~(F_DOT | F_DOT_BLACK);
  s.nassoc[di] = 0;
  s.flags[idx(s, cx, cy)] |= F_DOT | wasBlack;
  s.nassoc[idx(s, cx, cy)] = 0;
  movedotApply(s, dx, dy, cx, cy);
  // Refresh dots list (a dot moved).
  s.dots = rebuildDots(s);
  return true;
}

/** Try block-expansion (1x1 or 2x2) of an existing region into the
 * tiles inside `(x1,y1)-(x2,y2)`. */
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
  const toadd: ToAdd[] = [];
  for (let x = x1; x <= x2; x += 2) {
    for (let y = y1; y <= y2; y += 2) {
      const i = idx(s, x, y);
      if (s.flags[i] & F_TILE_ASSOC) return false;
      toadd.push({ x, y });
    }
  }

  // Outside tiles surrounding the block.
  const outside: { x: number; y: number }[] = [];
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
    if (dotExpandOrMove(s, ddx, ddy, toadd)) return true;
  }
  return false;
}

const GP_DOTS = 1;

function generatePass(
  s: GalaxiesState,
  rng: RandomState,
  perc: number,
  flags: number,
): void {
  const sz = s.sx * s.sy;
  const order: number[] = new Array(sz);
  for (let i = 0; i < sz; i++) order[i] = i;
  shuffle(order, rng);
  const nspc = Math.floor((perc * sz) / 100);

  for (let k = 0; k < nspc; k++) {
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
    if (t !== SpaceType.Vertex) {
      if (generateTryBlock(s, rng, x1, y1, x2, y2)) continue;
    }

    if (!(flags & GP_DOTS)) continue;
    if (t === SpaceType.Edge && k % 2 === 1) continue;

    if (dotIsPossible(s, px, py)) {
      addDot(s, px, py);
      s.dots.push({ x: px, y: py });
      // Immediately establish the obvious adjacencies (each cell
      // sharing a face with the dot belongs to it). Mirrors
      // generate_pass calling solver_obvious_dot.
      solverObviousDotInline(s, px, py);
    }
  }
}

/** Inline solver_obvious_dot: associate every orthogonally-adjacent
 * tile with this dot (plus its 180°-opposite). Used only during
 * generation. */
function solverObviousDotInline(s: GalaxiesState, dx: number, dy: number): void {
  for (let ddy = -1; ddy <= 1; ddy++) {
    for (let ddx = -1; ddx <= 1; ddx++) {
      const tx = dx + ddx;
      const ty = dy + ddy;
      if (!inGrid(s, tx, ty)) continue;
      if (spaceTypeAt(tx, ty) !== SpaceType.Tile) continue;
      const ti = idx(s, tx, ty);
      if (s.flags[ti] & F_TILE_ASSOC) continue;
      const opp = spaceOppositeDot(s, tx, ty, dx, dy);
      if (!opp) continue;
      const oi = idx(s, opp.x, opp.y);
      if (s.flags[oi] & F_TILE_ASSOC) continue;
      addAssoc(s, tx, ty, dx, dy);
      addAssoc(s, opp.x, opp.y, dx, dy);
    }
  }
}

/** Outline a single tile's region edges. Mirrors
 * `outline_tile_fordot(state, tile, true)` after final partition. */
function outlineTileForDot(s: GalaxiesState, tx: number, ty: number): void {
  const ti = idx(s, tx, ty);
  const { edges, tiles } = adjacencies(s, tx, ty);
  for (let n = 0; n < 4; n++) {
    const e = edges[n];
    if (!e) continue;
    const ei = idx(s, e.x, e.y);
    const edgeSet = (s.flags[ei] & F_EDGE_SET) !== 0;
    const t2 = tiles[n];
    let same: boolean;
    if (t2) {
      if (!(s.flags[ti] & F_TILE_ASSOC)) {
        same = !(s.flags[idx(s, t2.x, t2.y)] & F_TILE_ASSOC);
      } else {
        const t2i = idx(s, t2.x, t2.y);
        same =
          (s.flags[t2i] & F_TILE_ASSOC) !== 0 &&
          s.dotx[ti] === s.dotx[t2i] &&
          s.doty[ti] === s.doty[t2i];
      }
    } else {
      same = false;
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
  // All three must be associated; the C reads dotx/doty unguarded,
  // which works because the generator only invokes this after every
  // tile has been associated.
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

/** Top-level: produce a desc string for params. Retries until the
 * solver-verified difficulty matches `diff`. */
export function newGameDesc(
  params: { w: number; h: number; diff: GalaxiesDiff },
  rng: RandomState,
): string {
  const { w, h } = params;

  for (let regen = 0; regen < MAX_REGENERATIONS; regen++) {
    let best: GalaxiesState | null = null;
    let bestW = -1;
    for (let i = 0; i < GENERATE_TRIES; i++) {
      let attempt = blankGame(w, h);
      // Loop until at least two dots (single-dot puzzles are trivial).
      // Bounded so we don't spin if the grid is too small.
      for (let safety = 0; safety < 20; safety++) {
        attempt = blankGame(w, h);
        generatePass(attempt, rng, 100, GP_DOTS);
        attempt.dots = rebuildDots(attempt);
        if (attempt.dots.length >= 2) break;
      }
      const wig = measureWiggliness(attempt);
      if (wig > bestW) {
        bestW = wig;
        best = attempt;
      }
    }
    if (!best) continue;

    // Outline every tile (partition edges).
    for (let y = 1; y < best.sy - 1; y += 2) {
      for (let x = 1; x < best.sx - 1; x += 2) {
        outlineTileForDot(best, x, y);
      }
    }
    // Sanity-check: the generator should produce a complete partition.
    if (!checkComplete(best, false).complete) continue;

    // Now verify difficulty matches by running the solver from a
    // clean state (no associations, no interior edges).
    const probe = cloneState(best);
    clearForSolve(probe);
    const diff = solverState(probe, params.diff);
    if (diff !== params.diff) continue;

    return encodeGame(best);
  }
  throw new Error(`Galaxies generator: gave up after ${MAX_REGENERATIONS} attempts`);
}
