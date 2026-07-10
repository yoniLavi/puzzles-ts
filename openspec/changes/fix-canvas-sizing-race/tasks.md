## 1. Confirm the root cause at the first resize

- [ ] 1.1 Instrument `getAvailableCanvasSize()` / `resize()` to log their inputs at the **first**
      call on load (host box, content.offsetWidth, canvas.offsetWidth, computed available, and the
      `size()` result). Confirm whether the premature value is the host box or the content/canvas
      offsets during the async canvas attach (evidence in design.md points at the offsets).

## 2. Implement the fix (approach A first; see design.md)

- [ ] 2.1 Recompute the size right after the canvas attaches (in/after `createCanvas()`, once
      `canvasReady`) — the moment the first measurement was premature. Ensure it feeds a settled
      `getAvailableCanvasSize`.
- [ ] 2.2 If A alone is insufficient, add the content/canvas element to the `ResizeController`
      (approach B), guarding against a resize loop (rely on the `changed` check + throttle; assert
      convergence).
- [ ] 2.3 Only if still racy: make `getAvailableCanvasSize` absolute rather than incremental
      (approach C).

## 3. Guard against regression

- [ ] 3.1 Add a load-time check that a freshly-loaded board reaches its expected size **without**
      any synthetic resize event (Playwright smoke, or an in-process check if feasible). The repro
      from this investigation: at a wide viewport the board must not stay clamped at the tiny
      first-measure size.
- [ ] 3.2 Verify existing behaviour is unchanged: window-resize still resizes; `maxScale` clamp
      still holds; `puzzle-view-interactive.test.ts` green.

## 4. Verify + ship

- [ ] 4.1 Full gate (`tsc` → biome → `vitest` → `vite build`).
- [ ] 4.2 Dev-verify: edit a Lit component (forces a full page reload) and confirm the board
      returns full-size with **no** manual window resize, across a couple of games (not just
      dominosa) and both orientations.
- [ ] 4.3 Owner acceptance → commit + `openspec archive fix-canvas-sizing-race`.
