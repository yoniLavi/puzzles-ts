# Build the draw state at its size

**Readiness: scaffolded 2026-09-12, not started.** Found while closing
`spell-the-tile-size-once`, whose rename put every game's `setTileSize` body
side by side for the first time. To be implemented in a fresh session; every
number below was measured on 2026-09-12 and is a claim to re-take before
building on it (task 1).

## Why

`Game.setTileSize(ds, tileSize)` is upstream's `game_set_size`, and it exists in
C because C's midend **recreated** the draw state on every size call. This port
changed that on purpose — `Midend.size()` resizes the live draw state in place,
so a layout jiggle does not wipe a tile cache (`fix-flip-canvas-reshape`) — and
kept the hook. The result, read across all 57 games:

- **56 games define `setTileSize`, and 42 of the bodies are exactly
  `ds.tileSize = ts`.** The rest derive geometry (Blackbox, Lightup, Samegame,
  Spokes, Cube, Ascent), round it (Bricks), or invalidate.
- **Nine games carry resize invalidation by hand** — Bridges, Flip, Galaxies,
  Pegs, Signpost, Rome and Guess reset `started` and wipe their cache; Inertia
  and Spokes drop a wrongly-sized blitter. Each writes its own
  `if (ds.tileSize === ts) return; …` guard.
- **The other 48 get correctness from outside the engine.** A tile cache is
  stale after a tile-size change, and what actually replaces the draw state is
  the view: it resizes the canvas when the *pixel* size changes, and
  `resizeDrawing` calls `canvasCleared`. That holds because a new tile size
  always moves the pixel size, which is true of every grid here and promised by
  nothing in the midend.
- **"Sized" versus "unsized" is a distinction the harness pays for.**
  `setTileSize` assigns into a live object, so reading a draw state before and
  after sizing gives different answers. `widen-the-capability-snapshot`'s first
  cut read it sized and a deliberately deleted field came back; the fix was a
  paragraph in `enrollment.ts`, two in `docs/games/testing.md`, a spec clause and
  a test ("loses nothing by reading the draw state before it is sized"), all
  guarding a state that exists only because sizing is a second step.

**Nothing is sacred applies squarely**: a promise nothing consumes (keep this
object alive across a tile-size change, when the canvas under it is about to be
reset regardless) is paid for in fifty-six hooks and nine hand-written
invalidations.

## What Changes

- **BREAKING (internal contract only):** `Game.newDrawState(state, tileSize)`
  takes the tile size, and `Game.setTileSize` is removed. A game builds its draw
  state already sized, deriving any geometry there.
- `Midend.size()` replaces the draw state with a fresh one **when the resolved
  tile size changes**, and does nothing to it when the tile size is unchanged —
  so the flicker `fix-flip-canvas-reshape` fixed stays fixed. `canvasCleared`
  builds at the current tile size.
- The nine hand-written resize invalidations are deleted: a fresh draw state has
  no stale cache and no wrong-sized blitter by construction.
- The sized/unsized apparatus goes: `sizedDrawState`, the capability
  snapshot's "sizing adds no name" test and its prose in `enrollment.ts` and
  `docs/games/testing.md`.
- Cube's `gridScale` and Guess's `pegsz` are the tile size under other names
  (`ds.gridScale = tileSize`; `pegsz = tilesize`), and hold `tileSize` like the
  other 55. This also corrects a false sentence `spell-the-tile-size-once`
  committed to `docs/games/rendering.md` ("A board that is not tiled names its
  own scale for what it is (Cube's `gridScale`, Guess's `pegsz`)").

No player-visible change and no data compatibility question: no save, preference
or game-id format is touched. The render snapshots are the proof (task 5).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ts-engine`: three requirements name `setTileSize` — "The midend repaints on
  every transition and drives animation" (what `size()` and `canvasCleared` do
  to the draw state), "A game is handed a draw state, never the absence of one"
  (how it comes to be sized), and "The capability snapshot covers both halves of
  what a game remembers" (the unsized reading).

## Impact

- `src/engine/game.ts` (`Game` contract), `src/engine/midend.ts`
  (`size`, `canvasCleared`, `freshDrawState`), `src/engine/fake-game.ts`.
- All 57 games' `newDrawState`; 56 `setTileSize` definitions deleted.
- `src/engine/border-grid-render.ts` (`newBorderGridDrawState`, shared by
  Palisade and Separate).
- Test harness: `src/engine/testing/sized-draw-state.ts` (33 importers),
  `enrollment.ts`, `capability-surface.test.ts`, `midend.test.ts`'s
  "`Midend.size` is purely informational" suite, and roughly 30 game test files
  that build a draw state and size it by hand.
- Docs: `docs/games/rendering.md`, `mechanics.md`, `testing.md`.
