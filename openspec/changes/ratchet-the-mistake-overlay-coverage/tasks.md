# ratchet-the-mistake-overlay-coverage — tasks

`re-express-the-collection` B8. Implemented 2026-09-06.

## 1. Measure with the derived instrument

- [x] 1.1 Population from `capabilitySets()` — the optional `Game` members a
      game actually carries — **not** a grep for `findMistakes`, because four
      games spelled that function differently until earlier the same day.
      Result: **39 games offer it.**
- [x] 1.2 Coverage from each game's own test sources, keyed on `showMistakes` —
      `renderScenario`'s flag, i.e. the mechanism rather than a name a game
      chose. Result: **19 of the 39 never paint the overlay.**

## 2. Make it a ratchet

- [x] 2.1 `src/mistake-overlay-coverage.test.ts`: both sides derived, the
      shortfall a ledger asserted **equal** to the difference, so it cannot rot.
- [x] 2.2 Two vacuity numbers, one per derivation — test sources read and games
      offering the capability — because either could silently match nothing.
- [x] 2.3 A ledger-honesty check: an entry for a game that does not offer
      `findMistakes` would be an excuse nothing could ever retire, so that set
      is asserted empty.
- [x] 2.4 **Proved it fails**: removing `abcd` from the ledger turns it red and
      names abcd. Restored.

## 3. Start shrinking it

- [x] 3.1 **clusters** — its `findMistakes` test already built a mistaken board;
      the frame was never rendered. Now asserts four `COL_ERROR` bands.
      **Proved it catches the real defect**: deleting a side of
      `drawThickRectOutline` now fails clusters too, where before it failed only
      crossing.
- [x] 3.2 **crossing** — asserts its own shape: two nested `drawRectOutline`
      boxes, eight `COL_ERROR` *lines*, and zero on the clean frame.
- [x] 3.3 Ledger down from 19 to **17**.

## Findings

- **The key overstated the gap, and crossing proved it.** `showMistakes`
  measures whether a test drives the Check-&-Save overlay — not whether a game's
  error mark is drawn in a test at all. Crossing was listed while already
  carrying the one test in the collection that caught a break in the shared
  error frame, because it covers its *run-error* frame by another route. The
  guard's doc now states what it does not measure.
- **This is the fourth instrument correction of the sweep**, after jscpd's
  over-report, the location-keyed origin scan, and the alias count that matched
  a comment. The pattern is stable enough to name: **every key in this sweep was
  a proxy, and each one was wrong at the edges.** What worked every time was
  reading the population rather than trusting the count.
- **Why no collection-wide overlay guard exists**, recorded so it is not
  re-proposed: reaching a mistaken board takes a game-specific move, and the
  mark is a game-specific shape. Crossing insets its mistake box well inside the
  tile *so that* it reads differently from its run-error frame — a difference
  worth keeping, and one no shared assertion could express.
