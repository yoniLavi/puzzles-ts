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

- [ ] 5.1 Run `npm run dev`, exercise board-shape changes (3×3 ↔
  4×4 ↔ 5×5, Crosses + Random). Confirm no black canvas on shape
  change.
- [ ] 5.2 Play several moves on each shape, watch animated
  transitions. Confirm no "everything flickers" overpaint on
  unrelated cells. Specifically test on the device that surfaced
  the regression (likely mobile, where the address bar's
  show/hide was probably the ResizeController trigger).
- [ ] 5.3 Toggle light/dark mode during play. Confirm the canvas
  repaints cleanly with the new palette (no stale colours, no
  black region remaining).
- [ ] 5.4 Trigger a browser-window resize. Confirm clean repaint
  (this exercises the `canvasCleared` path).
- [ ] 5.5 Update `project_first_port_next.md` and `AGENTS.md`'s
  Flip bullet to reflect parity status after owner sign-off. If
  still pending after this round, say so honestly.
