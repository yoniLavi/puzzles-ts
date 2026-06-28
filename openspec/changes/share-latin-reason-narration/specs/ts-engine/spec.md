# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: A shared narrator for generic Latin deduction reasons

When adopted, the shared Latin-hint module (`src/native/engine/latin-hint.ts`) SHALL
provide a `narrateLatinReason(reason, ns)` that renders the *generic* Latin deduction
reasons whose narration is identical across the candidate-elimination games (at least
`single`, `set`, and `forcing`). A game SHALL delegate those arms to the shared narrator
and keep its game-specific arms (cages, inequality/adjacency clues, intersections,
sightlines) local. Delegation SHALL be behaviour-preserving — the rendered narration
strings are byte-identical to before, asserted by each game's hint suite.

The requirement is satisfied either by the shared narrator (when the shared arm set, net of
any per-game overrides, is a genuine simplification) **or** by a recorded decision in
`docs/porting/hint-authoring.md` that the arms were left per-game because the override
surface made a shared narrator less readable — both are conforming outcomes.

#### Scenario: A delegated generic arm narrates identically

- **WHEN** a game routes a generic Latin reason (`single` / `set` / `forcing`) through the
  shared narrator
- **THEN** the produced sentence is byte-identical to the prior per-game string and the
  game's hint suite passes with no change
