# coalesce-hint-requests — design

The proposal split this into a mechanical half (drop presses in flight) and a
design half (what a pending hint looks like), and reserved the second for the
owner. The owner asked for a recommendation and its implementation
(2026-09-10); this is it.

## D1. Drop, never queue

A press while one is in flight is dropped (`Puzzle._hintInFlight`). Queuing
even one would re-create the backlog in miniature, and there is nothing a
queued press could mean that a fresh press after the answer does not: during
a *show* nothing is armed, so the queued press would be an apply of a step the
player has not yet seen; during an *apply* the step was disarmed on the way
in, so the queued press would be a show the player can make themselves.

One race found on the way and closed: a show landing after Auto-Hint had
started would arm behind it, so the next manual press applied a step the loop
was already applying. The show arms only while Auto-Hint is not active.

## D2. "Thinking…", in the two places the player is already looking

**Recommendation, implemented:** after `HINT_PENDING_MS` (300 ms) unanswered,
the Hint control's label becomes "Thinking…" and the hint banner says the
same; both revert when the answer lands.

- **Why both.** The control is what the player just pressed and is about to
  press again; the banner is where the answer will appear. A label alone
  leaves the banner stale (the last refusal, or the last step's explanation);
  a banner alone leaves a button that looks dead. The same signal drives both,
  so they cannot disagree.
- **Why a delay, and why 300 ms.** An ordinary hint answers in tens of
  milliseconds; labeling it would flicker. A Sixteen endgame search costs
  ~3–4 s, so 300 ms labels it for more than nine-tenths of its length. The
  constant is exported and the tests read it rather than restating it.
- **Why the banner clears on a successful show.** The explanation takes
  precedence in the chrome (`activeHintExplanation || autoHintMessage`), so a
  lingering "Thinking…" would be invisible until the explanation is hidden —
  and then reappear, stale. It is cleared only if it is still the message: a
  refusal or "Hint applied" that landed meanwhile stays.
- **Why the existing banner rather than a new surface.** The transient banner
  already carries every hint-related message a player reads (refusals, "Hint
  applied", Auto-Hint's "Paused"); a second surface for one more would be a
  second thing to keep consistent.

## D3. Not cancellable

The hint runs synchronously inside the worker. Cancelling it would need every
game's search to poll a flag — a per-game obligation across the collection for
a wait that is a few seconds, once or twice a game, in the games that search.
`fix-sixteen-endgame-stranding` measured the alternative: a hint that gives up
on one game in five. Making the wait legible is the cheaper and the better fix;
if a search ever grows past a handful of seconds, a cooperative budget already
exists (`engine/step-budget.ts`) and would be the place to start.

## D4. What was checked where

Twelve cases in `puzzle-hint-stepper.test.ts` against a deferred worker stub,
under fake timers for the pending state: labeled one millisecond after the
delay and not before, never labeled for a fast answer, cleared on a successful
show, and a late refusal's message wins. In Chrome on Sixteen: rapid presses
apply one move and the app stays responsive. Whether the label was *visible*
live depends on a hint slow enough to cross 300 ms on a board the CLI can
reach; `tasks.md` 3.2 records what was seen.
