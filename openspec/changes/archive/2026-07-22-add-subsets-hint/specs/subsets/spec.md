# subsets Specification Delta — add-subsets-hint

## ADDED Requirements

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
the board changes, the reference aid SHALL be suppressed while a hint is
displayed, and all of this SHALL be ephemeral UI state, never persisted.

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
