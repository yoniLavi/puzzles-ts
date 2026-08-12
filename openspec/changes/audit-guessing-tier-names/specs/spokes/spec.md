# spokes Specification Delta — audit-guessing-tier-names

Spokes' top tier is renamed `Hard` → `Unreasonable`, and its hint stops narrating
that tier's rung. Design D10 has the reasoning; the short form is that the spec
above described **one** look-ahead rung and there are **two**.

`spokesSolve` calls `spokesSolverAttempt` twice, and only the sub-tier argument
distinguishes them. Tricky passes `DIFF_LIMITED`, an Easy pass that stops at
`ACTION_LIMIT` — a bounded chain, a *Tactic*, which measured a median of 2 and a
maximum of 9 deductions. The top tier passes `DIFF_EASY`, the same pass with no
bound: also a median of 2, but a p90 of 11 and a **maximum of 35 hubs on a
36-hub grid**, i.e. it finishes the puzzle from the hypothesis. That is a
*Search*.

**The rule the spec gains from this is about classification, not about Spokes**:
a trial rung is classified by the bound it *guarantees*, not by the depth it
typically reaches. Deciding on the medians would have given both rungs the same
name and one of them would have been wrong.

The internal difficulty key and character are unchanged, so game IDs, saved games
and shared links are unaffected, and **no board moves**: the solver keeps both
rungs, so the generator grades exactly as before.

## MODIFIED Requirements

### Requirement: Spokes game implements the Game interface

The engine SHALL provide `src/games/spokes/` implementing the `Game`
interface for Spokes, registered so the puzzle is served by the TypeScript engine.

Parameters SHALL be a width, a height, and a difficulty (Easy, Tricky or
`Unreasonable`). The top tier is named `Unreasonable` rather than upstream's
`Hard` because its look-ahead runs an unbounded sub-solve from a hypothesis; its
internal key and encoded difficulty character are unchanged, so an existing game
ID names the same board. Validation SHALL require width and height each at least
2, matching upstream, with no upper bound. A game ID SHALL encode the width,
height and difficulty and round-trip through decode.

Spokes SHALL be a uniquely-solvable line-drawing puzzle and SHALL declare a
`findMistakes` hook, so that Check & Save flags a wrong board rather than saving it
silently.

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose hubs can be connected into one satisfied,
  fully connected group, deducible at the requested difficulty

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and difficulty are recovered
- **AND** the encoded difficulty character for the top tier is the one it had
  under its former name

### Requirement: Spokes ports the tiered deductive solver and solver-gated generator

Spokes SHALL provide a solver that draws the forced lines and marks for a board, or
reports the board invalid or incomplete, at a requested difficulty of Easy, Tricky
or `Unreasonable`. The solver SHALL apply hub saturation and exhaustion,
diagonal-crossing marks, and the two-ones rule; the two harder tiers SHALL
additionally apply contradiction look-ahead. The solver SHALL determine board
validity by connectivity, treating a set of hubs that can draw no further line to
the rest of the board as invalid and a fully connected, fully satisfied board as
solved.

The contradiction look-ahead SHALL be deterministic and exhaustive, not a guessing
tier: a value is committed only when the opposite value provably leads to an invalid
board. It SHALL nevertheless be applied at **two distinct strengths**, and they are
two rungs rather than one:

- at **Tricky**, the sub-solve that tests the hypothesis SHALL be bounded by a
  fixed deduction limit, so the reasoning is a chain a player could follow;
- at **`Unreasonable`**, the sub-solve SHALL be unbounded, which is what the tier's
  name reports.

The bound SHALL have a single definition in the solver, and it SHALL be documented
as load-bearing for the tier names rather than as a performance dial, since
lifting it would silently make the middle tier a search.

The generator SHALL use the solver to keep every board uniquely soluble: it SHALL
start from every horizontal and vertical line plus a random diagonal per cell, then
remove lines in a randomised order, keeping a removal only while every hub retains at
least one line and the board stays uniquely soluble at the target difficulty and no
easier. Generation from a given seed SHALL be reproducible.

#### Scenario: The solver deduces the unique solution

- **WHEN** a generated board is solved at its difficulty
- **THEN** the solver reaches a single fully connected, fully satisfied
  configuration of lines and marks

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Spokes grades its difficulty tiers honestly

A Spokes board generated at a difficulty above the easiest SHALL NOT be soluble at
the tier below it. The acceptance check that decides this SHALL run from an empty
position, so that its verdict describes the board being offered rather than any
state left over from an earlier candidate.

This deliberately diverges from upstream, whose equivalent check re-solves a scratch
board whose lines still carry the previous candidate's solution, and which therefore
both rejects boards for reasons unrelated to difficulty and admits boards an easier
tier can crack. Because generation is solver-gated, the divergence changes every
description on the two harder tiers, so the byte-for-byte differential against the C
SHALL retain a way to run upstream's original check, used by that differential alone.

#### Scenario: An Unreasonable board genuinely needs its own tier

- **WHEN** a board generated at `Unreasonable` is solved at Tricky
- **THEN** the solver does not reach a solution
- **AND** solving the same board at `Unreasonable` does reach one

#### Scenario: The differential still compares against upstream's generator

- **WHEN** the frozen C-reference fixtures are regenerated by the TypeScript
  generator running upstream's original acceptance check
- **THEN** each description matches the C byte for byte

## ADDED Requirements

### Requirement: Spokes' hint stops at bounded reasoning

The Spokes hint SHALL narrate the contradiction look-ahead only at its **bounded**
strength. The unbounded rung — the one the `Unreasonable` tier is named for —
SHALL NOT contribute a firing to a hint plan on any tier, including boards
generated below that tier. Where deduction and the bounded look-ahead run out, the
hint SHALL refuse with a message saying no further move can be deduced.

The solver SHALL retain the unbounded rung, so that generation and grading are
unchanged and every description is byte-identical to what the game shipped before.

**The guarantee SHALL be structural rather than a check on the wording.** Both
rungs are the same function and produce the *same* narration — an anchored,
classified sentence naming the hub that would over-fill, the diagonals that would
cross, or the hubs that would be stranded — so a vocabulary guard cannot tell them
apart. The game's tests SHALL therefore assert the property directly, with a
control that prevents it holding vacuously.

#### Scenario: Planning at the top tier buys the plan nothing

- **WHEN** a hint plan is computed for the same board at the top tier and at
  Tricky
- **THEN** the two plans are the same sequence of firings
- **AND** on at least one sampled board the Tricky plan is longer than the Easy
  one, so the equality is a fact about the top tier rather than about every tier
  producing the same plan
