# ts-engine Specification Delta — audit-guessing-tier-names

## MODIFIED Requirements

### Requirement: A hint step always names a technique — no un-narrated fallback

A displayed hint step SHALL always explain *why* its move is forced by a named
technique; a game's hint SHALL NOT emit a generic, unexplained "fallback" step
(e.g. "only one arrangement fits") for a deduction its technique set does not
cover. A game SHALL satisfy this by one of two strategies: **narrating every
deduction** its generator accepts (promoting any catch-all into an honest, if
non-local or tedious, technique — as Filling narrates its global
candidate-elimination), or **rejecting at generation** the boards whose solution
needs a deduction it cannot narrate (see the `ts-migration` narratable-deduction
generation policy). This is the Hint-System companion to that generation policy.

**A search is not a technique.** Where a conclusion is reached by assuming a
value and *propagating* — running the deduction chain from the hypothesis until
something breaks — the hint SHALL NOT report the survivor as though it were a
deduction, on any tier. It SHALL refuse instead, and the refusal SHALL say that
deduction has run out rather than reading as a failure. A contradiction visible
**at the placement**, with no propagation, is ordinary deduction and may be
narrated anywhere: the test is whether the rejected trial propagates before the
oracle is asked, not whether the technique is called "forcing".

The tier names follow the same line. A tier whose boards can require guessing
SHALL be named `Unreasonable`; no other tier name may require it. A game whose
hard tier ships a propagating trial therefore either renames the tier, gates
its generation to what the name promises, or restructures the rung.

This requirement governs deductive (logic) games. Movement/objective games whose
hint is heuristic or an `aux`-walk carry an intentionally empty or imperative
explanation and are exempt.

#### Scenario: A logic game's hint never shows an unexplained step

- **WHEN** a hint plan is computed for any board of a deductive game
- **THEN** every step names the technique that forces it (its explanation is not a
  generic "only one arrangement fits" placeholder)

#### Scenario: A movement game's hint is exempt

- **WHEN** a movement/objective game (no deductive "why") returns a hint
- **THEN** an empty or imperative explanation is permitted and is not a violation

#### Scenario: Deduction running out is refused, not guessed past

- **WHEN** the only remaining progress on a board needs a value assumed and
  propagated until the board breaks
- **THEN** the hint refuses with a message saying deduction has run out, and
  does not present the surviving assumption as a technique

#### Scenario: A tier that can require guessing says so in its name

- **WHEN** a game's generator can emit, at a given tier, a board whose solution
  needs a propagating trial
- **THEN** that tier is named `Unreasonable`
