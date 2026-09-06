# ratchet-the-mistake-overlay-coverage

**Readiness: ready.** `re-express-the-collection`'s B8, found while doing B4.

## The finding

**A game's mistake detection is tested; its mistake *drawing* often is not.**

`promote-the-thick-rect-outline` measured the cost by accident: with one shared
helper wired into eight games' error frames, deleting a whole side of the frame
failed **one** test in the collection. Tents' and Magnets' render-scenario
snapshots contain zero mistake ops.

Measured across the collection, from the derived capability set: **39 games
offer `findMistakes`, and 19 of them never render its overlay in any test.**
They test the function — "does it flag the right cells" — and stop there. For a
player, the overlay *is* Check & Save; the function is invisible.

## Why this is a ratchet and not a fix

Closing the gap outright means writing a mistake frame per game, and that is
irreducibly per-game twice over:

- **Reaching a mistaken board takes a game-specific move** — solve, find a free
  cell, place the opposite value, in the game's own `Move` type.
- **The mark is a game-specific shape.** Crossing's mistake box is two nested
  `drawRectOutline` *lines* inset well inside the tile; Clusters' is four
  `drawRect` bands at the tile edge. Crossing draws them differently on purpose,
  so a player can tell a wrong digit from a full-but-unlisted run.

So there is no single collection-wide overlay guard to write. What there is: a
guard that **counts**, derives both sides, and holds the shortfall to a ledger
that may only shrink. A new game offering `findMistakes` without an overlay test
fails; every entry deleted is a game whose Check-&-Save feedback somebody has
seen drawn.

That is the `NO_KEYBOARD` shape — a list that is a snapshot of a derived set,
asserted equal to it on every run, so it cannot rot the way a hand-kept roster
does.

## An instrument correction, recorded because it changed the number

The first cut listed **crossing**, which already had the one test in the whole
collection that caught a break in the shared error frame. The key
(`showMistakes`) measures whether a test drives the *Check-&-Save* overlay; it
does not measure whether a game's error mark is drawn in a test at all, and
Crossing covers its **run-error** frame by a different route.

Those are two different marks for two different reasons, and Crossing draws them
differently on purpose. The guard's doc now says what it does not measure, so
the next reader does not mistake a listed game for an untested one.

## Impact

- Affected specs: none — this is a test-coverage guard.
- Affected code: `src/mistake-overlay-coverage.test.ts` (new), plus real overlay
  tests closing **clusters** and **crossing**, the two of B4's eight that lacked
  one.
- **The ledger stands at 17.** It may only shrink.
