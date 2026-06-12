## ADDED Requirements

### Requirement: Black Box game implements the Game interface

The engine SHALL provide a registered `blackbox` game implementing
`Game<BlackboxParams, BlackboxState, BlackboxMove, BlackboxUi,
BlackboxDrawState>`: a deduction puzzle in which the player locates hidden balls
in a `w`×`h` arena by firing lasers from the surrounding range and observing how
they hit, reflect, or exit. Params SHALL be `w`, `h`, `minballs`, `maxballs`,
encoded `w{w}h{h}m{minballs}M{maxballs}` with lenient decode (unknown letters
ignored). The 5 upstream presets — `5×5, 3 balls`, `8×8, 5 balls`, `8×8, 3-6
balls`, `10×10, 5 balls`, `10×10, 4-10 balls` — SHALL be offered. The
preset/custom **type summary** SHALL read `{w}x{h}, {n} balls` (or `{min}-{max}
balls`) via a `no-of-balls` annotation key mapped in the worker adapter.
`validateParams` SHALL reject `w < 2` or `h < 2`, `w > 255` or `h > 255`,
`minballs < 1`, `minballs > maxballs`, and `minballs >= w*h`. The game SHALL
report `wantsStatusbar = true`, `isTimed = false`, `canSolve = true`, and
`canFormatAsText = false`, and SHALL NOT provide `hint` or `findMistakes`.

#### Scenario: Params round-trip and lenient decode

- **WHEN** params `{ w: 8, h: 8, minballs: 3, maxballs: 6 }` are encoded
- **THEN** the result is `w8h8m3M6`
- **AND** decoding `w8h8m3M6` round-trips those params

#### Scenario: The ball-count type summary reflects a range

- **WHEN** the worker adapter decodes params `w8h8m3M6` for the type summary
- **THEN** the `no-of-balls` annotation value is `"3-6"` (rendered `3-6 balls`)
- **AND** for `w8h8m5M5` the value is `"5"` (rendered `5 balls`)

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `minballs: 0`, or with
  `minballs > maxballs`, or with `minballs >= w*h`
- **THEN** it returns a non-null error string

### Requirement: Black Box descriptions are obfuscated ball-layout bitmaps

`newDesc` SHALL scatter `nballs` balls (`minballs + random_upto(maxballs −
minballs + 1)`) at distinct random arena cells, encode `[w, h, ball1x, ball1y,
…]` as a byte-per-value bitmap, apply the shared `obfuscateBitmap` SHA-1 masking,
and hex-encode the result. `validateDesc` SHALL reject a desc of wrong length or
one whose de-obfuscated header mismatches `w`/`h` or whose ball coordinates fall
outside the arena. `newState` SHALL recover the ball layout by hex-decoding and
de-obfuscating the desc. The shared codec SHALL live at
`src/native/engine/obfuscate.ts`.

#### Scenario: A description round-trips through obfuscation

- **WHEN** a generated desc is decoded by `newState`
- **THEN** the recovered ball cells equal the balls scattered by `newDesc`

#### Scenario: A corrupted description is rejected

- **WHEN** `validateDesc` is given a desc of the wrong length, or one that
  de-obfuscates to a ball outside the arena
- **THEN** it returns a non-null error string

### Requirement: Black Box traces lasers through the arena deterministically

The laser engine SHALL, for a beam entering at a range cell in a given
direction, reproduce upstream's rules: an **instant hit** when a ball sits
directly ahead of the entry cell; an **instant reflection** when a ball sits
diagonally ahead-left or ahead-right of the entry cell (hit prioritised over
reflection); otherwise stepping forward, turning clockwise when a ball is
ahead-left and anticlockwise when a ball is ahead-right, returning **hit** when a
ball is directly ahead, **reflect** when the beam exits its own entry cell, and
otherwise the exit range index. A fired non-hit/non-reflect laser SHALL number
its entry and exit cells with a shared incrementing laser number.

#### Scenario: A clear beam exits the far side and pairs its endpoints

- **WHEN** a laser is fired across an arena with no ball in its path
- **THEN** it exits at the opposite range cell, and both the entry and exit
  cells carry the same laser number

#### Scenario: A head-on ball produces a hit

- **WHEN** a laser is fired directly at a ball with no earlier deflection
- **THEN** the result is a hit (the entry cell shows `H`)

#### Scenario: An adjacent ball reflects the beam at entry

- **WHEN** a laser enters a cell with a ball diagonally ahead of the entry point
- **THEN** the result is an instant reflection (the entry cell shows `R`)

### Requirement: Black Box marks, fires, locks, and reveals via moves

A `BlackboxMove` SHALL be one of: toggle a guessed ball at an arena cell, toggle
a per-cell lock, lock/unlock a whole column or row, fire a laser at a range
cell, reveal/verify the current guesses, or solve (reveal the answer).
`executeMove` SHALL be pure (returning a new state) and SHALL reject an illegal
move by throwing. Toggling a ball SHALL be disallowed on a locked cell and SHALL
update the guess count. Firing an already-fired laser SHALL be rejected.
Revealing SHALL be allowed only when the guess count is within
`[minballs, maxballs]`. A whole-column/row lock SHALL set every cell locked iff
fewer than half are currently locked, else unlock them.

#### Scenario: Toggling a ball updates the guess count

- **WHEN** `executeMove` applies a toggle-ball on an empty unlocked arena cell
- **THEN** the new state has a guessed ball there and `nguesses` incremented
- **AND** applying the same toggle again removes it and decrements `nguesses`

#### Scenario: Firing a laser records its result

- **WHEN** `executeMove` applies a fire on an un-fired range cell
- **THEN** the new state's `exits` for that range index is no longer empty

#### Scenario: Reveal is gated on the ball count

- **WHEN** the guess count is below `minballs`
- **THEN** a reveal move is rejected (throws)

### Requirement: Black Box verifies guesses and reports the outcome

The verify (reveal) move SHALL run `checkGuesses`, which fires every laser
against both the real layout and the player's guessed layout and compares them.
When the player's already-fired lasers contradict their guess, or an un-fired
laser would have distinguished the layouts, the cagey path SHALL flag one such
laser (deterministically chosen from the current grid) and set `justwrong`
without fully revealing. Otherwise it SHALL reveal, set `nright`/`nwrong`/
`nmissed`, and (when consistent and the ball count is in range) accept the
guesses as correct. `status` SHALL return `"solved"` when revealed with no wrong
and no missed balls and at least `minballs` correct, `"lost"` when revealed
otherwise, and `"ongoing"` before reveal. A wrong verify SHALL increment a
session error counter shown in the status bar.

#### Scenario: A correct reveal is solved

- **WHEN** the guessed balls exactly match the real layout and the player
  verifies
- **THEN** `status` returns `"solved"` and the status bar reads a success message

#### Scenario: An inconsistent verify shows one error and does not reveal

- **WHEN** the player verifies a guess that a fired laser contradicts
- **THEN** `justwrong` is set, exactly one laser is flagged wrong, the full
  layout is not revealed, and the session error counter increments

#### Scenario: A wrong reveal is a loss

- **WHEN** the player solves (gives up) or verifies with missed/wrong balls
- **THEN** `status` returns `"lost"` and the missed balls are shown
