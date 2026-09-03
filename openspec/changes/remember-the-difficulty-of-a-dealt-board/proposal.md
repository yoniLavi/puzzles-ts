# remember-the-difficulty-of-a-dealt-board

## Why

**Reopening a puzzle silently resets its difficulty.** Reproduced in Chrome on
2026-09-03: pick *Unruly → 10×10 Normal*, reload, and the type menu reads
**"10×10 Trivial"** — a combination the preset menu does not even offer. The
board that comes back is the right one; the difficulty setting behind it is not,
and the next "New game" deals at the wrong tier without saying so.

**The cause is an outward-facing identifier reused as internal state.** Two
settings are written for the same board and disagree:

- `settings.params` holds `encodeParams(p, /* full */ true)` — `"10x10dn"`.
- `settings.lastGameId` holds `puzzle.currentGameId`, which is
  `encodeParams(p, /* full */ false) + ":" + desc` — `"10x10:<desc>"`.

The short form is *correct where it came from*. `currentGameId` is the id a
player shares, and upstream's `midend_get_game_id` omits difficulty on purpose:
the desc already fixes the board, so a shared link should not over-constrain
what the recipient's next game will be. The midend says so in a comment at the
emit site.

The defect is the load order. `puzzle-screen.ts` restores the good params from
settings, and *then* calls `newGameFromId(lastGameId)`, whose `:desc` branch does
`this.params = decodeParams(paramsStr)` — from the short prefix — overwriting
them with the game's default tier. `handlePuzzleParamsChange` then observes the
changed params and writes the wrong tier back into settings, so the corruption
persists rather than being transient.

`PuzzleSettings.lastGameId`'s own doc comment states the intent this violates:
*"`params` one line up records the type a puzzle should open as; this records
the board, which is the same kind of fact one level finer."* Two facts at two
granularities — and today the finer one destroys the coarser.

**No test catches it because each half is individually correct**; the coupling
only appears across a reload, and neither `settings.test.ts` nor
`puzzle-screen.test.ts` exercises a tiered game's params surviving a remembered
board. Found during the owner-acceptance browser check for
`declare-deduction-techniques`, which had nothing to do with it.

## What Changes

- **The midend emits a third id, `restoreGameId`** — `params:desc` with the
  **full** params encoding — alongside the two it already emits. The three now
  say what they are for: `currentGameId` shares a *board*, `randomSeed` shares a
  *seed*, `restoreGameId` re-deals *this exact game*, tier included.
- **`puzzle-screen.ts` remembers `restoreGameId`** rather than `currentGameId`.
- **This is deliberately not done by splicing in the app layer.**
  `${puzzle.params}:${descOf(puzzle.currentGameId)}` would produce the same
  string today, but it re-derives from two signals what the midend holds as one
  fact — and if they ever drifted apart it would pair one game's params with
  another's desc, which yields a *broken* board rather than a wrong label. The
  midend is where both are known at once.
- **A guard that fails without the fix**: deal a tiered game, take the
  remembered id, re-deal from it, and assert the difficulty survives.

Explicitly not in this change: the ordering of the load path's preferences, the
autosave rules, or `currentGameId`'s own short encoding — which stays exactly as
upstream defines it.

## Impact

- Affected specs: `app-shell` ("A puzzle page reopens on the board it was last
  showing").
- Affected code: `src/engine/types.ts` (the event), `src/engine/midend.ts`
  (emit), `src/puzzle/puzzle.ts` (signal + accessor),
  `src/screens/puzzle-screen.ts` (what it remembers).
- **Player-visible, and a fix rather than a choice**: the difficulty a player
  selected stops being silently discarded. Every tiered game is affected — 28 of
  the 57 — not only Unruly.
- **A board remembered by an older build keeps the short form**, so it loses its
  tier once on the next open and is then rewritten in full. Recorded rather than
  worked around: the value is a convenience the player never asked for, and
  AGENTS.md already carries the owner's position that a saved game no longer
  valid in a new build may simply be rejected.
