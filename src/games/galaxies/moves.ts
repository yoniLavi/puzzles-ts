/**
 * The association moves, shared by `index.ts` and the drag preview in
 * `render.ts` (docs/games/rendering.md § "A simulated-release preview lives in
 * `moves.ts`"). The preview must show exactly the association a release
 * commits, so both go through one legality predicate.
 */
import type { Point } from "../../engine/types.ts";
import {
  addAssoc,
  adjacencies,
  checkComplete,
  dotTiles,
  F_DOT,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  inInterior,
  removeAssoc,
  SpaceType,
  spaceOppositeDot,
  spaceTypeAt,
  tileOpposite,
} from "./state.ts";

/**
 * The tiles that could share a galaxy with the dot at `(dx, dy)`: a flood fill
 * outward from the dot's own tiles, in mirror pairs, blocked only by other
 * dots' own tiles and by the board's edge.
 *
 * Upstream's precheck asks only whether a tile and its 180° image are on the
 * board and dot-free, so it accepts arrows for cells no galaxy centered on that
 * dot could contain. A galaxy is connected, so connectivity is as much a rule
 * as symmetry, and a preview that ignores it promises a move the puzzle cannot
 * honor.
 *
 * Two limits keep this a statement of the rules rather than a solver:
 *
 *  - **It blocks only on other dots' own tiles**, which the dot layout alone
 *    forces. Anything further narrows the offer toward the unique solution,
 *    and a clever enough predicate offers exactly one dot per cell, which is
 *    an answer rather than an aid.
 *  - **It ignores the player's own walls and arrows**, so one mistake cannot
 *    silently veto a correct arrow elsewhere. Depending only on the dots means
 *    it never rejects an association the solution contains, which
 *    `galaxies.test.ts` asserts over generated boards.
 */
export function reachableFromDot(s: GalaxiesState, dx: number, dy: number): Uint8Array {
  const reached = new Uint8Array(s.sx * s.sy);
  // A tile is unusable if some *other* dot sits on it.
  const blocked = new Uint8Array(s.sx * s.sy);
  for (const d of s.dots) {
    if (d.x === dx && d.y === dy) continue;
    for (const tile of dotTiles(s, d.x, d.y)) blocked[idx(s, tile.x, tile.y)] = 1;
  }

  const queue: Point[] = [];
  const admit = (tx: number, ty: number): boolean => {
    if (!inInterior(s, tx, ty) || spaceTypeAt(tx, ty) !== SpaceType.Tile) return false;
    const i = idx(s, tx, ty);
    if (reached[i] || blocked[i]) return false;
    reached[i] = 1;
    queue.push({ x: tx, y: ty });
    return true;
  };
  for (const tile of dotTiles(s, dx, dy)) admit(tile.x, tile.y);

  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head];
    for (const n of adjacencies(s, x, y).tiles) {
      if (!n) continue;
      const i = idx(s, n.x, n.y);
      if (reached[i] || blocked[i]) continue;
      // Symmetry makes this a pair move: a tile can only join the galaxy if
      // its 180° image can join too, so a neighbor whose image is off the
      // board or under another dot is not reachable however open it looks.
      const opp = spaceOppositeDot(s, n.x, n.y, dx, dy);
      if (!opp || !inInterior(s, opp.x, opp.y)) continue;
      if (blocked[idx(s, opp.x, opp.y)]) continue;
      admit(n.x, n.y);
      admit(opp.x, opp.y);
    }
  }
  return reached;
}

/**
 * Would `addAssocWithOpposite(s, tx, ty, dx, dy)` commit? Upstream's
 * `ok_to_add_assoc_with_opposite`: the target is an on-board tile without a
 * dot, its 180° image about the dot exists and is dot-free, and neither sits in
 * a locally valid (colored) region. Safe on any coordinates, since a drag
 * target tracks the raw pointer.
 *
 * On top of upstream, the tile must be reachable from the dot
 * ({@link reachableFromDot}). Only input reaches this module, never the
 * generator or the solver, so no board changes.
 *
 * Pass `cols` (the completion check's colors) or `reach` when the caller
 * already has them.
 */
export function okToAddAssocWithOpposite(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
  cols?: Int8Array,
  reach?: Uint8Array,
): boolean {
  if (!inInterior(s, tx, ty) || spaceTypeAt(tx, ty) !== SpaceType.Tile) return false;
  if (s.flags[idx(s, tx, ty)] & F_DOT) return false;
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp) return false;
  if (s.flags[idx(s, opp.x, opp.y)] & F_DOT) return false;
  const colors = cols ?? checkComplete(s, true).colors;
  if (!colors) return false;
  if (colors[((ty - 1) >> 1) * s.w + ((tx - 1) >> 1)]) return false;
  if (colors[((opp.y - 1) >> 1) * s.w + ((opp.x - 1) >> 1)]) return false;
  // The reachable set is symmetric about the dot, so this tests the image too.
  return (reach ?? reachableFromDot(s, dx, dy))[idx(s, tx, ty)] === 1;
}

/** Upstream's `add_assoc_with_opposite`: associate the tile and its 180° image
 * with the dot, or do nothing if the precheck refuses. */
export function addAssocWithOpposite(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): void {
  if (!okToAddAssocWithOpposite(s, tx, ty, dx, dy)) return;
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp) return;
  // Each tile's old partner loses its association first.
  removeAssocWithOpposite(s, tx, ty);
  addAssoc(s, tx, ty, dx, dy);
  removeAssocWithOpposite(s, opp.x, opp.y);
  addAssoc(s, opp.x, opp.y, dx, dy);
}

export function removeAssocWithOpposite(
  s: GalaxiesState,
  tx: number,
  ty: number,
): void {
  const ti = idx(s, tx, ty);
  if (!(s.flags[ti] & F_TILE_ASSOC)) return;
  const opp = tileOpposite(s, tx, ty);
  removeAssoc(s, tx, ty);
  if (opp && (opp.x !== tx || opp.y !== ty)) {
    removeAssoc(s, opp.x, opp.y);
  }
}

/**
 * Every dot the tile could legally join: the candidate rings a cell→dot drag
 * shows, and the set it snaps within. It is `okToAddAssocWithOpposite` swept
 * over the dots, so ring, snap and commit cannot drift.
 */
export function legalDotsFor(s: GalaxiesState, tx: number, ty: number): Point[] {
  if (!inInterior(s, tx, ty) || spaceTypeAt(tx, ty) !== SpaceType.Tile) return [];
  const cols = checkComplete(s, true).colors;
  if (!cols) return [];
  return s.dots.filter((d) =>
    okToAddAssocWithOpposite(s, tx, ty, d.x, d.y, cols, reachableFromDot(s, d.x, d.y)),
  );
}
