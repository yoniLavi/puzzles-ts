# ts-engine

## ADDED Requirements

### Requirement: Hint narration SHALL be short enough to read at a glance

Every hint step's narration SHALL be at most 120 characters. The check SHALL
cover every hinting game at every tier (every preset, for a game without
tiers) and SHALL walk each board's plans into the middle of the game rather
than reading only the opening plan, because the sentences that need room are
the ones spoken once more of the board is decided.

A sentence template MAY exceed the limit only when a ledger entry names it,
the games that speak it, and the reason it needs the room. A ledgered sentence
SHALL still be at most 300 characters. The ledger SHALL be asserted in both
directions: a step over the limit that no entry matches fails, and an entry
that matches no step over the limit fails, so a sentence brought under the
limit takes its entry with it.

#### Scenario: A long sentence without a ledger entry fails

- **WHEN** a hint step's narration is longer than 120 characters and no ledger
  entry for its game matches it
- **THEN** the check fails, naming the sentence and its length

#### Scenario: A ledger entry that no longer matches anything long fails

- **WHEN** a ledgered sentence is shortened under 120 characters, or stops
  being spoken
- **THEN** the check fails until the entry is deleted

#### Scenario: A ledgered sentence still has a ceiling

- **WHEN** a ledgered sentence grows past 300 characters
- **THEN** the check fails, ledger or not
