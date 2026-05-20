# Change: Fix Flip parity-blockers — black canvas on reshape and animated-move flicker

## Why

Two rendering defects block Flip parity sign-off (reported
2026-05-19, session-end; flicker re-reported 2026-05-20 after a first
attempt made it worse):

1. **Full-black canvas when switching to a new board shape**, until
   the first click forced a repaint. Root cause: on a reshape,
   `Drawing.resize` clears the OffscreenCanvas to opaque black
   (`alpha:false` default), and the subsequent `Midend.redraw` ran
   with a stale per-tile cache that suppressed the grid-line and
   border repaint. Flip's `setTileSize` only invalidated its cache
   when the tile size actually *changed* — and at typical viewports
   3×3, 4×4 and 5×5 Crosses all pick the same tile (48), so the
   invalidation never fired.

2. **"Everything flickers" after the first-attempt fix**
   (`9823acd`). That commit mirrored `midend.c`'s pattern of
   recreating the drawstate on every `midend_size` and filling the
   whole canvas with palette index 0 on first-draw. Faithful to
   upstream, but wrong for our frontend: `puzzle-view.ts`'s
   `ResizeController` calls `puzzle.size()` on *any* element-size
   change (CSS transitions, mobile address-bar show/hide, layout
   shifts), so every such tick wiped the per-tile cache and flashed
   a full-window overpaint on the next animation frame.

The diagnosis after the first attempt: `midend_size`'s "recreate
drawstate" step is a side effect that assumes the frontend only calls
`size()` on real window resizes. Our frontend doesn't. The actual
canvas-invalidation signal is `Drawing.resize` — i.e. the
adapter's `resizeDrawing` — not `size()`.

Both bugs fall under the parity-gated-registration doctrine
(`add-parity-gated-registration`): a rendering shortfall is a parity
regression, not "cosmetic". Flip remains parity-pending.

## What Changes

- **MODIFIED `ts-engine`** — `Midend.size()` becomes purely
  informational (no drawstate side-effects). A new
  `EngineCore.canvasCleared()` is the explicit signal that the
  canvas backing store has been reset (per-tile caches stale).
  `forceRedraw(dr)` keeps its role for palette/font replacement
  (canvas not cleared, but cached colour/font choices are stale).
  **The engine no longer paints pixels of its own** — the
  whole-canvas background fill that briefly lived in
  `Midend.redraw` moved into each game's existing `!ds.started`
  branch, where it belongs. The framework reconciles *when* to call
  `game.redraw`; the game owns *what* is painted.
- `TsWorkerPuzzle.resizeDrawing` invokes `engine.canvasCleared()`
  after `Drawing.resize` (the real canvas-clearing path).
  `setDrawingPalette` / `setDrawingFontInfo` still invoke
  `forceRedraw` on replacement.
- Flip's `redraw` paints `drawRect(0, 0, winW, winH, COL_BACKGROUND)`
  in its `!ds.started` branch — one line of game code instead of an
  engine-emitted overpaint.
- New behavioural tests lock the contract: `size()` is pure (no
  drawstate-identity change, no bg-fill side-effect on next redraw);
  `canvasCleared()` is the only thing that invalidates; the engine
  emits no draw ops of its own.
- Removes the obsolete `firstDraw: boolean` engine field — `ds.started`
  is the canonical signal, owned by each game.

## Impact

- Affected spec: `ts-engine`.
- Affected code: `src/native/engine/midend.ts`,
  `src/native/engine/worker-adapter.ts`,
  `src/native/games/flip/index.ts`,
  `src/native/engine/fake-game.ts` (tracks `started` to mirror real
  games' first-paint contract),
  `src/native/engine/midend.test.ts`,
  `src/native/games/flip/flip.test.ts`.
- Compatibility: pure addition (`canvasCleared`) + side-effect
  removal from `size()`; no app, save, or game-port change beyond
  Flip's one-line `!ds.started` bg paint.
- Parity: closes the two reported Flip parity blockers; Flip parity
  remains owner-acceptance-gated. The architectural direction
  established here (engine emits no pixels, games describe pixels)
  is the precursor to the scene-graph contract being scaffolded
  separately under `scaffold-scene-graph-game-contract`.
