# close-the-consumed-probe-blind-spot

**Readiness: investigation, with the measurement already done.** The finding is
verified and small; what is open is which of two fixes is right, and that is a
real trade-off rather than a settled call. Task 0 is an explore.

Found 2026-09-06 while probing `canMarkAll` for
`audit-declared-versus-derived-capabilities`, which needed to know whether a
game's `M` press could be derived. Ascent said yes to a press it does not
handle, and pulling that thread found the general shape.

## The finding

**Two games report "consumed" for a button code nothing could possibly handle.**
Measured across all 57 registered games, driving a real `Midend` with three
private-use codes (`0xE000`–`0xE002`) at both the keyboard origin and the middle
of the board:

| | Games |
| --- | --- |
| Report `consumed` for a nonsense code | **ascent, sixteen** |
| Clean | the other 55 |

Ascent's mechanism is legible in `ui.ts`: any button landing inside the grid
reaches `mouseClick`, sets `finishTyping`, and falls through to
`if (finishTyping && !ret) return UI_UPDATE`. So the game answers *every* key.

## Why it matters — and where it does not

**It does not reach a player.** `processKey`'s return value is **discarded** at
both frontend call sites (`components/view-interactive.ts`, `components/keys.ts`);
nothing branches on it, nothing calls `preventDefault` on the strength of it. So
this is not a swallowed-shortcut bug, and a session picking this up should not go
looking for one.

**It blinds the input guards**, which is the real cost.
`input-parity.test.ts` asks its questions *by* that return value:

- **Keyboard reachability** — "responds to a cursor key, or is on the exemption
  list". For these two games the answer is `true` whatever they do, so they pass
  the check vacuously. The guard cannot tell a keyboard from no keyboard here.
- **`ignoresSecondaryButton` iff it ignores it** — "does the game consume
  `RIGHT_BUTTON` anywhere?". Same: `true` regardless, so the derivation that
  holds this declaration honest is inert for them, and the flag could be wrong in
  either direction without anything noticing.

That is this repo's most-repeated defect in its exact classic form (AGENTS.md,
"Method: make the check check the thing"): the assertion passes, so nobody looks,
and what it measures is a neighbor of the thing it claims to measure. Note the
guards are **not** simply wrong to ask "consumed" — the repo chose that question
deliberately over "did the board change", which convicted four games falsely
(`audit-input-mode-parity`). The question is right; two games make it unanswerable.

## The two fixes, and why this is not a settled call

1. **Make the games stop over-reporting.** Terminate the `interpretMove` chain so
   an unrecognized button returns `null`, per AGENTS.md's "reject unrecognized
   moves". Strictly better instrument, and it fixes the cause. **But** Ascent's
   `UI_UPDATE` is not obviously gratuitous — it is the tail of a real
   `finishTyping` commit path, and returning `null` there may drop a repaint the
   typing UI needs. Sixteen needs its own read. This is a per-game behavioral
   change to two shipped games, so it needs its own evidence.
2. **Give the guards a stronger instrument for these two.** Compare a board
   fingerprint side by side with the consumed flag, so a game that says "yes" to
   everything is still measured by something. **But** that re-opens the
   "did the board change" question the repo already rejected, and would have to
   be scoped so it does not spread.

**A third possibility to rule out first**: that the two guards' *specific*
questions can be asked in a way these games cannot fog — e.g. reachability by
whether a cursor is revealed rather than whether a key was consumed.

## Impact

- Affected specs: `ts-engine` (the input guards' instrument), possibly `ascent`
  and `sixteen` if the games change.
- Affected code: `input-parity.test.ts`, and two games' `interpretMove` if fix 1
  wins.
- **Not player-visible** unless fix 1 changes a repaint, which is exactly what
  the investigation has to establish before touching either game.
- **Small.** The population is two, and it is bounded by a probe that already
  exists in this proposal's measurement.
