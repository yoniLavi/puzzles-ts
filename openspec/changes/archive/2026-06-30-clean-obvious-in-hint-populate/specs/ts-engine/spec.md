# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: Candidate-elimination hints clean obvious candidates at populate

A candidate-elimination game's hint plan SHALL, once pencil notes first exist on the working
board — whether the plan just populated them or the board was already noted — emit one
bulk **obvious-candidate cleanup** step that removes every pencilled value already placed in
one of its cell's uniqueness regions, as the adaptive "fill all pencil marks" control's
second press does (`obviousCandidateMarks` over the game's `regionsOf`). The cleanup SHALL be
a single `pencilStrike` step (the marks baked into it at plan time), SHALL be flagged
`continuesPrevious` when it directly follows the populate fill so "fill, then clear the
obvious ones" reads and auto-plays as one setup journey (and stand alone when the board was
already noted), and SHALL fire at most once per plan. An empty cleanup (nothing obvious to
remove) SHALL emit no step. The struck marks SHALL be applied to the plan's working notes so
the rest of the walk sees the cleaned board. The shared engine helper `emitObviousCleanStep`
(`src/native/engine/candidate-hint.ts`) SHALL own this emission so every such game produces
it identically.

Consequently the plan SHALL NOT separately re-teach those obvious row/column/region
eliminations one firing at a time — the bulk clean subsumes the per-given basic-region
opening. The rest of the walk is unchanged: easy-first ordering, the explicit per-placement
cleanup when auto-pencil is off, and the harder combined deductions (sets, forcing chains,
cages, inequality/sightline clues) reached only when no easier move remains.

This applies to every candidate-elimination game with a region-uniqueness populate (Towers,
Unequal, Keen, Solo). A game whose hint has no such populate (Undead) is unaffected.

#### Scenario: A hint's populate fills then bulk-clears the obvious candidates

- **WHEN** an auto-played hint populates the notes on a board carrying placed values
  (givens, or placements the plan made before populate)
- **THEN** the populate journey first fills `1..n` in every empty cell, then strikes in one
  `continuesPrevious` step every candidate already placed in its row/column/region, leaving
  the same notes the adaptive Mark-all control would produce — and the plan does not afterward
  re-teach those obvious eliminations individually

#### Scenario: The cleaned-note plan still replays and refreshes

- **WHEN** the populate-plus-clean journey is followed, undone/redone, or re-requested
- **THEN** the `pencilStrike` cleanup replays exactly (its marks were baked at plan time),
  `hintKeepTrack` and `refreshHintStep` treat it as an ordinary strike step, and the hint
  resume guarantees hold
