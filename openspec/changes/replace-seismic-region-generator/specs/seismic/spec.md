# seismic Specification Delta — replace-seismic-region-generator

## MODIFIED Requirements

### Requirement: Seismic game implements the Game interface

The engine SHALL provide `src/native/games/seismic/` implementing the `Game`
interface for Seismic (Hakyuu / Ripple Effect), registered so the puzzle is
served by the TypeScript engine.

Parameters SHALL be a width, a height, a difficulty (Easy or Hard), and a game
mode (Seismic or Tectonic). Validation SHALL require width and height at least 4
and a known difficulty, matching upstream. A game ID SHALL encode the width,
height, mode and difficulty and round-trip through decode, with a bare number
decoding as a square grid.

Any size bound in validation SHALL be derived from a measurement of the *shipped*
generator rather than inherited, and SHALL carry a reason the Custom-type dialog
can display. The previous bound of 49 cells described upstream's fill-then-merge
region grower, which this change replaces; a constructive grower reaches larger
boards, so the bound SHALL be re-measured and raised, or removed with the reason
recorded in the code. Where a bound remains it SHALL reflect whichever stage is
actually the limit — the region fill or the clue-stripping loop. The retry loops
below any bound SHALL be finite, so a divergence fails with a labelled error
rather than running forever.

Presets SHALL include board sizes the puzzle is normally played at, including
10×10 — reachable only once the region generator is replaced, and named by the
game's own author as the common Hakyuu size.

The grid SHALL be partitioned into regions, and a region of size N SHALL require
one instance of each number from 1 to N. In Seismic mode two equal numbers Z on
the same row or column SHALL be at least Z cells apart; in Tectonic mode two
equal numbers SHALL NOT be orthogonally or diagonally adjacent. Regions SHALL be
represented on the shared disjoint-set structure, and because the wall layout is
determined by region membership alone, generation from a given seed SHALL be
reproducible without matching any particular canonical-element choice.

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height, mode and difficulty are recovered

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset
- **THEN** a board is produced whose unique solution is reachable by the solver at
  the preset's difficulty band

#### Scenario: A board the size the puzzle is normally played at is generable

- **WHEN** a 10×10 board is requested in either mode
- **THEN** it is accepted by validation and a soluble board is produced

#### Scenario: A size the generator cannot reach is still refused up front

- **WHEN** parameters beyond whatever bound the shipped generator was measured to
  reach are validated
- **THEN** they are rejected with a stated reason, rather than accepted and left to
  generate indefinitely

### Requirement: Seismic ports the deductive solver and solver-gated generator

Seismic SHALL provide a solver that fills the grid by candidate elimination — a
naked single and a hidden single within a region at Easy, plus a trial-placement
deduction at Hard — reporting the difficulty reached or that the puzzle is not
uniquely soluble. The solver SHALL enforce the mode's keep-apart rule and the
one-of-each-number-per-region rule while eliminating candidates.

The generator SHALL partition the grid into connected regions **before** placing
any number, and SHALL then fill each region with the numbers 1 to its size by
searching over the solver's own candidate propagation, so that a region holds
exactly the numbers it requires by construction. It SHALL NOT depend on a
post-hoc test that a randomly-merged region happens to hold a valid number set:
that is upstream's approach, its author records it as needing replacement, and its
success rate falls to nothing above roughly fifty cells. The generator SHALL then
strip clues while the puzzle stays soluble at the target difficulty, and accept a
puzzle only when it is soluble at that difficulty and not at the difficulty below
— both stages unchanged. Generation from a given seed SHALL be reproducible,
reusing the bit-identical random source.

Every generated board SHALL satisfy, by test rather than by luck: every region is
connected and holds exactly the numbers 1 to its size; the mode's keep-apart rule
holds across the whole solution; and the description round-trips through the
codec.

Upstream's fill-then-merge generator SHALL be retained behind an option that only
the differential test sets, so that the frozen C-reference fixtures continue to
match byte-for-byte and the solver, the description codec and the clue-stripping
loop keep that oracle. A test SHALL assert that the option still changes the
generated description, so the oracle cannot decay into re-testing the shipped
path.

#### Scenario: The solver grades a puzzle's difficulty

- **WHEN** a uniquely soluble puzzle is solved
- **THEN** the solver reports the lowest difficulty at which its deductions
  complete the grid

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

#### Scenario: Every region is valid by construction

- **WHEN** a board is generated at any preset
- **THEN** each of its regions is connected and holds exactly one of each number
  from 1 to that region's size, and no two equal numbers violate the mode's
  keep-apart rule

#### Scenario: The C-reference oracle still applies to the unchanged stages

- **WHEN** the differential test generates each frozen fixture with upstream's
  region grower selected
- **THEN** the description matches the recorded C description byte-for-byte, and a
  further test confirms that deselecting the option produces a different
  description
