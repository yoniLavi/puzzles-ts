# mosaic Specification

## Purpose
TBD - created by archiving change add-mosaic-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Mosaic game implements the Game interface

The engine SHALL provide a registered `mosaic` game implementing
`Game<MosaicParams, MosaicState, MosaicMove, MosaicUi, MosaicDrawState>`: a
grid-fill puzzle in which numeric clues state how many cells in the clue's
3×3 neighbourhood (including itself) are black, and the player marks every
cell black or white. Params SHALL be `width`, `height`, and `aggressive`
(harder generation via clue minimisation), encoded `{w}x{h}` with an
`h{0|1}` suffix when `aggressive` differs from the default (true). The 6
upstream presets — 3×3, 5×5, 10×10, 15×15, 25×25 (aggressive) and 50×50
(non-aggressive) — SHALL be offered, and the type summary SHALL render via
the `width`/`height`/`aggressive-generation` config keys with `aggressive`
surfaced as a boolean. `validateParams` SHALL reject boards smaller than 3×3
or larger than 10000 tiles. The game SHALL report `wantsStatusbar = true`,
`isTimed = false`, `canSolve = true`, and `canFormatAsText = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ width: 10, height: 8, aggressive: true }` are encoded in
  full
- **THEN** the result is `10x8` (default aggressiveness elided)
- **AND** `{ width: 50, height: 50, aggressive: false }` encodes to `50x50h0`
- **AND** decoding each string round-trips the params

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with a 2×3 board, or with 101×100 cells
  (> 10000 tiles)
- **THEN** it returns a non-null error string

### Requirement: Mosaic descriptions are run-length clue grids

The desc SHALL encode the board in scan order: a digit `0`-`9` for each
shown clue and a letter `a`-`z` for each run of 1-26 hidden cells, exactly
as upstream. `validateDesc` SHALL reject any other character and any desc
whose decoded length differs from `width*height`. `newState` SHALL parse
the desc into a clue board shared (frozen, by reference) across all states
of the game, with all cells initially unmarked and `notCompletedClues`
equal to the number of shown clues.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded from the
  resulting board
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with an invalid character or a
  decoded length mismatching the params
- **THEN** it returns a non-null error string

### Requirement: Mosaic generates deduction-solvable boards

`newDesc` SHALL generate a random black/white image (one `randomBits` bit
per cell), compute every cell's clue (a border cell counting only in-bounds
neighbours, with "full" detected at clue 9 interior / 6 edge / 4 corner and
"empty" at clue 0), regenerate until the board has a usable starting
deduction and the shuffled-order deductive solver completes it, then hide
clues: every clue whose deduction never narrowed anything is hidden, and in
aggressive mode the remaining clues are additionally tried for hiding in
random order, reverting any hide that makes the board unsolvable.

#### Scenario: Generated boards are valid and solvable

- **WHEN** `newDesc` runs for a seeded RNG across several sizes with
  aggressive generation on and off
- **THEN** every desc passes `validateDesc`
- **AND** the deductive solver solves every resulting board from its visible
  clues alone

### Requirement: Mosaic marks cells via toggle and straight-line paint moves

A `MosaicMove` SHALL be one of: toggle a cell (one step, or two steps for
the right-button/select2 cycle unmarked→marked→blank), paint a straight
run of cells with a captured target state, or solve. `executeMove` SHALL be
pure and throw on an out-of-bounds target. A toggle SHALL strip any
`SOLVED`/`ERROR` overlay then cycle the cell's mark; a paint SHALL set only
still-unmarked cells along the run. After each move the game SHALL reflag
every affected clue — `SOLVED` when exactly satisfied with no unknowns,
`ERROR` when overcommitted (more marks than the clue, or too few possible)
— and recount `notCompletedClues`. Pointer input SHALL capture the
post-toggle state of the clicked cell and paint it through aligned drags
and the release; non-aligned drags reset the anchor; margin clicks are
ignored; after completion only cursor movement is accepted. A keyboard
cursor with select/select2 SHALL mirror the click behaviours.

#### Scenario: Toggling cycles a cell

- **WHEN** a cell is toggled three times (single steps)
- **THEN** it passes marked → blank → unmarked

#### Scenario: Painting fills only unmarked cells

- **WHEN** a paint move covers a run containing a marked cell and unmarked
  cells, painting blank
- **THEN** the unmarked cells become blank and the already-marked cell is
  unchanged

#### Scenario: A satisfied clue greys out and a contradicted clue reddens

- **WHEN** a clue's neighbourhood is fully determined with exactly the clue's
  count marked
- **THEN** the clue carries the `SOLVED` flag (drawn grey)
- **AND** when more cells are marked around a clue than its value, it carries
  the `ERROR` flag (drawn red)

#### Scenario: Completing every clue solves the game

- **WHEN** the last clue becomes satisfied
- **THEN** `notCompletedClues` is 0, `status` returns `"solved"`, the status
  bar reads `COMPLETED!`, and a 0.5s flash plays

### Requirement: Mosaic solves and checks mistakes against the deduced solution

The Solve command SHALL run the deductive solver on the clue board and apply
the full solution (cells flagged solved, `cheating` set, status bar reading
`Auto solved`), failing with an error when deduction cannot complete the
board. `findMistakes` SHALL return every cell the player has determined
whose mark contradicts the deduced solution, rendered as an error-coloured
outline overlay, and SHALL return no mistakes when deduction stalls or the
marks are consistent.

#### Scenario: Solve completes the board

- **WHEN** the Solve command runs on a generated board
- **THEN** every cell is determined, `status` returns `"solved"`, and the
  status bar reads `Auto solved`

#### Scenario: findMistakes flags a wrong mark

- **WHEN** the player marks black a cell that is white in the solution and
  Check & Save runs
- **THEN** `findMistakes` returns that cell
- **AND** a correctly-marked board returns no mistakes

