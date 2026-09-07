# ts-engine

## ADDED Requirements

### Requirement: A game declines a button it did not act on

`interpretMove` SHALL return `null` for a button it did not act on, and the suite
SHALL assert that across every registered game by sending button codes nothing in
the vocabulary can mean.

The return value is not only a repaint hint. Three collection-wide input guards
ask their questions *by* it — keyboard reachability, the
`ignoresSecondaryButton` biconditional, and the on-screen-key sweep — and
`view-interactive.ts` raises `puzzle-key-unhandled` exactly when a game declines
a key, which is what lets a bare letter become an app command with no per-game
roster. **A game that answers everything therefore passes every one of those
guards vacuously and takes the app's bare-letter shortcuts away from its own
players**, and both failures are invisible from a green suite.

The probe codes SHALL be asserted unactionable rather than assumed so, against
the shared button vocabulary itself: free of every bit in `MOD_MASK`, outside the
mouse and cursor ranges, outside the printable-ASCII and cancel-key codes, and
absent from every game's `requestKeys`. **Unicode's private-use area is not a
safe choice and SHALL NOT be used**: button codes are not Unicode, `MOD_MASK` is
`0x7800`, and `0xE000` decodes as `MOD_NUM_KEYPAD | MOD_SHFT | 0x8000`. That
choice is how this guard was first mis-measured — it convicted Sixteen, which
reads the keypad bit and was answering the probe exactly as designed, and put a
second game into a finding whose real population was one.

The probe SHALL be sent at the keyboard origin `(0, 0)` as well as across the
board, because a game gating on pointer *coordinates* alone answers every key
that arrives there, and a board-only sweep scores it healthy.

A game that claims such a code SHALL appear on an explicit ledger whose entry
states why, and the ledger SHALL be asserted **exactly equal** to the set the
sweep finds, so an entry cannot outlive the behavior it excuses.

This guard SHALL NOT be read as reopening "did the board change" as the question
the other input guards ask; that question falsely convicted four games and
"consumed" remains the right one. Asserting that a code with *no meaning* leaves
the board untouched is the one direction that has no innocent reading.

#### Scenario: A game answering a meaningless code is caught

- **WHEN** a registered game returns non-`null` for a button code the vocabulary
  cannot express
- **THEN** the guard fails and names the code, unless that game is on the ledger

#### Scenario: The probe codes are checked before the games are

- **WHEN** the guard runs
- **THEN** each probe code is asserted to carry no modifier bit, to be no mouse,
  cursor, cancel or printable-ASCII code, and to be offered by no game's keypad

#### Scenario: A fixed game cannot stay on the ledger

- **WHEN** a game on the ledger stops claiming unactionable codes
- **THEN** the guard fails until its entry is deleted

#### Scenario: The keyboard-reachability guard is sensitive again

- **WHEN** a game that previously answered every code has its cursor-key
  handling removed
- **THEN** the keyboard-reachability guard fails for that game, where before it
  passed
