# ts-engine Specification Delta — unify-hint-refusals

## ADDED Requirements

### Requirement: A hint refusal is worded once for the whole collection

A refusal returned by `Game.hint` SHALL come from the collection's single set of
refusal messages, and a game SHALL NOT spell one of those messages itself. The
set SHALL distinguish, at minimum: the board is finished; the board contradicts
its clues **and the offending cells will be highlighted**; the board is
inconsistent but **no individual entry can be shown to be wrong**; deduction has
run out; and — for a game that teaches no technique — that no move would help.

This is required because the help teaches "there is a mistake on the board" and
"deduction has run out" as a *pair* whose responses are opposite, and a player
cannot learn a pair whose members are worded differently in each puzzle.

The choice between the two mistake refusals SHALL be made by **whether a
highlight will actually appear**. A message promising highlighted cells SHALL be
emitted only where the game has established that its `findMistakes` returns some;
where a game's `findMistakes` is a rule validator that cannot see a
wrong-but-legal entry, the refusal SHALL be the one that asks the player to undo
rather than one that points at a highlight that never comes.

A game MAY word a refusal differently where naming *its own* dead end is the
substance of the hint — a game with no deduction to offer has nothing else to
give — and such an exception SHALL be recorded with its reason where the
guarantee is enforced, rather than left as an unexplained difference.

Conformance SHALL be asserted by scanning for the refusal's **shape** rather
than for the name of the function returning it. A scan keyed on a function named
`hint` misses a game whose hint is named for the game, and did: it reported a
census of the whole collection with one game absent from every figure.

#### Scenario: Two games refuse for the same reason

- **WHEN** two games decline to hint because no further move can be deduced
- **THEN** the player reads the same sentence in both

#### Scenario: A new phrasing cannot arrive unnoticed

- **WHEN** a game returns a refusal message that is neither one of the shared
  messages nor a recorded exception
- **THEN** the conformance check fails

#### Scenario: A copy of a shared message is not a substitute for it

- **WHEN** a game spells out the text of a shared refusal instead of using it
- **THEN** the conformance check fails, because a copy drifts the first time the
  wording is improved

#### Scenario: A refusal promises a highlight only when there will be one

- **WHEN** a game refuses because the board contradicts its clues
- **THEN** it uses the message naming highlighted cells only if its
  `findMistakes` reports some for that board
- **AND** otherwise uses the message that asks the player to undo instead

#### Scenario: A game whose dead end is its own

- **WHEN** a game's refusal names a situation particular to it, and saying so is
  what the hint has to offer
- **THEN** that wording is permitted, and the reason is recorded alongside the
  check that would otherwise reject it
