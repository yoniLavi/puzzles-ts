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

**A search is not a technique, but a chain is — if it is walked.** A deduction
that reaches its conclusion through a hypothesis SHALL be classified by whether
the reasoning is a **bounded run of individually glanceable steps**:

- **Check** — a contradiction visible **at the placement**, with no propagation.
  Ordinary deduction; narratable at any tier.
- **Tactic** — a **bounded** chain of forced consequences to a named endpoint.
  Permitted at a non-`Unreasonable` tier, and its hint SHALL narrate it as a
  **multi-leg journey** — one glanceable inferential step per leg, with the board
  carrying the accumulated state — rather than compressing it into a single
  claim the player can only check by redoing the deduction. Where the conclusion
  rests on more than one branch of a case split, the narration SHALL say so; a
  final leg that does not follow from its own stated premises is a defect.
- **Search** — running the whole solver from a hypothesis, or branching and
  backtracking. The hint SHALL NOT report its survivor as a deduction on any
  tier; it SHALL refuse, and the refusal SHALL say that deduction has run out
  rather than reading as a failure.

The test is therefore not whether a trial propagates, nor whether the technique
is called "forcing", but whether the propagation is bounded and can be laid out
for the player.

Games whose hints are **strategic** rather than deductive — a stable subgoal plus
the next move serving it, justified by a monotone potential rather than by force
— are outside this classification entirely and narrate imperatively.

The tier names follow the same line. A tier whose boards can require **Search**
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

- **WHEN** the only remaining progress on a board needs a value assumed and the
  **whole solver** run from it, or a branch explored and backtracked
- **THEN** the hint refuses with a message saying deduction has run out, and
  does not present the surviving assumption as a technique

#### Scenario: A bounded chain is walked, not asserted

- **WHEN** a hint's next deduction is a bounded chain of forced consequences
  reaching a named contradiction
- **THEN** it is narrated as a multi-leg journey, each leg one inferential step
  shown on the board, rather than as one sentence asserting the conclusion — and
  where the conclusion rests on a case split, the narration states both branches

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
