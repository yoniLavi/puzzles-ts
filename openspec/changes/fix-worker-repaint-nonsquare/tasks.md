# Tasks — fix-worker-repaint-nonsquare

## 1. Reproduce and diagnose (the mechanism is not yet known)

- [ ] 1.1 Reproduce with the app running: `/loopy?type=5x4t9dh` (and
      `?type=5x4t14dh`) stays blank on first load; the same params from the Type
      menu paint immediately. Confirm on a second TS game (Pearl, a non-square
      preset) and confirm a C/WASM game does NOT reproduce.
- [ ] 1.2 Instrument the sequence for a *non-square* deep-link board: log the
      order and arguments of `Midend.size`, the adapter's `resizeDrawing` /
      `engine.canvasCleared`, `setDrawingPalette`, and every `redraw` /
      `forceRedraw`. Capture the same trace for (a) a square deep-link board that
      paints, and (b) the working in-app menu path.
- [ ] 1.3 Identify which repaint is dropped and why — the hypothesis is that a
      board whose aspect ratio differs from the layout slot receives a *second*
      resize after the app's first paint, so the last operation to touch the
      canvas is the clear (`canvasCleared` drops the drawstate) with no repaint
      following. Confirm or replace this hypothesis from the trace before coding.

## 2. Fix at the adapter/midend seam

- [ ] 2.1 Apply the fix the diagnosis points to (likely: ensure the
      resize/clear path that drops the drawstate is always followed by a repaint,
      OR that the first post-generation frame cannot be lost to a resize that
      arrives after it). Keep it at the `worker-adapter.ts` / `midend.ts` seam.
- [ ] 2.2 Do NOT reintroduce framework-emitted pixels — the "engine emits no
      pixels of its own" invariant and the informational-only `Midend.size`
      contract both stay intact. The fix schedules a *game* repaint; it does not
      paint a background itself.
- [ ] 2.3 Confirm the earlier first-palette-install fix (already shipped in the
      Loopy commit) still stands and is not duplicated.

## 3. Regression test

- [ ] 3.1 Extend `worker-adapter.test.ts` to drive the real first-load ordering
      for a non-square, fast-generation board — the resize/clear/palette/redraw
      interleaving that reproduces the bug — and assert exactly one game repaint
      reaches the canvas. Verify the test FAILS without the §2 fix (as the
      first-install test does).

## 4. Spec + close out

- [ ] 4.1 The `ts-engine` first-frame-repaint requirement (this change's spec
      delta) is satisfied by the fix + test.
- [ ] 4.2 Dev-verify: every previously-blank deep link now paints on first load,
      across a few tilings/games, square and non-square.
- [ ] 4.3 Full gate green; `openspec validate fix-worker-repaint-nonsquare
      --strict`.
- [ ] 4.4 Archive, then commit.
