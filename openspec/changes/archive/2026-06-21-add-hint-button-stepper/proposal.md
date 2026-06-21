# Make the toolbar Hint button alternate show and apply

## Why

Today the toolbar **Hint** button only ever *shows* the current hint step. A
second press is a no-op: `Midend.hint()` re-displays the same step without
recomputing or advancing (`midend.ts` "A valid plan is stored: (re-)display
its current step"). The only way to *apply* a hint is to either follow it
manually or hand the whole plan to the separate **Auto-Hint** play button,
which animates every remaining step back-to-back.

There is a missing middle: a player who has seen the hint and just wants it
performed has no one-shot control for it. The apply-one-step primitive already
exists — `Midend.executeHint()` applies the current step in slow motion (it is
exactly what Auto-Hint loops over). We can give the Hint button a natural second
gear: a second press *applies* the shown step. Most players need only a single
nudge to get unstuck, so applying is **terminal** — it does not roll straight on
to the next hint.

## What Changes

- The toolbar **Hint** button **alternates show and apply**:
  - First press: show the current hint step (unchanged behaviour).
  - A subsequent press **with no intervening user action**: apply that one step
    via `executeHint(true)` (slow-motion animation) and **stop** — the plan is
    hidden rather than previewing the next step, and the banner confirms
    "Hint applied". The *next* press shows the next step. So the rhythm is
    show → apply → show → apply: one applied hint per request.
  - Any intervening user action (a move, key, pointer, undo, redo, solve,
    restart, new game, checkpoint load, loading a saved game, or starting
    Auto-Hint) **disarms** the apply, so the next Hint press *shows* (the
    freshly-relevant) step rather than applying a now-stale one. This is the
    "only if no other action was done in between" guard.
- The midend gains a single-step `executeHint(hideAfter)` mode: with `hideAfter`
  true it applies one step and hides the plan on settle (instead of the auto-play
  preview). Auto-Hint is unchanged — it calls `executeHint()` with no flag and
  keeps the continuous preview.
- No change to any game's `hint()`. The behaviour is an app-shell (`Puzzle`)
  orchestration of the two midend primitives plus the small `hideAfter` flag.
- A refused hint (mistakes on the board, already solved, nothing deducible)
  never arms the apply — the existing refusal banner/overlay behaviour stands.

## Impact

- Affected specs: `ts-engine` (Hint System — adds the `executeHint(hideAfter)`
  single-step mode and the app-shell alternating Hint-button requirement).
- Affected code: `src/puzzle/puzzle.ts` (`Puzzle.hint()` + a disarm hook on the
  intervening-action paths, `executeHint` passthrough), and the `executeHint`
  signature across `src/native/engine/{midend,worker-adapter}.ts` and
  `src/puzzle/{engine-surface,worker}.ts`. No game changes.
- Affected docs: `docs/porting/hint-authoring.md` (the Hint button now
  show/apply-alternates; per-step plan granularity is what the player experiences).
- Risk: low and additive. The repurposed press was previously a no-op; the full
  Auto-Hint path is untouched; the guard reuses the existing
  "manual action cancels Auto-Hint" chokepoint.
