# ts-engine — delta for declare-deduction-techniques

## MODIFIED Requirements

### Requirement: A shared deduction-fixpoint scaffold

The engine SHALL provide a reusable deduction-fixpoint runner (in
`src/engine/`) that a logic game's solver and its explained hint share, so
the ordered-technique loop, the difficulty cap, the optional recorder threading,
and the non-termination step-budget are written **once** rather than hand-rolled
per game.

**A technique is a declaration, not a closure.** The runner SHALL take an
ordered list of techniques, each declaring a stable `id`, the difficulty `tier`
it belongs to, and a `run` reporting whether it changed the board (`> 0` fired,
`0` nothing to do, `< 0` contradiction proved). Both `id` and `tier` SHALL be
required: a ladder states its own tiers rather than encoding them in array
positions, and states its own names rather than leaving a reader to count.

**The grade and the cap are tiers, never positions.** The runner SHALL report as
the grade the highest `tier` among the techniques that fired, and SHALL accept an
optional maximum *tier* that excludes every technique above it **wherever it sits
in the ladder** — so a cheap technique placed after an expensive one is still
run under a low cap. Grading a board SHALL NOT depend on a technique's index.

The runner SHALL also accept an optional recorder that, when present, gates every
reason allocation so the generation path stays byte-for-byte unchanged and, when
absent, runs unguarded. The runner SHALL tick a step budget once per iteration
**only** on the recording (hint) path, so a non-terminating fixpoint throws a
labeled error while the generator runs unbudgeted. **When a budget is present the
runner SHALL attribute a non-termination to the technique responsible**, naming
the techniques by firing count in the thrown error; when no budget is present it
SHALL count nothing, so the generation path allocates nothing extra.

The techniques themselves remain per-game (each game's deductions are its own);
only the loop, cap, recorder-gating, budget and attribution are shared. Games
that hand-roll this loop SHALL converge onto the shared runner without changing
their techniques, order, or verdicts. A game that does **not** fit SHALL have its
reason recorded against this contract, and that record SHALL be re-derived rather
than carried forward when the contract changes — a reason that a game did not fit
an earlier runner is not evidence about the current one.

#### Scenario: The generation path is unchanged by the shared runner

- **WHEN** a game's solver runs through the shared runner with no recorder
- **THEN** it reaches the same solved/stuck verdict (and, where graded, the same
  difficulty) as before the extraction
- **AND** its differential / behavioral regression suite stays green

#### Scenario: The hint path records off the same runner

- **WHEN** the same game runs the shared runner with a recorder on the hint path
- **THEN** each firing is recorded with its technique and premise in solver order
- **AND** a non-terminating fixpoint on the hint path throws a labeled
  step-budget error rather than hanging

#### Scenario: Two techniques sharing one tier grade alike

- **WHEN** a ladder declares two techniques at the same `tier` and only the later
  one fires
- **THEN** the reported grade is that shared tier, not the technique's position
  in the ladder

#### Scenario: A cap excludes by tier, not by position

- **WHEN** a ladder places a low-tier technique after a high-tier one and runs
  under a cap below the high tier
- **THEN** the high-tier technique is skipped and the low-tier one still runs

#### Scenario: A runaway technique is named

- **WHEN** a technique on the recording path reports progress without changing
  the board until the step budget trips
- **THEN** the thrown error names the techniques by firing count, so the
  responsible one is identified without bisecting the ladder
