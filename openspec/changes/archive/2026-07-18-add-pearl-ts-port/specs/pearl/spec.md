# pearl Specification

## ADDED Requirements

### Requirement: Pearl game implements the Game interface

The engine SHALL provide a registered `pearl` game implementing
`Game<PearlParams, PearlState, PearlMove, PearlUi, PearlDrawState, PearlMistake>`:
draw a single closed loop through grid cells so that it turns a right angle at
every black pearl (and goes straight through at least one cell on each side of
it) and passes straight through every white pearl (turning immediately before or
after). Params SHALL be `w`, `h`, `difficulty` (Easy or Tricky) and `nosolve`
(allow an unsoluble board, default false), encoded `{w}x{h}` with a full-form
`d{char}` difficulty suffix and an `n` suffix when `nosolve` is set.
`validateParams` SHALL enforce `w ≥ 5`, `h ≥ 5`, that width×height does not
overflow, and that a Tricky board has `w + h ≥ 11`. The 8 upstream presets
(6×6, 8×8, 10×10, 12×8 each at Easy and Tricky) SHALL be offered. The game SHALL
report `canSolve = true` and `canFormatAsText = true`, and SHALL drive a
completion flash suppressed after Solve. The two upstream appearance styles
(traditional Masyu and loopy) SHALL be selectable via an `appearance`
preference (default traditional).

#### Scenario: Params round-trip

- **WHEN** params `{ w: 10, h: 10, difficulty: Tricky, nosolve: false }` are
  encoded in full
- **THEN** decoding the result round-trips the params

#### Scenario: Tricky requires a large enough board

- **WHEN** `validateParams` is given a Tricky board with `w + h < 11`, or any
  board with `w < 5` or `h < 5`
- **THEN** it returns a non-null error string

### Requirement: Pearl descriptions use the upstream run-length encoding

The desc SHALL encode the clue grid row-major as a run-length string: lowercase
letters compress runs of unclued cells, `B` marks a black pearl and `W` marks a
white pearl. `validateDesc` SHALL reject an unknown character and a description
whose decoded cell count does not exactly fill the grid. `newState` SHALL parse
the desc into the immutable clue grid, with the loop lines and no-line marks
initially empty.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with too much or too little data to
  fill the grid
- **THEN** it returns a non-null error string

### Requirement: Pearl ports the deductive solver and solver-gated generator faithfully

The port SHALL implement `pearl_solve` as pure iterative constraint propagation
(no guessing or recursion) over the edge/square workspace: edge↔square
elimination, the black-pearl and white-pearl clue deductions, and shortcut-loop
detection over a union-find, with the Tricky tier additionally applying the
premature-short-loop rules. It SHALL return the three-valued verdict
(inconsistent / unique / ambiguous), and a grading routine SHALL return the
easiest difficulty that yields a unique solution. The generator SHALL build a
random loop via the shared `generateLoop` (biased toward black-pearl corners),
derive a maximal clue set, gate on the solver finding a unique solution at the
requested difficulty (and failing one tier easier), then greedily minimise the
clues — reproducing the upstream RNG draw order byte-for-byte (including the
upstream `corners`-array quirk that consumes a shuffle sized by the straight
count, and the 5×5-Tricky→Easy downgrade) — so that for a given seed and params
the produced desc and aux reproduce the C output exactly. `solve` SHALL return
the generator's aux when present, else re-solve from the clues.

#### Scenario: Generated boards are uniquely solvable at their difficulty

- **WHEN** a board is generated with `nosolve = false` and graded by the TS solver
- **THEN** the grading is a unique solution at exactly the requested difficulty

#### Scenario: Desc reproduces the C reference byte for byte

- **WHEN** `newDesc` runs for a fixture's seed and params
- **THEN** the produced desc and aux equal the recorded C values exactly, and the
  TS solver grades the decoded board at the C-recorded difficulty

### Requirement: Pearl reports completion and mistakes

The port SHALL compute completion and always-on error marks faithfully to
`check_completion` — a union-find loop classification flagging squares of degree
greater than two, non-reciprocal links, and clue contradictions, and setting the
completed flag only when the lines form one closed loop satisfying every clue.
Because boards are uniquely solvable by default, the game SHALL implement
`findMistakes`: re-solve from the clues to the unique solution's line grid and
return every line segment the player has drawn that the solution does not contain
(a definite mistake); a *missing* solution segment is not a mistake, and a board
that is not uniquely solvable (a `nosolve` board) yields no mistakes. Check & Save
depends on this hook and SHALL refuse to save while any mistake is present. The
always-on error marks and the `findMistakes` overlay are distinct signals.

#### Scenario: A line the solution does not contain is flagged

- **WHEN** the player has drawn a loop segment that the unique solution does not
  contain, and `findMistakes` is invoked
- **THEN** that segment is returned as a mistake

#### Scenario: A correct partial board has no mistakes

- **WHEN** the player has drawn only loop segments that the unique solution
  contains
- **THEN** `findMistakes` returns an empty result

### Requirement: Pearl input and rendering

`interpretMove` SHALL support drawing the loop by dragging along grid edges
(committing the traced path as a sequence of line-segment flips, respecting
existing no-line marks as barriers and the loop-closure degree rule), marking
"no-line" crosses with the secondary (right) drag, and a keyboard cursor that
draws lines or marks with modifiers; an in-place autosolve hint on the `H` key; a
drag or click that changes nothing SHALL produce no move; laying a line over a
mark SHALL be rejected. `redraw` SHALL render the grid in the selected appearance
style (traditional square outlines, or loopy centre-dots plus inter-cell grid),
the black and white pearls, the no-line crosses, the loop segments (with the drag
preview and error recolouring), the flagged-mistake segment colour, and the
completion flash, with the palette index-for-index against the upstream colour
enum.

#### Scenario: A drag draws a loop path

- **WHEN** the player left-drags along a sequence of grid edges
- **THEN** `interpretMove` yields a move whose execution sets those loop segments

#### Scenario: A no-op drag yields no move

- **WHEN** the player drags or clicks in a way that would change no segment or
  mark
- **THEN** `interpretMove` yields no move (returns null or a UI update only)
