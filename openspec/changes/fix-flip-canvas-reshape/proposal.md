# Change: Fix Flip parity-blockers — black canvas on reshape and animated-move flicker

## Why

Two rendering defects block Flip parity sign-off (reported 2026-05-19,
session-end):

1. **Full-black canvas when switching to a new board shape**, until the
   first click forces a repaint. Root cause (traced 2026-05-20): on a
   reshape, the worker's `Drawing.resize()` clears the OffscreenCanvas
   to black (`alpha:false` default), and the subsequent `Midend.redraw`
   may run with a stale `DrawState` whose per-tile cache and
   `started=true` flag suppress the grid-line and border repaint. The
   TS midend lacks two pieces that upstream's `midend.c` has:
   - `midend_size` recreates the drawstate when a sized one already
     exists, and sets `first_draw=true`.
   - `midend_redraw` honours `first_draw` by filling the whole window
     with background colour 0 *before* calling `game.redraw`, then
     emitting a full-window `drawUpdate` afterwards.

   Flip's `setTileSize` does invalidate `ds.started`/`ds.tiles` — but
   only when the tile size actually changes. When two different board
   shapes happen to pick the same tile size (very common: tile 48 fits
   3×3, 4×4, and 5×5 boards at typical viewports), `setTileSize` is a
   no-op, the cleared canvas is never refilled, and the border + grid
   lines never repaint.

2. **Flicker on cells the user perceives as "untouched" after a move.**
   The most likely contributor is the animation polygon outline
   (`COL_GRID`) bleeding to the tile edges of animating cells (the
   click target + its crosses-neighbours, which the user may not
   register as "moving"), against a canvas border that's been
   uninitialised since attach. Fixing #1 (proper background fill +
   full-canvas drawUpdate) repaints the border and grid lines on the
   next post-reshape redraw and is expected to address most or all of
   the perceived flicker. Any residue is then a real animation
   artefact to address explicitly, not by guessing.

Both fall under the parity-gated-registration doctrine
(`add-parity-gated-registration`): a rendering shortfall is a parity
regression, not "cosmetic". Flip remains parity-pending; closing these
two is the gate.

## What Changes

- **MODIFIED `ts-engine`** — the engine SHALL provide upstream
  midend.c's `first_draw` semantics: `Midend.size()` drops and
  recreates the per-game draw state and arms a first-draw flag;
  `Midend.redraw()` paints the full window with background colour 0
  before calling `game.redraw` whenever the flag is armed, and emits a
  full-window `drawUpdate` after. A `forceRedraw` API surfaces the
  same reset so palette and font-info changes (which today silently
  trip a stale-drawstate redraw) repaint from scratch.
- The worker adapter (`TsWorkerPuzzle`) SHALL invoke `forceRedraw`
  after a `setDrawingPalette` that changes an existing palette and
  after `setDrawingFontInfo` that changes the font — matching the
  C-path's `frontend.forceRedraw()` calls (`puzzles/webapp.cpp`).
- Code change in `src/native/engine/midend.ts` + `worker-adapter.ts`;
  Flip's `setTileSize` remains correct as-is.
- New behavioural tests in `src/native/engine/midend.test.ts` cover
  the reshape→repaint contract and the force-redraw path. Flip's
  redraw tests gain a regression for the per-tile cache after a
  reshape so the bug-1 scenario is locked in.

## Impact

- Affected spec: `ts-engine`.
- Affected code: `src/native/engine/midend.ts`,
  `src/native/engine/worker-adapter.ts`, the fake `Game` used by tests
  (gains a minimal `newDrawState`/`redraw` to exercise the new
  contract), `src/native/engine/midend.test.ts`,
  `src/native/games/flip/flip.test.ts`.
- Compatibility: pure addition to the engine surface; no app, save, or
  game-port change beyond the regression tests.
- Parity: closes the two Flip parity blockers; Flip parity remains
  owner-acceptance-gated, but the rendering paths the owner reported
  are now covered.
