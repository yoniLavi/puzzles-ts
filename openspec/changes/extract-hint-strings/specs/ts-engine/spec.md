## MODIFIED Requirements

### Requirement: A shared narrator for generic Latin deduction reasons

When adopted, the shared hint-text module (`src/engine/hint-text.ts`) SHALL
provide a `narrateLatinReason(reason, ns)` that renders the *generic* Latin deduction
reasons whose narration is identical across the **row/column** Latin games (`single`,
`hiddenSingle`, `forcedSingle`, `dup`, `set`, `forcing`). A row/column game (Keen, Unequal)
SHALL delegate those arms to the shared narrator and keep its game-specific arms (cages,
inequality/adjacency clues) local. Delegation SHALL be behavior-preserving — the rendered
narration strings are byte-identical to before, asserted by each game's hint suite.

A game whose generic-arm wording legitimately diverges SHALL keep its own `narrate` rather
than carry overrides into the shared narrator: **Solo** (its `single`/`dup`/`forcedSingle`
name "row, column and block" and its `hiddenSingle` names a block/diagonal region) and
**Towers** (it narrates the whole family in "height" vocabulary with a single value, not an
`ns` list) are conformingly left local. The requirement is satisfied either by the shared
narrator (for the games where the arms are verbatim-identical) **or** by a recorded decision
in `docs/games/hints.md` that a given game's arms were left per-game because the
override surface made a shared narrator less readable — both are conforming outcomes.

#### Scenario: A delegated generic arm narrates identically

- **WHEN** a game routes a generic Latin reason (`single` / `set` / `forcing`) through the
  shared narrator
- **THEN** the produced sentence is byte-identical to the prior per-game string and the
  game's hint suite passes with no change

## ADDED Requirements

### Requirement: A game's hint sentences SHALL live in one text module per game

Every game whose hint speaks SHALL keep every sentence it speaks, and every word inside
one, in `src/games/<id>/hint-text.ts`, exported as `say`; sentences several games speak
word for word SHALL live in `src/engine/hint-text.ts`. A game's narration SHALL decide
only which sentence a step speaks and with what values, passing values as the board means
them (counts, axes, directions, the deduction's own record) and never words, and a text
module SHALL NOT read the board. Refusal messages are outside this requirement: they are
held to one list by `src/engine/hint-refusal.ts` and its guard. A hint that speaks no
words has no text module.

The population SHALL be derived, not declared: a cross-game test finds the games whose
hint speaks and asserts that each has a text module and that no text module belongs to a
game whose hint does not speak.

#### Scenario: A new game's hint speaks

- **WHEN** a game gains a `hint()` whose steps carry narration and no `hint-text.ts`
- **THEN** the cross-game guard fails, naming the game

#### Scenario: Rewording a sentence

- **WHEN** a sentence's wording changes
- **THEN** the change touches the game's `hint-text.ts`, or the engine's for a sentence
  several games share, and not the code that decides which sentence fires
