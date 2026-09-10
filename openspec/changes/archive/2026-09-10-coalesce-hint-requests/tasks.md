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

Owner asked for the recommendation and its implementation (2026-09-10).

- [x] 2.1 **Both the Hint control and the banner say "Thinking…"**, driven by
      one signal (`Puzzle.hintPending`), reverting when the answer lands
      (`design.md` D2). Labels in `rail.ts` and `puzzle-screen.ts`.
- [x] 2.2 `HINT_PENDING_MS` = 300 ms, exported and read by the tests. Fake-timer
      cases: labeled at the delay and not one millisecond before, never for a
      fast answer, cleared on a successful show, and a late refusal's own
      message wins.
- [x] 2.3 **Not cancellable**, and why (`design.md` D3): the search is
      synchronous in the worker, an interrupt is a per-game obligation, and the
      longest case is seconds once or twice a game.

## 3. Close

- [x] 3.1 The commit's gate.
- [x] 3.2 Run in Chrome on Sixteen **7×7** (a fresh board's first hint there
      crosses the delay; a 5×5 endgame is not reachable deterministically from
      the CLI): a 40 ms poll of the chrome's labels through the shadow trees
      recorded Hint → Thinking… → Apply the hint → Hint across two presses,
      with the app responsive throughout. Earlier, six rapid presses on 4×4
      applied one move.
- [x] 3.3 Implemented at the owner's request; the feel is theirs to judge on
      the deployed build. Archived on the code's evidence.
