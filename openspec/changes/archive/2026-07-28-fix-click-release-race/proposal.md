# fix-click-release-race

## Why

**A fast click can lose its release, so a press-driven overlay stays on screen
until the next input.** `handlePointerDown` in
`src/puzzle/puzzle-view-interactive.ts` `await`s `this.puzzle.processMouse(location, press)`
— a Comlink round-trip to the worker — **before** it installs
`this.pointerTracking`. `handlePointerUp` does nothing unless `pointerTracking`
is set, so a `pointerup` that arrives during that await is dropped on the floor
and the game never sees `LEFT_RELEASE` / `RIGHT_RELEASE` for that gesture.

The midend's contract is that every press is followed by a release, and the
frontend already honours it on the *rejected*-press path (`else { await
this.puzzle.processMouse(location, release); }`). This is the accepted-press
path missing the same guarantee.

Found during `add-spokes-ts-port` dev-verification (that change's design F6).
It is **not** a port bug and not specific to Spokes:

- Verified at the engine level by unit test — a press then a release through a
  real `Midend` leaves no highlight, so `interpretMove` is correct.
- Verified against the **C/WASM** build of the same game, which shows the
  identical stuck highlight — so the fault is in the shared app shell, above
  the C-vs-TS seam.

Spokes makes it maximally visible (a press paints a bright green `COL_HOLDING`
rim on the hub, which then persists), but any game that renders a press or drag
state — Pegs' lifted peg, Signpost's drag arrow, Clusters/Bricks/Sticks' drag
preview, Galaxies' drag highlight — can strand it, and any game whose *release*
carries the move can silently drop a gesture the player made.

The existing machinery shows the intended shape: `detectSecondaryButton` already
returns an `unhandledEvent` so that a pointer event which fired during *its*
await gets replayed. The second await simply has no equivalent.

## What Changes

- **Close the window in `puzzle-view-interactive.ts`.** Record a `pointerup` /
  `pointercancel` that arrives while a press is still in flight, and replay it
  once `pointerTracking` is installed — mirroring the existing `unhandledEvent`
  replay. Key it on `pointerId` so an unrelated pointer can't trigger it, and
  make sure a release is delivered exactly once (never zero times, never twice).
- **Regression test at tier 3** (`happy-dom`): dispatch `pointerdown` and
  `pointerup` with the press's `processMouse` promise still pending, and assert
  the game receives the release exactly once. This is the seam the bug lives
  in; a tier-1 engine test cannot see it (the engine is already correct).
- **Record the invariant in the `app-shell` spec**: every press delivered to a
  puzzle is followed by exactly one release (or cancel), whatever the ordering
  of the worker round-trip and the pointer events.

Explicitly **not** in this change:

- Any per-game change. Every game's `interpretMove` is already correct; they
  are all victims of the same dropped event.

## Impact

- Affected specs: `app-shell` (press/release delivery guarantee).
- Affected code: `src/puzzle/puzzle-view-interactive.ts`, plus a new tier-3 test.
- Affects all 49 registered games and the C/WASM path equally, so it wants its
  own verification pass across a couple of drag games (Pegs, Spokes) rather
  than riding along with a game port.
