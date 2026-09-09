# coalesce-hint-requests

**Readiness: characterized in the browser, not designed.** The behavior is
reproduced and understood; what it needs is a decision about how the app should
*feel* while a hint is being computed, which is the owner's call rather than a
mechanical fix.

## Why

**`Puzzle.hint()` does not go through `enqueueInput`, so every press starts
another worker round-trip, and they pile up.** Comlink serializes them at the
worker, so N presses cost N hints of wall clock before the UI responds again.

Seen in the browser on Sixteen 5×5 (2026-09-09): pressing Hint eighty times in
quick succession left the app apparently frozen for **several minutes** — the
move counter stuck, the board unchanged, a stale "No move here would get you
closer." in the banner, and a click on a slide arrow doing nothing either. It was
not stuck. Left alone for three minutes it caught up, applied the move and showed
the next hint. Every press had been queued.

**What made it worth filing now is that hints got more expensive.**
`fix-sixteen-endgame-stranding` gave Sixteen a deep search for the endgames it
used to give up on, and that search costs **~3–4 s** — once or twice a game, on
the boards that need it. So the backlog builds four times faster than before, and
a player who presses Hint three or four times because nothing seems to be
happening now waits twelve to sixteen seconds rather than four.

**And nothing tells them anything is happening.** The banner changes only when
the answer arrives. A player who presses Hint on a two-swapped-pairs 5×5 endgame
gets four seconds of an app that looks broken, then a correct hint. That is the
same four seconds whether they wait or hammer the key; only the second is
self-inflicted, and only the second gets much worse.

## What Changes

Two separable things, and the second is the one with a real design question in
it:

1. **Coalesce.** While a hint request is in flight, a further press should not
   start another. The mechanical form is a flag around the `workerPuzzle.hint()`
   await in `src/puzzle/puzzle.ts`.

   The care needed is in the **show/apply rhythm**: the first press shows a step
   and arms, the second applies it. Dropping a press while the *show* is still
   computing is right — there is nothing to apply yet — but it must not leave the
   arming flag wrong, and `puzzle-screen.test.ts` covers that rhythm.

2. **Say that it is thinking.** A transient banner, or the Hint control in a
   pending state, for a request that has not come back within a few hundred
   milliseconds. What it should say, and whether a slow hint deserves anything
   more (a cancel?), is a design question rather than a mechanical one — which is
   why this is a proposal rather than a patch.

## Impact

- Affected specs: none obviously; a requirement may be worth adding once the
  behavior is decided.
- Affected code: `src/puzzle/puzzle.ts`, and whatever surfaces the pending state.
- **Not Sixteen's problem to fix by being faster.** Four seconds is what the
  ninth ply of that endgame costs, and the alternative measured in
  `fix-sixteen-endgame-stranding` was the hint giving up on one game in five.
  Making the wait legible is the cheaper fix than making it disappear.
- Owner acceptance: **yes** — it is entirely about how the app feels.
