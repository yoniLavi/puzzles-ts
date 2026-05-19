# Tasks

## 1. Engine first-draw + force-redraw

- [x] 1.1 Add `firstDraw: boolean` (default `true`), `winSize: Size`,
  and `drawStateSized: boolean` fields to `Midend`. `winSize` tracks
  the most-recent `computeSize(params, tile)` result so the
  first-draw fill knows what to cover. `drawStateSized` mirrors
  midend.c's `me->drawstate && me->tilesize > 0` check.
- [x] 1.2 In `Midend.size()`: when a sized drawstate already exists,
  drop it and create a fresh one via `game.newDrawState`. Apply
  `setTileSize` to the new drawstate. Set `firstDraw = true`. Cache
  the result as `winSize`.
- [x] 1.3 In `Midend.redraw(dr)`: when `firstDraw`, fill the entire
  window (colour index 0) before invoking `game.redraw`, and emit a
  full-window `drawUpdate` after. Then set `firstDraw = false`.
- [x] 1.4 Drop the early `requestRedraw()` call in `Midend.startFrom`:
  the app drives the first post-newGame paint through its reactive
  flow (size → resizeDrawing → redraw), and the early call was
  painting into a possibly-stale, possibly-cleared canvas. (Kept
  the redraws in `restartGame`, `loadGame`'s `afterTransition`, and
  the `applyMove` UI_UPDATE path — those have no resize step.)
- [x] 1.5 Add `EngineCore.forceRedraw(dr)`: equivalent to
  `midend_force_redraw` — recreates the drawstate (with `setTileSize`
  on the new ds), sets `firstDraw = true`, then runs the normal
  redraw.

## 2. Adapter wiring

- [x] 2.1 `TsWorkerPuzzle.setDrawingPalette`: when
  `drawing.setPalette` reports the palette was changed
  (already-installed palette being replaced), call
  `engine.forceRedraw(drawing)` via a private `forceRedraw` helper
  instead of the plain `redraw`.
- [x] 2.2 `TsWorkerPuzzle.setDrawingFontInfo`: same treatment when
  `drawing.setFontInfo` reports a font change.
- [x] 2.3 No-op for `resizeDrawing`: `Midend.size` is always called
  before `resizeDrawing` on the app's reshape path
  (`puzzle-view.resize`), so the drawstate is already fresh and
  `firstDraw=true` by the time the post-resize redraw fires.

## 3. Test coverage

- [x] 3.1 Extended the fake game
  (`src/native/engine/fake-game.ts`) with `newDrawState`,
  `setTileSize`, and a minimal `redraw` plus a per-drawstate
  `instance` counter so tests can prove a fresh drawstate was
  constructed (vs. mutated in place).
- [x] 3.2 Engine tests (`Midend size + first-draw`): assert that
  the first redraw after `size()` fills the window with palette
  index 0 and emits a full-window `drawUpdate`; that a second
  `size()` recreates the drawstate (new `instance`) and re-arms
  first-draw; that subsequent redraws without an intervening
  `size()` do NOT refill.
- [x] 3.3 Engine tests (`Midend forceRedraw`): the API recreates
  the drawstate, paints the background fill rectangle, and is a
  defensive no-op without a game.
- [x] 3.4 Engine test (`Midend startFrom no longer fires an early
  redraw`): `newGame` emits notifications but does not request a
  redraw — locking in the doctrine that the app drives the first
  paint via its reactive flow.
- [x] 3.5 Flip test (`Flip reshape ... shapes share a tile size`):
  the exact bug-1 reproducer — switch 3×3 ↔ 5×5 Crosses at a
  viewport where both pick tile=48, redraw the new game, and
  assert the full-window background-fill rect and the new grid
  lines are present (proves the per-tile cache from the previous
  game can't suppress the reshape repaint).
- [x] 3.6 Full pre-commit gate: `tsc -b --noEmit` → biome lint →
  `vitest run` (432 tests pass, was 424) → `vite build`.

## 4. Owner acceptance

- [ ] 4.1 Run `npm run dev`, exercise board-shape changes (3×3 ↔
  4×4 ↔ 5×5, Crosses + Random), and confirm no black canvas after
  a shape change.
- [ ] 4.2 Same session: play several moves, watch animated
  transitions, confirm no flicker on cells that did not change.
  If a real animation artefact persists after fix 1, surface it
  explicitly — do **not** defer as cosmetic.
- [ ] 4.3 Update `project_first_port_next.md` and `AGENTS.md`'s
  Flip bullet to reflect parity status after sign-off; if still
  pending, say so.
