/**
 * The draw state a game would have been handed, for a test that calls
 * `interpretMove` or `redraw` directly.
 *
 * `Game.interpretMove`'s `ds` is non-null and already sized — the midend
 * creates it and applies `setTileSize` in one step (`Midend.freshDrawState`).
 * A test driving the game without a `Midend` has to reproduce that, and the
 * two lines are easy to write as one: passing an *unsized* drawstate leaves
 * `tilesize` at whatever `newDrawState` initialized (usually `0`), and the
 * game then maps every pointer coordinate onto cell (0, 0) — a test that
 * fails for a reason that has nothing to do with what it is testing.
 *
 * Before `audit-vestigial-contract-surface` these call sites passed `null`,
 * which the interface allowed and every game absorbed with a
 * `ds?.tilesize ?? PREFERRED_TILE_SIZE` fallback. That made the tests the
 * fallback's only callers: they asserted coordinate mapping against a branch
 * the engine cannot reach, and the branch read as protection for a case that
 * could not occur.
 *
 * Default tile size is the game's own preferred one, which is what a freshly
 * dealt board is laid out at before any resize. Pass `tileSize` for a test
 * that needs a specific one.
 */

import type { Game } from "../game.ts";

export function sizedDrawState<Params, State, Move, Ui, DrawState>(
  game: Game<Params, State, Move, Ui, DrawState>,
  state: State,
  tileSize: number = game.preferredTileSize ?? 32,
): DrawState {
  const ds = game.newDrawState(state);
  game.setTileSize?.(ds, tileSize);
  return ds;
}
