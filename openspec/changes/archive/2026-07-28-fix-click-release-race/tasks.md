# Tasks — fix-click-release-race

> **Diagnosis is already complete** (`add-spokes-ts-port` design F6). The
> mechanism is identified, reproduced on both engines, and ruled out at the
> game level. What remains is the fix, its test, and a verification pass.

## 1. Confirm the repro before changing anything

- [x] 1.1 Reproduce in the running app: open any game with a press-driven
      overlay (Spokes is clearest — a press paints a green `COL_HOLDING` rim),
      drive `mouse.down()` immediately followed by `mouse.up()`, and observe the
      overlay persisting until the next input.
- [x] 1.2 Confirm the game is not at fault: a press then a release through a
      real `Midend` clears the overlay (this already passes for Spokes), and the
      **C/WASM** build of the same game shows the identical symptom.

## 2. Close the window in `puzzle-view-interactive.ts`

- [x] 2.1 Retain a `pointerup` / `pointercancel` that arrives while the press's
      `processMouse` promise is still pending, keyed on `pointerId`, and replay
      it once `pointerTracking` is installed — mirroring the existing
      `unhandledEvent` replay that already covers the `detectSecondaryButton`
      await.
- [x] 2.2 Guarantee exactly-once delivery: never zero releases (the bug), never
      two (a replayed release plus a real one). Keep the declined-press path's
      immediate release unchanged.
- [x] 2.3 Check the `pointercancel` and `cancelPointerTracking` paths for the
      same window, and the touch path (`detectSecondaryButton` may already have
      consumed the up).

## 3. Test and verify

- [x] 3.1 Tier-3 regression test (`happy-dom`): dispatch `pointerdown` then
      `pointerup` with the press's `processMouse` promise still pending, and
      assert the puzzle receives the release exactly once. A tier-1 engine test
      cannot see this — the engine is already correct.
- [x] 3.2 Browser-verify on two drag games (Spokes and Pegs): a fast click
      leaves no stranded overlay, and an ordinary press-drag-release still
      works, on both the TS and C/WASM paths.
- [x] 3.3 Full gate green; `openspec validate fix-click-release-race --strict`.
- [x] 3.4 Archive with the fix. **Done 2026-07-28.** The fix itself shipped
      earlier in `ee35240` (alongside the Spokes work it was found in); this
      change was left open only for the archive step. Re-verified before
      archiving: `pressInFlight` parks a `pointerup`/`pointercancel` that beats
      the round-trip and replays it exactly once, and the five `press/release
      delivery` tests in `puzzle-view-interactive.test.ts` pass.
