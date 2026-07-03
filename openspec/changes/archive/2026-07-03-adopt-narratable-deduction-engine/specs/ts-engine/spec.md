# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: A shared deduction-fixpoint scaffold

The engine SHALL provide a reusable deduction-fixpoint runner (in
`src/native/engine/`) that a logic game's solver and its explained hint share, so
the ordered-rung loop, the difficulty cap, the optional recorder threading, and
the non-termination step-budget are written **once** rather than hand-rolled per
game. The runner SHALL take an ordered list of technique rungs (each reporting
whether it changed the board), an optional maximum rung (to cap grading at a
tier's needed rung), and an optional recorder that, when present, gates every
reason allocation so the generation path stays byte-for-byte unchanged and, when
absent, runs unguarded. The runner SHALL tick a step budget once per iteration
**only** on the recording (hint) path, so a non-terminating fixpoint throws a
labelled error while the generator runs unbudgeted.

The technique rungs themselves remain per-game (each game's deductions are its
own); only the loop, cap, recorder-gating, and budget are shared. Games that
currently hand-roll this loop (Filling, Pattern, Undead, and the Latin core)
SHALL converge onto the shared runner without changing their techniques, order,
or verdicts.

#### Scenario: The generation path is unchanged by the shared runner

- **WHEN** a game's solver runs through the shared runner with no recorder
- **THEN** it reaches the same solved/stuck verdict (and, where graded, the same
  difficulty) as before the extraction
- **AND** its differential / behavioural regression suite stays green

#### Scenario: The hint path records off the same runner

- **WHEN** the same game runs the shared runner with a recorder on the hint path
- **THEN** each firing is recorded with its technique and premise in solver order
- **AND** a non-terminating fixpoint on the hint path throws a labelled
  step-budget error rather than hanging

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

This requirement governs deductive (logic) games. Movement/objective games whose
hint is heuristic or an `aux`-walk carry an intentionally empty or imperative
explanation and are exempt; an explicitly-named `Unreasonable` tier MAY carry a
non-deductive hint on boards that require guessing.

#### Scenario: A logic game's hint never shows an unexplained step

- **WHEN** a hint plan is computed for any non-`Unreasonable` board of a deductive
  game
- **THEN** every step names the technique that forces it (its explanation is not a
  generic "only one arrangement fits" placeholder)

#### Scenario: A movement game's hint is exempt

- **WHEN** a movement/objective game (no deductive "why") returns a hint
- **THEN** an empty or imperative explanation is permitted and is not a violation
