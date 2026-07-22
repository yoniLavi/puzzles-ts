# subsets Specification

## Purpose
TBD - created by archiving change add-subsets-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Subsets game implements the Game interface

The engine SHALL provide `src/native/games/subsets/` implementing the `Game`
interface for Subsets, registered so the puzzle is served by the TypeScript
engine.

Parameters SHALL be a width, a height and a universe size `n`. Validation SHALL
accept only `4×4` with `n = 4`, matching upstream, and there SHALL be a single
preset for those parameters. A game ID SHALL encode the width, height and universe
size and round-trip through decode. No Custom-parameters dialog SHALL be offered,
because only one configuration is legal.

Subsets is a deductive puzzle with a unique solution, so it SHALL declare a
`findMistakes` hook.

#### Scenario: The preset produces a soluble board

- **WHEN** a new game is generated for the preset
- **THEN** a board is produced whose given clues are internally consistent and
  whose full solution the solver reaches

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and universe size are recovered

#### Scenario: Unsupported parameters are rejected

- **WHEN** parameters other than `4×4` with `n = 4` are validated
- **THEN** they are rejected with the upstream "only 4x4 supported" message

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
upstream order. The solver SHALL NOT include upstream's disabled advanced-rule
branch, so that its strength matches the compiled C exactly.

The generator SHALL assign every set-value to the grid by a single shuffle, derive
all arrow clues from the subset relation, then blank cells in a shuffled order,
keeping a cell blank only while the solver still reaches a complete solution.
Generation from a given seed SHALL be reproducible, and the TypeScript generator
SHALL reproduce the C description byte-for-byte for the same seed.

#### Scenario: The solver classifies a board

- **WHEN** a solvable board, an ambiguous board and a rule-violating board are each
  solved
- **THEN** the solver reports complete, unfinished and invalid respectively

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the preset parameters
- **THEN** both runs produce the identical board description

#### Scenario: The TypeScript generator matches the C description

- **WHEN** a board is generated from a seed by both the C reference and the
  TypeScript port
- **THEN** the two descriptions are byte-for-byte identical

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

Subsets SHALL implement the hint hook, computing a full narrated plan from the
player's current marks (continuing from the position, not restarting from the
givens) using exactly the deductions of the shipped solver — the hint SHALL
NOT deduce more than the generator's uniqueness gate vetted.

Each hint step SHALL decide **one letter slot**, and its narration SHALL be
structured *attention → deduction → action*: the thing to look at (a
highlighted neighbour cell across a horseshoe, or a highlighted set in the
tally), what it forces, and the mark to make — never a bare instruction and
never a shared "for the same reason". A deduction that decides several letters
of a cell SHALL be presented as one sub-goal journey whose later letters are
continuation steps; each continuation step SHALL carry its own per-slot string
that names its referent explicitly (never a bare pronoun) and signals that it
continues the same sub-goal. All of the journey's marks SHALL render in the
same hint colour. The acted-on slot SHALL
be highlighted, together with the evidence the step's narration names.

The hint SHALL prefer the most teachable deduction available: a horseshoe
propagation, then a **hidden single** (a set that can still go in only one
cell), then a candidate collapse (a cell that can hold only one set). A hidden
single SHALL be shown with the set→placement spotlight (below). A collapse
step SHALL additionally explain why at least one competitor set is excluded —
naming that set and the visible rule that blocks it (already placed, a
horseshoe, or a missing horseshoe) — and highlight the cell that blocks it.

The hint SHALL refuse with an explanatory message on a board whose marks are
mistaken — whether flagged by the rule validator or contradicting the unique
solution while locally clean — and on a solved board.

#### Scenario: A hint narrates an arrow deduction

- **WHEN** a hint is requested and the next deduction propagates a letter
  across a horseshoe arrow
- **THEN** the step targets that letter's slot, highlights the neighbour the
  arrow connects, and its narration states the containment premise and the
  forced conclusion for that slot

#### Scenario: A hidden single is shown with its placement spotlight

- **WHEN** the next deduction is a set that can still legally go in only one
  cell
- **THEN** the step spotlights that set's single candidate cell and its tally
  entry, and narrates that the set can go nowhere else before marking the slot

#### Scenario: A deduction deciding several letters reads as one journey

- **WHEN** a single deduction decides more than one letter of a cell
- **THEN** the letters are emitted as one journey whose later steps are
  flagged as continuations — each with its own per-slot narration — and
  auto-hint plays them as one coherent hint

#### Scenario: A mistaken board is refused honestly

- **WHEN** a hint is requested on a board with a mark that contradicts the
  unique solution, whether or not a local rule is yet violated
- **THEN** no plan is shown and the player is told a mark must be wrong

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

