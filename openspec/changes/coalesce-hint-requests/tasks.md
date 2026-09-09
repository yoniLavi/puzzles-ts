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

- [ ] 1.1 Ignore a Hint press while a hint request is in flight.
- [ ] 1.2 **Keep the show/apply rhythm intact** — first press shows and arms,
      second applies. A press dropped while the *show* is computing is right
      (there is nothing armed to apply yet) but must not leave
      `_hintArmedToApply` disagreeing with what the player sees.
      `puzzle-screen.test.ts` covers the rhythm; extend it rather than trusting
      it.
- [ ] 1.3 Auto-Hint runs its own loop — check it does not race the new flag.

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
