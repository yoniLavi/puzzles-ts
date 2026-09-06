# ts-engine spec delta

## ADDED Requirements

### Requirement: One note-taking vocabulary across games

A game holding the player's provisional per-cell candidate marks SHALL keep them
in a typed array named `pencil`, so that shared code and cross-game guards can
read a game's notes rather than being told per game where they live.

`pencil` SHALL be the word because the engine had already committed to it
everywhere else it speaks about notes — `Ui.pencilMode`, the `pencilSticky` and
`pencilKeepHighlight` preferences, `pencil-prefs.ts`, `pencil-indicator.ts`, and
the `pencilAll` / `pencilStrike` move vocabulary. The element type and the slot
arity SHALL stay the game's own: a candidate bitmask in one slot and a candidate
*cube* of `n` contiguous slots per cell are both conforming, and the array's
width is a fact about the puzzle.

Two things are **outside** this convention, and a guard SHALL NOT convict them:

- A field that is not a candidate set, even where it carries the retired word.
  Pearl's `marks` are the player's *no-line* marks on a cell's four edges, which
  is Loopy's `LINE_NO` rather than a set of candidates.
- A **solver's** own working candidate scratch. It is a different object with a
  different lifetime, and in a game with no note-taking at all it is the only
  candidate array there is; naming it `pencil` would claim a player-facing
  affordance the game does not offer.

The convention SHALL be enforced by scanning for the retired spellings **as a
typed-array field declaration** rather than by enumerating the games that have
notes: there is no runtime signal for "this array holds candidates", so the
population is not derivable and only the violation is. A bare name scan SHALL
NOT be used, because `marks` remains live and correct elsewhere — `HintMarks`,
the `pencilStrike` move's `marks`, a `Mark[]`.

#### Scenario: A game declares its candidate notes under a retired spelling

- **WHEN** a game's state declares `marks` or `pencils` as a typed array
- **THEN** the vocabulary guard fails, naming the file and line, and offers both
  remedies: rename it, or ledger it as not being a candidate set

#### Scenario: A solver's candidate scratch is left alone

- **WHEN** a game's solver module declares its own `marks` working array
- **THEN** the guard does not convict it, by a stated path rule rather than by an
  enumerated exemption for that game

#### Scenario: A ledgered exception that stops being true fails

- **WHEN** a file ledgered as not holding candidate notes no longer declares a
  retired spelling
- **THEN** the guard fails, so the ledger cannot outlive the finding it records

### Requirement: The Mark-all guard derives its roster from the capability

The cross-game Mark-all guard SHALL derive the games it exercises from
`Game.canMarkAll` and read each game's notes through the shared field name,
rather than carrying a hand-written row per game. The only per-game datum it may
hold is one a game genuinely answers differently — the slot arity — and that
ledger SHALL be asserted to name only games that offer the press.

An enrollment check comparing a hand-written roster with the flag it was copied
from SHALL NOT be kept once the roster is derived from that flag: it is then a
tautology. The question that survives is whether the flag matches what the game
*does*, which is asserted separately.

#### Scenario: A newly ported game shipping Mark-all is guarded immediately

- **WHEN** a game is registered that sets `canMarkAll`
- **THEN** it is exercised by every Mark-all property without any row being added

#### Scenario: A slot-arity entry for a game without the press fails

- **WHEN** the arity ledger names a game that does not offer Mark-all
- **THEN** the guard fails, naming it
