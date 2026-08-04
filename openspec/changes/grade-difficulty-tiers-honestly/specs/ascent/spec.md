# ascent Specification Delta — grade-difficulty-tiers-honestly

## ADDED Requirements

### Requirement: Ascent grades its difficulty tiers honestly

An Ascent board generated at a difficulty above Easy SHALL NOT be soluble at the
tier below it, in any grid mode.

This diverges from upstream, which has no difficulty gate at all: it blanks clues
(or moves them to edge arrows) while the graded solver still finishes the board and
publishes the result, never asking whether an easier tier would also have done.
Seven of the 22 boards above Easy in this game's own frozen reference fixtures fall
to a lower tier, as did 56 of 180 freshly generated boards.

Because generation is solver-gated at every removal, the correction changes every
description above Easy; the byte-for-byte differential SHALL retain a way to run
upstream's original gate, used by that differential alone. Upstream's generation
loop is unbounded, and the gate introduces rejections, so the loop SHALL be bounded.

The gate's probe SHALL run on solver scratch state that carries nothing from any
previous candidate. Ascent's scratch deliberately retains a flag across solves that
permanently weakens the solver once set — an upstream quirk the port reproduces
because it decides which boards exist — so a probe reusing the generator's scratch
would ask a weakened solver whether the easier tier copes, under-reject, and leave
its own state behind to influence the next candidate.

#### Scenario: A board above Easy genuinely needs its own tier

- **WHEN** a board generated above Easy is solved at the tier below it
- **THEN** the solver does not reach a solution
- **AND** solving the same board at its own tier does

#### Scenario: The probe is not weakened by the candidate before it

- **WHEN** the generator tests whether the easier tier solves a candidate
- **THEN** the solver runs from scratch state initialised for that board alone
