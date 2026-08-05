# subsets Specification

## Purpose
TBD - created by archiving change add-subsets-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Subsets game implements the Game interface

The engine SHALL provide `src/games/subsets/` implementing the `Game`
interface for Subsets, registered so the puzzle is served by the TypeScript
engine.

Parameters SHALL be a width, a height, a universe size `n` and a difficulty
tier. Validation SHALL accept only `4×4` with `n = 4`, matching upstream, and
SHALL reject a tier naming no rung rather than silently substituting one. There
SHALL be one preset per tier. A game ID SHALL encode the width, height,
universe size and tier and round-trip through decode, and each tier SHALL
encode to a *distinct* ID. A Custom-parameters dialog SHALL be offered for the
tier alone — the board shape has exactly one legal value, so it is the tier or
nothing.

Subsets is a deductive puzzle with a unique solution, so it SHALL declare a
`findMistakes` hook. It SHALL also declare the `Game.difficulty` contract, so
its tiers fall under the cross-game cap-monotonicity and tier-reachability
guards rather than under hand-written per-game ones.

#### Scenario: The preset produces a soluble board

- **WHEN** a new game is generated for any preset
- **THEN** a board is produced whose given clues are internally consistent and
  whose full solution the solver reaches at that preset's tier

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height, universe size and tier are recovered

#### Scenario: Unsupported parameters are rejected

- **WHEN** parameters other than `4×4` with `n = 4` are validated
- **THEN** they are rejected with the upstream "only 4x4 supported" message

#### Scenario: An unrecognised difficulty character is rejected

- **WHEN** a game ID carries a difficulty character naming no tier
- **THEN** validation rejects it, rather than falling back to another tier

### Requirement: Subsets descriptions use the per-cell arrow encoding

A Subsets description SHALL encode the grid in row-major order as one
comma-separated token per cell: a decimal set number for a given cell or an
underscore for a blank cell, immediately followed by any of the arrow markers `U`,
`R`, `D`, `L` for the horseshoe clues leaving that cell.

Validation SHALL reject a description that carries more or fewer cells than the
grid holds (distinguishing which), that contains a set number out of range for the
universe, that omits a required separator, that uses an unexpected character, that
places an arrow pointing off the grid, or that places two arrows on one edge which
contradict each other.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description carrying more or fewer cells than the grid has is
  validated
- **THEN** it is rejected with a message distinguishing too much data from too
  little

#### Scenario: Contradicting arrows on one edge are rejected

- **WHEN** a description places an arrow from a cell to its neighbour and the
  opposite arrow from that neighbour back
- **THEN** the description is rejected as contradictory

### Requirement: Subsets ports the deductive solver and uniqueness-gated generator

Subsets SHALL provide a solver that reports whether a board is complete,
unfinished or invalid, driven by a candidate-elimination fixpoint over the set of
possible set-values per cell. The solver SHALL apply arrow propagation (a superset
cell contains its subset neighbour's confirmed letters, and a subset cell cannot
hold letters its superset lacks), missing-arrow disjointness, single-count and
single-position placement, and the advanced arrow-subset elimination, in the
upstream order.

The solver SHALL take an explicit difficulty cap, with no default: an implicit
cap is how a caller silently measures a tier it did not mean. At the lowest tier
the rule set SHALL be upstream's compiled strength exactly — that is, without
upstream's disabled advanced-rule branch. Above it the solver SHALL additionally
apply the **mirror half** of the advanced arrow rule: where an arrow forces
`set(head) ⊂ set(tail)`, a surviving candidate at the head that fits inside no
surviving candidate at the tail SHALL be eliminated. Upstream wrote this half,
commented it out under `TODO repair this`, and shipped without it.

That elimination SHALL be sound: it SHALL never remove a set-value that the
board's own solution places in that cell. An unsound elimination yields a puzzle
whose advertised unique solution the solver has ruled out, which is worse than a
weak solver, so soundness SHALL be checked against the generator's known
assignment rather than against the other cap.

The generator SHALL assign every set-value to the grid by a single shuffle, derive
all arrow clues from the subset relation, then blank cells in a shuffled order,
keeping a cell blank only while the solver, capped at the requested tier, still
reaches a complete solution. Above the lowest tier the generator SHALL also
reject a candidate board that the tier below already solves, and SHALL redraw a
wholly fresh board rather than perturbing the rejected one — every candidate here
consumes fresh randomness, so a plain retry cannot re-derive what it rejected.

Generation from a given seed SHALL be reproducible. At the lowest tier the
TypeScript generator SHALL reproduce the C description **byte-for-byte**, on the
live default path and not behind a test-only flag: the new rung is added *above*
upstream's strength rather than in place of it, and the lowest tier has no tier
below it to be graded against, so neither the rules nor the acceptance test nor
the RNG draw order changes there.

#### Scenario: The solver classifies a board

- **WHEN** a solvable board, an ambiguous board and a rule-violating board are each
  solved
- **THEN** the solver reports complete, unfinished and invalid respectively

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

#### Scenario: The TypeScript generator matches the C description

- **WHEN** a board is generated from a seed at the lowest tier by both the C
  reference and the TypeScript port
- **THEN** the two descriptions are byte-for-byte identical

#### Scenario: A board above the lowest tier needs its tier

- **WHEN** a board generated above the lowest tier is solved with the ladder
  capped one tier below it
- **THEN** the solver does not reach a complete solution

#### Scenario: The restored elimination never removes the true answer

- **WHEN** a generated board is re-solved from its description with the ladder at
  its top
- **THEN** the solved board matches, cell for cell, the assignment the generator
  blanked to produce it

### Requirement: Subsets input, marking, mistakes and completion

Subsets SHALL be played by toggling individual letter slots within each cell. A
left-click or select SHALL cycle a slot unknown → known → cleared → unknown, a
right-click or secondary select SHALL cycle unknown → cleared → known → unknown,
and a middle-click or backspace SHALL reset a slot to unknown; a given (immutable)
slot SHALL NOT change. A keyboard cursor SHALL navigate slots, skipping the gaps
between cell blocks. A move SHALL be modelled as a discriminated union, not a move
string.

The game SHALL flag mistakes for Check & Save: a set-value placed in more than one
cell, and any edge whose horseshoe (or missing-horseshoe disjointness) relation is
violated by two decided cells. A Solve action SHALL fill the board from the solver
unless the board is invalid, and SHALL complete the game as solved-with-help
without firing the win flash — a deliberate divergence from upstream, whose solve
move omits the completion bookkeeping (the collection convention wins). The board
SHALL be formattable as text. Rendering
SHALL show each cell's letter slots, the horseshoe arrows, a tally of every
set-value with its placement count, and a completion flash; there SHALL be no move
animation.

#### Scenario: Toggling a letter slot cycles its state

- **WHEN** a mutable letter slot is left-clicked repeatedly
- **THEN** it advances unknown → known → cleared and back to unknown, and a given
  slot does not change

#### Scenario: Completing the grid wins and flashes

- **WHEN** every set is placed exactly once so that all clues hold
- **THEN** the game is reported solved and flashes

#### Scenario: A duplicated placement is flagged as a mistake

- **WHEN** the same set-value is fully placed in two cells and mistakes are checked
- **THEN** both offending cells are reported as mistakes

### Requirement: Subsets provides an explained hint

Subsets SHALL implement `hint()`, planning from the player's current marks and
narrating each firing as the deduction that forces it.

The recorder SHALL be able to narrate every deduction the solver may use,
including rules available only above the lowest tier: a board whose tier the
recorder cannot reach stalls mid-plan with nothing to say. Those rules SHALL be
reached for **only once the cheaper rules are exhausted**, so a board at the
lowest tier is planned exactly as a recorder lacking them would plan it. That
equivalence SHALL be asserted by comparison against a capped recorder, not
assumed — running a stronger rule unconditionally is sound and still silently
re-plans easier boards.

#### Scenario: A hint narrates an arrow deduction

- **WHEN** a hint is requested on a board where a horseshoe forces a letter
- **THEN** the explanation names the arrow relation that forces it, not just the
  letter to write

#### Scenario: A hidden single is shown with its placement spotlight

- **WHEN** a set has exactly one cell it can still legally occupy
- **THEN** the hint places it there and spotlights that cell as the only
  candidate

#### Scenario: A deduction deciding several letters reads as one journey

- **WHEN** one firing decides more than one letter slot
- **THEN** the steps are emitted as a single continued journey rather than
  several separate hints

#### Scenario: A mistaken board is refused honestly

- **WHEN** a hint is requested on a board contradicting its own clues
- **THEN** the hint refuses and points at the mistakes instead of deducing from
  a wrong position

#### Scenario: A board above the lowest tier is fully narratable

- **WHEN** a hint plan is computed from the opening position of a board
  generated above the lowest tier
- **THEN** the plan reaches a complete solution, and the same recorder capped
  one tier lower does not

#### Scenario: The lowest tier's plan is unchanged by the higher rules

- **WHEN** a board at the lowest tier is planned by the full recorder and by one
  capped below the higher rules
- **THEN** both produce the same firings, in the same order

### Requirement: Subsets offers a two-way placement reference aid

Subsets SHALL let the player explore where sets and cells can go, judged
shallowly from the visible board (a cell's own marks and the horseshoe /
missing-horseshoe relations to decided neighbours, plus the exactly-once rule),
never from a solver or the solution:

- selecting a **set** from the tally band SHALL spotlight every cell it can
  still legally go in; if the set is already placed, its home cell SHALL be
  shown in a distinct colour (where it *is*, versus where it could go);
- focusing a **cell** via its dedicated inspect icon — a touch-sized badge in
  the margin above the cell block, doing nothing but inspect (never editing) —
  or by moving the keyboard cursor onto it, SHALL highlight in the tally every
  set that cell could still hold.

The two directions SHALL be mutually exclusive, the spotlight SHALL update as
the board changes, and all of this SHALL be ephemeral UI state, never
persisted. Because the aid and a hint draw in the same overlay space, touching
the aid while a hint is displayed SHALL dismiss the hint (and its status text)
so the aid is shown, rather than the aid being silently suppressed.

#### Scenario: The reference aid dismisses a displayed hint

- **WHEN** the player interacts with the reference aid while a hint is on
  display
- **THEN** the hint is dismissed and the aid is shown

#### Scenario: Spotlighting a set's placements

- **WHEN** the player clicks an unplaced set in the tally band
- **THEN** every cell where that set could still legally go is spotlit, and
  clicking it again clears the spotlight

#### Scenario: A placed set shows where it sits

- **WHEN** the player clicks a set that is already placed
- **THEN** its home cell is highlighted in the distinct "placed" colour, not the
  "could go here" spotlight colour

#### Scenario: A cell shows the sets it can still hold

- **WHEN** the player taps an undecided cell's inspect icon
- **THEN** every set that could still legally go in it is highlighted in the
  tally band, and nothing about the cell is edited

