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
  adjacencies,
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
  tilesFromEdge,
} from "./state.ts";

/**
 * The tiles a dot physically sits on: one for a dot at a tile's center, the
 * two it separates for a dot on an edge, the four it meets for a dot on a
 * vertex. Every one of them is in that dot's galaxy by definition — the
 * region contains its dot — which is what makes them a *rule* of the game
 * rather than a deduction, and therefore safe to reason from.
 */
function dotTiles(
  s: GalaxiesState,
  dx: number,
  dy: number,
): { x: number; y: number }[] {
  const t = spaceTypeAt(dx, dy);
  if (t === SpaceType.Tile) return [{ x: dx, y: dy }];
  if (t === SpaceType.Edge) {
    const [a, b] = tilesFromEdge(s, dx, dy);
    return [a, b].filter((v): v is { x: number; y: number } => v !== null);
  }
  return [
    { x: dx - 1, y: dy - 1 },
    { x: dx + 1, y: dy - 1 },
    { x: dx - 1, y: dy + 1 },
    { x: dx + 1, y: dy + 1 },
  ].filter((v) => inUi(s, v.x, v.y));
}

/**
 * Which tiles could share a galaxy with the dot at `(dx, dy)` — a flood fill
 * outward from the dot's own tiles, in **mirror pairs**, blocked only by
 * another dot's own tiles and by the board's edge.
 *
 * This exists because `okToAddAssocWithOpposite` alone is too lenient to be
 * honest. Upstream's precheck asks only whether the tile and its 180° image
 * are in-grid and dot-free, so it will happily accept an arrow for a cell no
 * galaxy centered on that dot could ever contain — owner-reported 2026-08-08,
 * with a cell two steps from its dot whose only routes were cut off. A
 * galaxy is a *connected* region, so connectivity is as much a rule as
 * symmetry is, and a preview that ignores it promises a move the puzzle
 * cannot honor.
 *
 * Two deliberate limits keep this a statement of the rules rather than a
 * solver:
 *
 *  - **It blocks only on other dots' own tiles**, which are forced by the
 *    dot layout alone. Anything further — running the deduction chain — would
 *    narrow the offer towards the unique solution, and on a uniquely-solvable
 *    board a sufficiently clever predicate offers exactly one dot per cell,
 *    which is not an aid but an answer.
 *  - **It ignores the player's own walls and arrows.** Respecting them would
 *    be *consistent* but would let one mistake silently veto a correct arrow
 *    somewhere else, with nothing on screen to explain the refusal. Depending
 *    only on the dots means the predicate can never reject an association the
 *    real solution contains — asserted in `galaxies.test.ts` over generated
 *    boards, which is the property that makes tightening safe at all.
 */
export function reachableFromDot(s: GalaxiesState, dx: number, dy: number): Uint8Array {
  const reached = new Uint8Array(s.sx * s.sy);
  // A tile is unusable if some *other* dot sits on it.
  const blocked = new Uint8Array(s.sx * s.sy);
  for (const d of s.dots) {
    if (d.x === dx && d.y === dy) continue;
    for (const tile of dotTiles(s, d.x, d.y)) blocked[idx(s, tile.x, tile.y)] = 1;
  }

  const queue: { x: number; y: number }[] = [];
  const admit = (tx: number, ty: number): boolean => {
    if (!inUi(s, tx, ty) || spaceTypeAt(tx, ty) !== SpaceType.Tile) return false;
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
      if (!opp || !inUi(s, opp.x, opp.y)) continue;
      if (blocked[idx(s, opp.x, opp.y)]) continue;
      admit(n.x, n.y);
      admit(opp.x, opp.y);
    }
  }
  return reached;
}

/**
 * Would `addAssocWithOpposite(s, tx, ty, dx, dy)` actually commit?
 * Mirrors upstream's `ok_to_add_assoc_with_opposite` precheck: the
 * target must be an in-grid tile without a dot, its 180° image about
 * the dot must exist and be dot-free, and neither tile may sit inside
 * a locally-valid (colored) region. Safe on arbitrary coordinates —
 * the drag target tracks the raw pointer, which can be off the board.
 *
 * On top of upstream, the tile must also be **reachable** from the dot —
 * see {@link reachableFromDot}. Upstream's precheck is a local test and so
 * accepts arrows no galaxy could ever justify; ours refuses them, which is a
 * deliberate divergence on the input path only. Nothing in the generator or
 * the solver reaches this module, so no board changes.
 *
 * `cols` is the completion check's per-tile color array, and `reach` the
 * dot's reachable set; pass either when the caller already has one (the
 * renderer has both), or omit to compute.
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
  if (!inUi(s, tx, ty) || spaceTypeAt(tx, ty) !== SpaceType.Tile) return false;
  if (s.flags[idx(s, tx, ty)] & F_DOT) return false;
  const opp = spaceOppositeDot(s, tx, ty, dx, dy);
  if (!opp) return false;
  if (s.flags[idx(s, opp.x, opp.y)] & F_DOT) return false;
  const colors = cols ?? checkComplete(s, true).colors;
  if (!colors) return false;
  if (colors[((ty - 1) >> 1) * s.w + ((tx - 1) >> 1)]) return false;
  if (colors[((opp.y - 1) >> 1) * s.w + ((opp.x - 1) >> 1)]) return false;
  // The reachable set is symmetric about the dot, so testing the tile also
  // tests its 180° image.
  const reachable = reach ?? reachableFromDot(s, dx, dy);
  if (!reachable[idx(s, tx, ty)]) return false;
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

/**
 * Every dot the tile `(tx, ty)` could legally be associated with — the
 * candidate set the drag rings show, and the set a cell→dot drag snaps
 * within. It is `okToAddAssocWithOpposite` swept over the dots, for the same
 * reason this module exists at all: the ring must mark exactly what a release
 * would accept, so ring, snap and commit cannot drift.
 */
export function legalDotsFor(
  s: GalaxiesState,
  tx: number,
  ty: number,
): { x: number; y: number }[] {
  if (!inUi(s, tx, ty) || spaceTypeAt(tx, ty) !== SpaceType.Tile) return [];
  const cols = checkComplete(s, true).colors;
  if (!cols) return [];
  return s.dots.filter((d) =>
    okToAddAssocWithOpposite(s, tx, ty, d.x, d.y, cols, reachableFromDot(s, d.x, d.y)),
  );
}
