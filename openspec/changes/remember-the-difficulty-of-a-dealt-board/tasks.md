# remember-the-difficulty-of-a-dealt-board — tasks

## 1. The midend says what each id is for

- [x] 1.1 `NotifyGameIdChange` gains `restoreGameId` — `params:desc` with the
      **full** params encoding.
- [x] 1.2 `Midend.emitIdChange` emits it, and its comment distinguishes the three
      ids by job (share a board / share a seed / re-deal this game).
- [x] 1.3 `Puzzle` exposes it as a signal + accessor, beside `currentGameId`.

## 2. The app remembers the right one

- [x] 2.1 `puzzle-screen.ts` stores `restoreGameId` in `settings.lastGameId`.
- [x] 2.2 The change-detection guard keeps comparing `currentGameId`, which
      changes exactly when the board does.

## 3. …and *displays* the right one

- [x] 3.1 **Found by the browser re-check, after the storage fix was verified
      correct in IndexedDB.** `Puzzle.currentParams` had the same defect at the
      other end: it derived from `randomSeed` before its `#`, falling back to
      `currentGameId` before its `:`. The fallback is the lossy form, so every
      board without a seed — i.e. every board restored from a descriptive id —
      was labeled at the default tier. It now reads `restoreGameId`, which
      carries full params unconditionally, so there is nothing left to prefer
      between. See Findings 1.

## 4. Guards

- [x] 4.1 `midend.test.ts`: the three ids encode params for the job they are for;
      restoring from `restoreGameId` keeps the difficulty while restoring from
      `currentGameId` does not (the sharing id's documented lossiness, pinned so
      the two cannot quietly converge). A duplicate `suffixGame` fake was folded
      into one `tieredGame()` that models a real tiered codec, decode included.
- [x] 4.2 `puzzle-current-params.test.ts`: a board with no seed keeps its
      difficulty; a seeded one too; the value follows a re-deal rather than
      caching the first.
- [x] 4.3 `puzzle-screen.test.ts`: a new test drives the **real** debounced
      handler and asserts the stored id — see Findings 2 for why that was
      necessary and what the old helper was hiding.
- [x] 4.4 **Every guard proved to fail first.** Short-encoding `restoreGameId`
      reddens both midend tests; pointing the app back at `currentGameId` reddens
      the puzzle-screen test; restoring the old `currentParams` derivation
      reddens two of the four `currentParams` tests (the two that discriminate).

## 5. Close out

- [x] 5.1 Full gate green.
- [x] 5.2 Browser re-check: Unruly at 10×10 Normal survives a reload as
      **10×10 Normal**, with that preset checked in the type menu, across two
      reloads.
- [ ] 5.3 Commit and archive.

## Findings

1. **Fixing the storage was not fixing the bug, and only the browser said so.**
   After the `restoreGameId` change the IndexedDB row was demonstrably correct
   (`lastGameId: "10x10dn:hDAg…"`, `params: "10x10dn"`) — and the type control
   still read *"10×10 Trivial"*. The same lossy id was feeding a second consumer,
   `Puzzle.currentParams`, at the display end. Two independent reads of one
   wrong id, and the persisted state being right is exactly the evidence that
   would have ended the investigation early. This is what the acceptance bar's
   *"run the app before declaring UI work done"* buys that no assertion about
   storage could: a green DB row is not a player seeing the right thing.

2. **The test helper had drifted into re-implementing the line under test.**
   `puzzle-screen.test.ts`'s `load()` skips the debounced handler and calls
   `settings.setLastGameId(puzzle.puzzleId, puzzle.currentGameId)` itself — a
   deliberate shortcut, but one that made every "which board is remembered" test
   blind to *which id production chose*. Moving production to `restoreGameId`
   would have left all of them green over the unfixed defect. Fixed on both
   sides: the fake now carries two distinguishable ids (a fake where they are the
   same string cannot tell a test which was recorded), the helper records what
   production records, and one test pays the 250 ms debounce to drive the real
   handler.

3. **The lossy id was correct at its origin.** `currentGameId` omits difficulty
   on purpose — upstream's `midend_get_game_id` does, because a `:desc` id
   already fixes the board and a shared link should not dictate the recipient's
   next game. Nothing about that was wrong; what was wrong was reusing an
   outward-facing identifier as internal state. The fix is not to make the
   sharing id lossless but to stop asking it a question it was never built to
   answer — and the midend test now pins its lossiness so the distinction cannot
   erode into "they're the same thing anyway".

4. **A board remembered by an older build loses its tier once.** Verified in the
   browser: the stale short-form id was still in IndexedDB and reopened at
   Trivial until a new board was dealt, after which the full form took over and
   it stayed correct. Left as-is rather than migrated — AGENTS.md already carries
   the owner's position that a saved game no longer valid in a new build may
   simply be rejected, and this is a convenience the player never asked for.
