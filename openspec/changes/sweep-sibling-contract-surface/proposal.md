# sweep-sibling-contract-surface

## Why

`audit-vestigial-contract-surface` swept the `Game` interface exhaustively and
guarded it. It swept the **app-facing** contracts by hand, and found three dead
things there — `setDrawingFontInfo`, `Puzzle.isUnfinished`, and
`PuzzleStaticAttributes.canConfigure`, the last of which was hiding a
player-visible defect. Then it shipped a guard over `Game` only.

That is the wrong shape to leave behind: **two of the three findings were in the
contract the guard does not cover**, and both were found by a person reading,
which is the method the audit exists to replace.

Pointing the audit's own instrument at those surfaces — mechanically, now that
it exists — is cheap and answers the question properly.

## What Changes

Sweep `EngineCore`, `PuzzleEngineSurface`, `Puzzle`, `PuzzleStaticAttributes`,
`Drawing` and `ReferenceItem` for members with no consumer, using the AST-based
scan from `contract-surface.test.ts` (never a grep, and a same-named relay is
not a consumer).

**Result: the engine-facing surfaces are clean.** `EngineCore` (38 members),
`PuzzleEngineSurface` (44), `Drawing` (17) and `ReferenceItem` (4) have a reader
for every member. That is a real answer and worth the ten minutes it cost.

Three findings, all in the same family as the audit's:

1. **`PuzzleStaticAttributes.displayName` is the third dead relay of its kind.**
   The midend sends `game.id` and `Puzzle` writes
   `catalogData?.name ?? displayName` — and `catalog-registry.test.ts` holds the
   catalog and the registry equal in both directions, so the fallback is
   unreachable for any puzzle the app can route to. The comment justifying it
   ("catalog *Tracks* vs API *Train Tracks*") describes the **C** midend, which
   reported upstream's own display name; the TS midend answers a lowercase
   puzzle id, so the fallback could only ever have made the name worse.
2. **`Midend.winSize` is written twice and never read.** Its own doc says it is
   "exposed only via tests" — it is `private`, and no test reads it. `size()`
   assigns it and returns it on the next line. Its real consumer, the engine's
   background fill, went in `fix-flip-canvas-reshape`; the field outlived it
   carrying a sentence about who read it.
3. **`Puzzle.detachCanvas` is public with no external caller** — `delete()` is
   the only one, and `view.ts` records why it deliberately does not call it.

And the guard is widened to `PuzzleStaticAttributes`, scoped to **app-shell**
reads: the two contracts share field names, so an engine read of
`game.canSolve` would otherwise vouch for an app field nothing touches.

## Impact

- Affected specs: `ts-engine` (one ADDED requirement — the relay contract to the
  app carries no field the app does not read).
- Affected code: `src/engine/types.ts`, `src/engine/midend.ts`,
  `src/puzzle/puzzle.ts`, `src/contract-surface.test.ts`,
  `docs/games/mechanics.md`.
- **No behaviour change.** `displayName`'s fallback was unreachable, `winSize`
  had no reader, and `detachCanvas` keeps its one caller.
- Deliberately **not** done, with the reasoning recorded in
  `docs/games/mechanics.md`: `preferredTileSize`, `setTileSize` and
  `paramConfig` are optional and implemented by all 57 games, but their
  optionality costs three `?.`/`??` in the midend and never reaches a game.
  Unlike `newDrawState`/`redraw`, no game code pays for it, so requiring them
  would be churn.
