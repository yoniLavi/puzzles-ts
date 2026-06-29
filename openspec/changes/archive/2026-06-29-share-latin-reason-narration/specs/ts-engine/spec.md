# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: A shared narrator for generic Latin deduction reasons

When adopted, the shared Latin-hint module (`src/native/engine/latin-hint.ts`) SHALL
provide a `narrateLatinReason(reason, ns)` that renders the *generic* Latin deduction
reasons whose narration is identical across the **row/column** Latin games (`single`,
`hiddenSingle`, `forcedSingle`, `dup`, `set`, `forcing`). A row/column game (Keen, Unequal)
SHALL delegate those arms to the shared narrator and keep its game-specific arms (cages,
inequality/adjacency clues) local. Delegation SHALL be behaviour-preserving — the rendered
narration strings are byte-identical to before, asserted by each game's hint suite.

A game whose generic-arm wording legitimately diverges SHALL keep its own `narrate` rather
than carry overrides into the shared narrator: **Solo** (its `single`/`dup`/`forcedSingle`
name "row, column and block" and its `hiddenSingle` names a block/diagonal region) and
**Towers** (it narrates the whole family in "height" vocabulary with a single value, not an
`ns` list) are conformingly left local. The requirement is satisfied either by the shared
narrator (for the games where the arms are verbatim-identical) **or** by a recorded decision
in `docs/porting/hint-authoring.md` that a given game's arms were left per-game because the
override surface made a shared narrator less readable — both are conforming outcomes.

#### Scenario: A delegated generic arm narrates identically

- **WHEN** a game routes a generic Latin reason (`single` / `set` / `forcing`) through the
  shared narrator
- **THEN** the produced sentence is byte-identical to the prior per-game string and the
  game's hint suite passes with no change
