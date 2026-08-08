/**
 * Galaxies association-move helpers, shared by `index.ts`
 * (`executeMove`/`dropDrag`) and `render.ts` (the drag preview) — the
 * `moves.ts` split from docs/games/rendering.md § "A simulated-release
 * preview lives in `moves.ts`". The drag preview shows exactly the
 * association a release would commit, so the renderer and the move
 * path must share one legality predicate; if they drifted, the
 * preview would promise a move the release then refuses.
 */
import {
  addAssoc,
  checkComplete,
  F_DOT,
  F_TILE_ASSOC,
  type GalaxiesState,
  idx,
  inUi,
  removeAssoc,
  SpaceType,
  spaceOppositeDot,
  spaceTypeAt,
  tileOpposite,
} from "./state.ts";

/**
 * Would `addAssocWithOpposite(s, tx, ty, dx, dy)` actually commit?
 * Mirrors upstream's `ok_to_add_assoc_with_opposite` precheck: the
 * target must be an in-grid tile without a dot, its 180° image about
 * the dot must exist and be dot-free, and neither tile may sit inside
 * a locally-valid (coloured) region. Safe on arbitrary coordinates —
 * the drag target tracks the raw pointer, which can be off the board.
 *
 * `cols` is the completion check's per-tile colour array; pass it when
 * the caller (the renderer) already has one, or omit it to compute.
 */
export function okToAddAssocWithOpposite(
  s: GalaxiesState,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
  cols?: Int8Array,
): boolean {
  if (!inUi(s, tx, ty) || spaceTypeAt(tx, ty) !== SpaceType.Tile) return false;
  if (s.flags[idx(s, tx, ty)] & F_DOT) return false;
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp) return false;
  if (s.flags[idx(s, opp.x, opp.y)] & F_DOT) return false;
  const colours = cols ?? checkComplete(s, true).colours;
  if (!colours) return false;
  if (colours[((ty - 1) >> 1) * s.w + ((tx - 1) >> 1)]) return false;
  if (colours[((opp.y - 1) >> 1) * s.w + ((opp.x - 1) >> 1)]) return false;
  return true;
}

/** Mirrors `add_assoc_with_opposite`: adds (tile, dot) and (opposite,
 * dot) atomically; no-ops if the precheck refuses. */
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
  // Mirror upstream: drop the OLD opposite associations first.
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
