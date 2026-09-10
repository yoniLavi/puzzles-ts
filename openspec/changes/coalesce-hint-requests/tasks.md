# coalesce-hint-requests — tasks

## 0. What is already established

- [x] 0.1 **Reproduced in the browser** (Chrome, dev server, 2026-09-09): eighty
      Hint presses in quick succession on Sixteen 5×5 left the app unresponsive
      for minutes — move counter stuck at 30, board unchanged, a stale banner,
      and clicks on slide arrows ignored. After three minutes untouched it caught
      up: move 31, a fresh hint shown. A backlog, not a hang.
- [x] 0.2 **Cause**: `Puzzle.hint()` (`src/puzzle/puzzle.ts`) awaits
      `workerPuzzle.hint()` directly rather than going through `enqueueInput`, so
      each press starts another worker round-trip and Comlink runs them one after
      another.
- [x] 0.3 **Why now**: Sixteen's deep search costs ~3–4 s on the endgames that
      need it (once or twice a game), against ~1.5 s worst before, so a queue
      builds four times faster.
- [x] 0.4 **Not a hint defect.** The board it appeared to strand on was checked
      directly: `hint()` returns a plan for it, under every possible `lastMove`.
      The refusal in the banner was left over from an earlier request.

## 1. Coalesce

Done 2026-09-10; the mechanical half, ahead of the design half below.

- [x] 1.1 `Puzzle.hint()` drops a press while one is in flight
      (`_hintInFlight`, `src/puzzle/puzzle.ts`). Nothing is queued.
- [x] 1.2 **Rhythm intact.** The rhythm's tests are in
      `puzzle-hint-stepper.test.ts` (not `puzzle-screen.test.ts`, which never
      covered it); two new cases drive a deferred worker stub, one per beat:
      presses during a slow *show* are dropped and the show still arms; presses
      during a slow *apply* are dropped and the next press shows. Both go red
      in milliseconds with the guard bypassed — and were first written so a
      regression *hung* instead (the file's test timeout is an hour), which is
      why the dropped presses are asserted before they are awaited.
- [x] 1.3 One race found and closed: Auto-Hint started *while a show was
      computing* would have been armed behind — the show's answer landing after
      `startAutoHint` set `_hintArmedToApply`, so the next manual press applied
      a step the loop was already applying. The show now arms only if Auto-Hint
      is not active; third test case.
- [x] 1.4 Run in Chrome on Sixteen 4×4: six Hint keypresses as fast as the
      CLI sends them, one applied move, the app responsive. Task 3.2's 5×5
      endgame check stays with the owner's acceptance of §2.

## 2. Say that it is thinking

- [ ] 2.1 Decide what a pending hint looks like: a transient banner, a pending
      state on the Hint control, or something else. **This is the part that wants
      the owner**, not the flag above.
- [ ] 2.2 Only after a few hundred milliseconds, so an ordinary fast hint does
      not flicker.
- [ ] 2.3 Consider whether a slow hint should be cancellable, and say why if not.

## 3. Close

- [ ] 3.1 `npm run gate`.
- [ ] 3.2 Run the app: press Hint repeatedly on a Sixteen 5×5 endgame and confirm
      it stays responsive and says what it is doing.
- [ ] 3.3 Owner acceptance — it is entirely about how the app feels.
