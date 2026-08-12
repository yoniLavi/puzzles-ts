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
hard tier ships a propagating trial SHALL resolve it by whichever of these the
game's ladder determines — and **SHALL NOT delete the tier**:

- where a tier named `Unreasonable` already sits above the rung's tier, **the
  rung moves up to it**, and the lower tier is re-graded by what remains;
- where the rung's tier is the game's **top** tier, **that tier is renamed**
  `Unreasonable`;
- where emptying the tier would leave it with the same technique set as the tier
  below — so that no board can be solvable at it and not below, and the tier
  therefore generates nothing — the game SHALL first **build the missing
  deductive rung** and re-grade, then move the trial up.

A rung that moves SHALL be shown to leave its old tier still generable, at every
size the game offers, before the move is called done; a size/tier pair that
becomes ungenerable SHALL be refused by `validateParams` with a reason rather
than silently downgraded. A game MAY retain the trial at its upstream tier
behind a flag set by its differential and by nothing else, so that a frozen
byte-match oracle survives a divergence that changes every board on the affected
tier.

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

A game MAY still run the trial to **certify** a position — to establish that no
value the player has already entered is wrong, which some hints require before
offering any step at all. Certifying is not narrating: the plan records only the
deductions it may teach, and stops recording at the first point the trial is
needed, while the walk that produces the verdict continues.

#### Scenario: A search may certify a position but never teach one

- **WHEN** a game's hint must first establish that the player's board is still
  consistent with the unique solution, and doing so needs the propagating trial
- **THEN** the trial may run to produce that verdict, and the plan the player is
  shown contains only the steps up to the first point the trial was needed

#### Scenario: Deduction running out is refused, not guessed past

- **WHEN** the only remaining progress on a board needs a value assumed and
  propagated until the board breaks
- **THEN** the hint refuses with a message saying deduction has run out, and
  does not present the surviving assumption as a technique

#### Scenario: A tier that can require guessing says so in its name

- **WHEN** a game's generator can emit, at a given tier, a board whose solution
  needs a propagating trial
- **THEN** that tier is named `Unreasonable`

#### Scenario: Moving a trial rung up leaves the tier below still generable

- **WHEN** a propagating rung is moved off a tier to the game's `Unreasonable`
  tier
- **THEN** every size the game offers still generates at the vacated tier, or
  that size/tier pair is refused by `validateParams` with a reason the player
  can read — the tier is never left silently unreachable, and never quietly
  downgraded to another difficulty

#### Scenario: A byte-match oracle survives the divergence

- **WHEN** moving the rung changes every description the affected tier generates
- **THEN** the game's differential may drive the generator and solver at
  upstream's rung placement through a flag it alone sets, so the frozen fixtures
  still match byte-for-byte over everything the move did not change
