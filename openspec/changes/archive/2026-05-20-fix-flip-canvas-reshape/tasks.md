# Tasks

## 1. Engine: side-effect-free size, explicit canvasCleared

- [x] 1.1 `Midend.size(maxSize, ...)` is now informational only.
  Computes `winSize` + `currentTileSize` and calls
  `game.setTileSize(ds, tile)` on the existing drawstate (which
  Flip's setTileSize treats as a no-op when unchanged). NO drawstate
  recreation, NO firstDraw arming.
- [x] 1.2 Added `EngineCore.canvasCleared()`: discards the
  per-game drawstate and constructs a fresh one via
  `game.newDrawState`, applying `setTileSize`. The next `redraw`
  sees `!ds.started` and the game paints fresh.
- [x] 1.3 `Midend.forceRedraw(dr)` simplifies to
  `canvasCleared() + redraw(dr)`; the engine no longer emits the
  whole-canvas bg fill — that's now the game's job in its
  `!ds.started` branch.
- [x] 1.4 Removed the `firstDraw` engine field and the engine's
  `drawRect(0,0,winW,winH,0)` / full-window `drawUpdate`. The
  framework now emits only `startDraw`/`endDraw` around
  `game.redraw`.

## 2. Adapter: invalidation on resizeDrawing

- [x] 2.1 `TsWorkerPuzzle.resizeDrawing` calls
  `engine.canvasCleared()` immediately after `Drawing.resize`. This
  is the only path that actually clears the canvas backing store.
- [x] 2.2 `setDrawingPalette` / `setDrawingFontInfo` continue to call
  `forceRedraw` on replacement (canvas not cleared but cached
  colour/font choices stale).

## 3. Flip game: paint its own background

- [x] 3.1 Flip's `redraw` paints `drawRect(0, 0, winW, winH,
  COL_BACKGROUND)` as the first op in its `!ds.started` branch,
  before the grid lines. One added line of game code; matches
  upstream's responsibility split (the game knows what its
  background should be).

## 4. Tests

- [x] 4.1 Extended `fake-game.ts` to track `ds.started` and paint a
  one-off `drawRect` in its `!ds.started` branch — mirrors how every
  real game's `redraw` is structured, so the engine contract can be
  asserted without depending on Flip-specific paths.
- [x] 4.2 New engine tests (`Midend.size is purely informational`):
  size() returns sensible dims; calling it repeatedly does not
  change drawstate identity; even with different sizes the drawstate
  identity is preserved; a redraw after only `size()` calls preserves
  the per-tile cache (no bg fill emitted).
- [x] 4.3 New engine tests (`Midend.canvasCleared invalidates the
  drawstate`): drawstate instance changes, the next redraw triggers
  the game's `!ds.started` branch.
- [x] 4.4 New engine tests (`Midend.forceRedraw is canvasCleared +
  redraw`): drawstate instance changes + the game's bg paint runs.
- [x] 4.5 New engine test (`Engine emits no pixels of its own`):
  `Midend.redraw` with `ds.started=true` emits ONLY
  `startDraw`/`endDraw` — every other op comes from the game.
- [x] 4.6 Updated Flip reshape regression: `canvasCleared` (which
  the app's `resizeDrawing` invokes) is what makes the bg + grid
  lines repaint on a same-tile reshape.
- [x] 4.7 Pre-commit gate green: `tsc -b --noEmit` → biome lint →
  `vitest run` (436 tests, up from 432) → `vite build`.

## 5. Owner acceptance

Confirmed working 2026-05-20 by the owner ("Fabulous - it works
now"). One additional state-machine fix landed during the
acceptance cycle: `b1b0dd6` (the flashTime reset). All four
behaviour checks below were exercised in that round; the
documentation update is the wrap-up.

- [x] 5.1 Board-shape changes (3×3 ↔ 4×4 ↔ 5×5, Crosses + Random):
  no black canvas on shape change.
- [x] 5.2 Animated moves with no "wave/overpaint" on unrelated
  cells. The remaining wave-through-cells the owner reported was a
  distinct state-machine bug (flashTime accumulating during
  non-solving moves), fixed in `b1b0dd6` with regression tests.
- [x] 5.3 Light/dark toggle repaints cleanly via `forceRedraw`.
- [x] 5.4 Browser resize / ResizeController firings no longer
  cause spurious cache wipes (the size()-is-informational fix).
- [x] 5.5 `AGENTS.md`'s Flip bullet and
  `project_first_port_next.md` updated to "owner-confirmed parity
  2026-05-20".
