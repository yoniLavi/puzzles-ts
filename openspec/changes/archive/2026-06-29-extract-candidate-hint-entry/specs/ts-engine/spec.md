# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: A shared candidate-elimination hint entry

The shared candidate-elimination module (`src/native/engine/candidate-hint.ts`) SHALL
provide a `candidateHint` entry that owns the `Game.hint` control flow common to every
candidate-elimination game: refuse on a completed board, refuse (with the standard
message) when the game's `findMistakes` reports any mistake, read the `autoPencil`
preference (defaulting off, per the games' default-auto-pencil-off preference), build the
plan via the game's `buildSteps`, refuse when the
plan is empty, and otherwise return the steps. The standard refusal and empty-plan
messages SHALL live in this one place. A game's `hint` SHALL be a one-line call passing
its own `findMistakes` and `buildSteps`; routing through it SHALL be behaviour-preserving.

#### Scenario: A migrated game's hint refusals and success are unchanged

- **WHEN** a candidate-elimination game (Keen, Towers, Unequal, Solo) routes its `hint`
  through the shared entry
- **THEN** a completed board, a board with mistakes, and a stuck board each refuse with the
  same message as before, a solvable board returns the same plan, and the game's hint suite
  passes with no change
