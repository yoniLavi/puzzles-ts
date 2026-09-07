# close-the-consumed-probe-blind-spot

**Readiness: implemented.** Scaffolded 2026-09-06 as an investigation with two
candidate fixes and a real trade-off between them. The investigation closed the
trade-off on the first measurement, and in the process corrected the finding
itself in two ways — one narrowing it, one making it considerably worse.

Found 2026-09-06 while probing `canMarkAll` for
`audit-declared-versus-derived-capabilities`, which needed to know whether a
game's `M` press could be derived. Ascent said yes to a press it does not
handle, and pulling that thread found the general shape.

## The finding, as measured

**One game — Ascent — reports `consumed` for a button code nothing could
possibly handle.** Measured across all 57 registered games, driving a real
`Midend` at the keyboard origin and across the board:

| | Games |
| --- | --- |
| Answer a code the vocabulary cannot express | **ascent** (676 of 676 probes) |
| Clean | the other 56 |

Ascent's mechanism is legible in `ui.ts`: the board arm is gated on the pointer
*coordinates* alone, and keyboard events arrive at `(0, 0)`, which is inside
every grid. So every key ran the (no-op) `mouseClick` path, set `finishTyping`,
and fell through `if (finishTyping && !ret) return UI_UPDATE`.

### Correction 1: Sixteen was an instrument artifact, not a second game

The scaffolded proposal named **ascent and sixteen**, measured with the
private-use codes `0xE000`–`0xE002`. Those are not nonsense codes in this
vocabulary: `MOD_MASK` is `0x7800`, so `0xE000` decodes as
`MOD_NUM_KEYPAD | MOD_SHFT | 0x8000`. Sixteen reads the keypad bit and was
answering exactly as designed. Re-measured with codes asserted free of every
modifier bit (`0x0300`–`0x0302`, `0x10000`), Sixteen is clean and Ascent still
answers all of them.

This is the repo's own "check the instrument before the finding" rule catching a
finding that had already been written down — and it is why the guard that landed
derives every reason its probe codes are safe from the button vocabulary rather
than asserting it in a comment.

### Correction 2: it reached players, from 11:13 this morning

The scaffolded proposal's constraint C3 said the cost was entirely to the guards,
because `processKey`'s return value was discarded at both frontend call sites.
**That was true when written and false a day later.** `9b5093cf`
(2026-09-07 11:13) shipped the app's bare-letter shortcuts, and derived them from
exactly this value: `view-interactive.ts` raises `puzzle-key-unhandled` when a
game declines a key, and `puzzle-screen.ts` runs the command. Because Ascent
claimed every key, **undo, redo, New game and Hint were all unreachable from the
keyboard in Ascent** — the only game in the collection where that was true.

C3 was a measurement stated in the present tense with no date attached, which is
the shape AGENTS.md warns rots. It rotted in nineteen hours.

## What the guards were actually losing

`input-parity.test.ts` asks its questions *by* the return value, so for Ascent
they were unanswerable. Measured rather than argued, by disabling Ascent's
cursor-key handling outright and running the guards both ways:

| Guard | Old gate | Fixed gate |
| --- | --- | --- |
| `responds to a cursor key` | **passes** (vacuous) | **fails** |
| `some keyboard-only sequence changes the board` | fails | fails |
| `ignoresSecondaryButton` biconditional | passes | passes |

So one guard is genuinely restored; the keyboard-commit check was never blind,
because it reads a board fingerprint rather than the consumed flag. The
`ignoresSecondaryButton` derivation stays inert for Ascent even after the fix —
`RIGHT_BUTTON` *is* a pointer button, so it still reaches the legitimate
`UI_UPDATE` tail, and deleting Ascent's whole right-button arm leaves the guard
green. Ascent's flag is nonetheless correct, established by reading its two arms
(right-click cycles a two-candidate cell, middle-click clears), which is what
constraint C2 asks for when the population is one.

## What shipped

1. **The guard first** (`input-parity.test.ts`): no game answers a button code
   nothing can act on, probed at the keyboard origin and across the board, with
   the probe codes' safety derived from the vocabulary and a ledger asserted
   exactly equal to the set found. Proven to fail — it caught Ascent on its first
   run, and catches a planted `UI_UPDATE` tail in Flood, whose own 51 tests all
   pass with that defect in place.
2. **Fix 1 for Ascent**, which is what the investigation chose: one conjunct
   requiring an actual pointer button. The `UI_UPDATE` tail is kept — it is not
   gratuitous, and narrowing it by comparing UI state would be the deep-compare
   trap. Ascent's 355 tests, its differential and its render snapshots are
   unchanged.
3. **A sweep of every bare shortcut letter against every game**
   (`shortcuts.test.ts`), which is the player-facing property and the half no
   existing test covered. It found a third, *legitimate* collision nobody had
   recorded: **Tents binds `n` to "not a tent"** whenever its cursor is visible.
   Guess and Pearl bind `h` to their own hint. All three are ledgered as
   collisions rather than defects.

Fix 2 (a stronger instrument scoped to the fogging games) was not needed and was
not built, so constraint C1 is satisfied by never having reopened the question.

## Impact

- Affected specs: `ts-engine` (the instrument), `app-shell` (the shortcut
  sweep), `ascent` (the gate, and the honest scope of what the fix restores).
- Affected code: `src/games/ascent/ui.ts` (one conjunct plus its comment),
  `src/engine/input-parity.test.ts`, `src/puzzle/shortcuts.test.ts`,
  `docs/games/input.md`.
- **Player-visible**: four keyboard shortcuts return to Ascent. Nothing else in
  the game changes — no board, no desc, no save.
