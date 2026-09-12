# seismic Specification

## Purpose
Seismic, the puzzle of numbering each area of size N with 1 to N, under either
the Seismic rule that equal numbers N in a line have at least N cells between
them or the Tectonic rule that equal numbers never touch, even diagonally. This
capability specifies its port to the TS engine, with note-taking,
mistake-checking against the unique solution, and an on-screen keypad sized to
the largest area its generator produces.

## Requirements

### Requirement: Seismic game implements the Game interface

The engine SHALL provide `src/games/seismic/` implementing the `Game`
interface for Seismic (Hakyuu / Ripple Effect), registered so the puzzle is
served by the TypeScript engine.

Parameters SHALL be a width, a height, a difficulty (Easy or Hard), and a game
mode (Seismic or Tectonic). Validation SHALL require width and height at least 4
and a known difficulty, matching upstream. A game ID SHALL encode the width,
height, mode and difficulty and round-trip through decode, with a bare number
decoding as a square grid.

Any size bound in validation SHALL be derived from a measurement of the *shipped*
generator rather than inherited, and SHALL carry a reason the Custom-type dialog
can display, naming the mode it applies to. Where a bound remains it SHALL
reflect whichever stage is actually the limit — the region fill or the
clue-stripping loop. The retry loops below any bound SHALL be finite, so a
divergence fails with a labeled error rather than running forever.

**The bound SHALL be per mode, because the two modes are stopped by different
things and the distinction is not a matter of degree.** Tectonic's limit is
*reachability*: every size up to 100 cells generates, some of them slowly.
Seismic's is *possibility*: 10×10 does not generate at all — each attempt runs
for around sixteen seconds and then exhausts its retry budget — and no amount of
waiting changes that, so its bound SHALL stay at the largest area whose worst
observed run is short. Raising Seismic's bound SHALL require repeating the slow
sizes over several seeds; a bound set from medians is the error this game has
already shipped and retracted once.

**A size the player types in the Custom dialog MAY be one that takes seconds to
generate; a preset SHALL NOT.** A preset is offered to everyone who opens the
Type menu, so a long generation there is a wait nobody chose, whereas a Custom
size is a wait the player asked for knowing the board they wanted. Presets SHALL
therefore stop well inside the bound, and this SHALL be asserted rather than left
to convention. This is what makes 10×10 — the size upstream's own notes call
standard for Hakyuu — available in Tectonic mode without reintroducing the long
menu wait the constructive generator was written to remove.

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

#### Scenario: A board larger than upstream could build is generable

- **WHEN** a board larger than upstream's 7×7 ceiling is requested, within the
  measured bound
- **THEN** it is accepted by validation and a soluble board is produced

#### Scenario: The standard Hakyuu size is available where it can be built

- **WHEN** a 10×10 board is requested in Tectonic mode from the Custom dialog
- **THEN** it is accepted by validation and a soluble board is produced
- **AND** no preset offers that size, so it is reached only by a player who asked
  for it

#### Scenario: A size the generator cannot build is refused up front

- **WHEN** a 10×10 board is requested in Seismic mode
- **THEN** it is rejected with a stated reason naming the mode, rather than
  accepted and left to churn until its retry budget is exhausted

#### Scenario: A size whose worst case is a long wait is kept out of the menu

- **WHEN** presets are enumerated
- **THEN** none of them is a size whose generation tail runs to tens of seconds,
  whatever the validation bound admits

### Requirement: Seismic descriptions use the run-length wall and clue encoding

A Seismic description SHALL encode two comma-separated parts: a run-length list of
the region walls over all horizontal borders followed by all vertical borders,
and a run-length list of the clue numbers in row-major order. Runs of walls SHALL
be written as decimal counts and runs of non-walls as letters, and runs of empty
clue cells SHALL be abbreviated with letters; a clue cell SHALL carry its digit.

Validation SHALL reject a description that uses an unknown wall character, that
forms a region larger than nine cells, or that places a clue larger than its
region's size, and SHALL otherwise accept it. Decoding a description SHALL rebuild
the region structure and the fixed clues.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: An over-large clue is rejected

- **WHEN** a description whose clue exceeds the size of its region is validated
- **THEN** it is rejected as an over-large clue

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

### Requirement: Seismic input, note-taking and completion

Seismic SHALL be played with the Solo control scheme: a left-click or the cursor
keys select a cell for number entry, a right-click selects a cell for pencil
marks, and a mode toggle switches between entering numbers and pencil marks. A
digit SHALL be entered only when it does not exceed the selected cell's region
size, SHALL NOT change a fixed clue, and SHALL be a no-op when it would not change
the cell. The game SHALL offer an on-screen keypad sized to the largest region
the generator produces in the mode (see "The on-screen keypad offers only digits
a board can accept") plus a clear key, a mark-all action that fills every empty
cell with all of its region's candidates, a sticky pencil mode preference, and a
pencil-mode indicator.

Rendering SHALL draw the region boundaries, the placed numbers, and the pencil
marks, SHALL highlight a duplicate-in-region or a keep-apart violation in an error
color as it is entered, and SHALL flash on completion. There SHALL be no move
animation.

#### Scenario: A digit above the region size is rejected

- **WHEN** the player types a digit larger than the selected cell's region size
- **THEN** the board is unchanged

#### Scenario: Completing the grid wins

- **WHEN** the last cell is filled so that every region and keep-apart rule is
  satisfied
- **THEN** the game is reported solved and flashes

### Requirement: Seismic flags mistakes against the unique solution

Because Seismic has a unique solution, it SHALL implement `findMistakes` so that
Check-&-Save can hard-block a save on a wrong board. Given a state, the game SHALL
re-solve from the fixed clues to the unique solution and flag every placed cell
whose value contradicts the solution, and every empty cell whose non-empty pencil
notes have crossed out that cell's solution value. A cell with only extra,
non-contradicting notes SHALL NOT be flagged, and when the givens are not uniquely
soluble no cell SHALL be flagged. The flagged cells SHALL be rendered with a
distinct mistake overlay carried in the render diff key so it repaints on the
frame after the offending move.

#### Scenario: A wrong placement is flagged

- **WHEN** the player enters a number that differs from the unique solution and
  runs Check
- **THEN** that cell is reported as a mistake and Check-&-Save refuses to save

#### Scenario: A crossed-out note is flagged

- **WHEN** an empty cell's pencil notes exclude the value the unique solution
  requires there
- **THEN** that cell is reported as a mistake

#### Scenario: A correct partial board reports no mistakes

- **WHEN** every placed number matches the unique solution and no note crosses out
  a required value
- **THEN** no cell is flagged

### Requirement: The on-screen keypad offers only digits a board can accept

Seismic's `requestKeys` SHALL NOT offer a digit that no board the generator
produces could accept. Entry is capped at the pressed cell's region size, and the
generator draws region sizes from a bounded distribution, so a panel sized to the
*format*'s maximum leaves keys that are inert on every board a player will ever
see. On touch the panel is the only digit-entry route there is, so an inert key
is not a cosmetic surplus — it is a control that does nothing when pressed.

The requirement is on the *relationship*, not on a number: whichever bound the
generator's distribution has, the panel SHALL match it, and widening one SHALL
widen the other. The panel SHALL therefore **derive** that bound from the
generator's own size distribution rather than restate it as a literal — a
restated bound is what produced this defect, when the generator's distribution
changed and a hand-written copy three files away had no way to hear about it.

The bound the panel derives from SHALL be the **generator's**, not the format's.
The two differ (the format admits up to nine in Seismic mode; the generator
produces at most five), they are adjacent enough to be confused, and the panel
confused them.

#### Scenario: No offered digit is unreachable

- **WHEN** the collection-wide on-screen-key guard sweeps Seismic
- **THEN** every button `requestKeys` returns is one `interpretMove` accepts
  somewhere on a generated board, and Seismic carries no entry in the
  inert-panel-key findings list

#### Scenario: Widening the generator widens the panel

- **WHEN** the generator's region-size distribution is changed to admit a larger
  region
- **THEN** the keypad admits the corresponding digits
