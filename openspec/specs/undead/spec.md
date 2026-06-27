# undead Specification

## Purpose
TBD - created by archiving change add-undead-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Undead game implements the Game interface

The engine SHALL provide a registered `undead` game implementing
`Game<UndeadParams, UndeadState, UndeadMove, UndeadUi, UndeadDrawState, UndeadMistake>`:
the "Haunted Mirror Mazes" puzzle on a `w × h` grid where each cell is either a
fixed diagonal mirror (`\` or `/`) or a monster cell, and the player places one of
three monsters — Ghost, Vampire, or Zombie — in every monster cell. Params SHALL be
`w`, `h`, and `diff` (Easy, Normal, or Tricky), encoded `{w}x{h}` without `full` and
`{w}x{h}d{c}` with `full` (`c` = `e`/`n`/`t`), with the upstream preset list.
`validateParams` SHALL require `w ≥ 3`, `h ≥ 3`, `w·h ≤ 54`, and a known difficulty.
The game SHALL report `wantsStatusbar = false`, `isTimed = false`,
`canSolve = true`, `canFormatAsText = true`, and `canMarkAll = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 5, h: 5, diff: "tricky" }` are encoded with `full = true`
- **THEN** the result is `5x5dt`
- **AND** decoding it round-trips the params
- **AND** encoding with `full = false` yields `5x5`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `w < 3`, `h < 3`, `w·h > 54`, or an
  unknown difficulty
- **THEN** it returns a non-null error string

### Requirement: Undead descriptions encode totals, the mirror grid, and sightline clues

The desc SHALL consist of the three monster totals (`ghosts,vampires,zombies`),
followed by a comma and a **grid** specification, followed by `2·(w + h)`
comma-prefixed **sighting** clues. The grid SHALL encode the `w·h` interior cells in
reading order: a run of monster/empty cells as a single letter (`a`–`z` for run
length 1–26), a mirror as `L` (`\`) or `R` (`/`), and a hand-fixed monster as `G`,
`V`, or `Z`. `validateDesc` SHALL reject a description with fewer than three leading
counts, an invalid grid character, a grid that does not fill exactly `w·h` cells, a
monster-letter count that disagrees with the totals, the wrong number of sightings,
or trailing data. `newState` SHALL build the immutable shared structure (the grid,
the cell→monster-index map, the monster totals, the fixed-cell flags, and the traced
sightlines), with every non-fixed monster cell starting undecided.

#### Scenario: Description round-trips through generate and decode

- **WHEN** a board is generated and its desc decoded by `newState`
- **THEN** the mirror layout, monster totals, and sighting clues match what was
  encoded
- **AND** every non-fixed monster cell starts undecided with no pencil marks

#### Scenario: Malformed description is rejected

- **WHEN** `validateDesc` receives an invalid grid character, an under- or
  over-full grid, a monster count mismatch, or the wrong number of sightings
- **THEN** it returns a non-null error string

### Requirement: Undead traces sightlines through the mirror maze

`newState` SHALL trace every sightline of the grid: starting from each of the
`2·(w + h)` edge positions (clockwise from the top-left), following a straight path
that reflects at each `\`/`/` mirror until it exits at another edge position, and
recording for each line its ordered monster cells, its two end clue positions, and
its two sighting counts. A monster's contribution to a sighting count SHALL depend
on its type and the line segment: a **vampire** counts only on the segment before
any reflection, a **ghost** only on a segment after at least one reflection, and a
**zombie** always.

#### Scenario: Reflected and direct visibility

- **WHEN** a sightline passes a vampire before any mirror and a ghost after a mirror
- **THEN** the sighting count entering at that end includes both
- **AND** the sighting count entering from the opposite end (where the vampire is
  now post-reflection and the ghost pre-reflection) excludes both

### Requirement: Undead solves and generates uniquely-solvable graded boards

The solver SHALL provide a **deductive ladder** — a per-sightline
candidate-intersection pass (arc-consistency, iterated to a fixpoint), a global
**exact-count** rung (the monster totals as equality constraints, with Hall-type
deductions: a fully-placed type struck everywhere, a type whose remaining count
equals its candidate cells forcing them all, too few candidate cells a
contradiction), and a depth-1 **forcing** rung (hypothesise one cell's candidate, run
the arc-consistency + counting fixpoint, eliminate the candidate on contradiction) —
run to a combined fixpoint **without recursion**, plus a separate whole-grid
brute-force search used only as the uniqueness **oracle**. Forcing SHALL NOT nest (the
inner fixpoint never forces); a board solvable only by nested hypothesising is
"requires recursion".

`newDesc` SHALL generate a grid of random mirrors and monster cells (rejecting grids
that are too sparse, too dense, or have an over-long sightline), seed unique-solution
sightlines until a difficulty-dependent fraction of the grid is determined, fill the
remainder with random monsters, and grade the board by **which rung of the deductive
ladder is required** (arc-consistency / counting / forcing). Every generated board
SHALL be uniquely solvable (verified against the brute-force oracle).

Every board Undead accepts SHALL be solvable by the deductive ladder alone — **zero
guessing or recursion** — per the fork's guess-free generation policy. A board that
requires recursion (nested hypothesising) SHALL be rejected at generation.

Undead ships **no `Unreasonable` tier**: the re-grade measurement (≈6,800 candidate
boards across all tiers) found a **zero** uniquely-solvable recursion residual — every
uniquely-solvable Undead board is cracked by the deductive ladder, and the boards the
ladder cannot solve are exactly the non-unique ones the brute-force oracle already
rejects. The `Unreasonable` tier remains the policy's sole sanctioned guess-allowed
exception for *other* games; Undead does not need it.

#### Scenario: Generated board is unique and on-difficulty

- **WHEN** `newDesc` returns a board for a given size and difficulty
- **THEN** the deductive ladder solves it uniquely with no recursion
- **AND** the board's grade matches the highest rung the ladder needed (Easy =
  arc-consistency within the pass cap, Normal = arc beyond the cap or counting,
  Tricky = forcing)
- **AND** the brute-force oracle confirms exactly one solution

#### Scenario: Every tier is guess-free

- **WHEN** any board is accepted for any tier (Easy, Normal, Tricky)
- **THEN** the deductive ladder (arc-consistency + counting + depth-1 forcing) solves
  it to completion without invoking the brute-force/recursive search

#### Scenario: Recursion-only boards are rejected

- **WHEN** a candidate board is solvable only by recursion (nested hypothesising)
- **THEN** it is rejected at generation (such boards are non-unique; Undead ships no
  `Unreasonable` tier)

#### Scenario: Solve fills the unique solution

- **WHEN** `solve` is invoked on a freshly generated game
- **THEN** it returns a move that places every monster at its unique-solution type

### Requirement: Undead supports monster, pencil, and clue moves with a cursor

`interpretMove` SHALL support: a keyboard/mouse highlight cursor that selects a
monster cell; placing a Ghost/Vampire/Zombie (`G`/`V`/`Z` or `1`/`2`/`3`, or a click
on the corresponding count block) and clearing a cell (`E`/`0`/Backspace) in the
highlighted cell; toggling a pencil note in pencil mode (right-click or the cursor
pencil toggle); a mark-all action (`M`/`m`) that fills every undecided cell with all
candidate notes; and a strike-through "done" toggle on an edge sighting clue (a click
on the clue). Fixed cells SHALL reject monster/clear/pencil edits. A move that would
not change state SHALL return no history entry. `executeMove` SHALL apply the move,
recompute the live error overlays, and mark the game solved when every monster cell
is filled and all counts and sightings are satisfied.

#### Scenario: Place and clear a monster

- **WHEN** the player highlights an empty monster cell and places a Zombie, then
  clears it
- **THEN** the cell holds a Zombie after the first move and is undecided after the
  second
- **AND** a fixed (given) monster cell rejects both edits

#### Scenario: Mark-all fills candidate notes

- **WHEN** the player invokes mark-all on a board with some empty cells
- **THEN** every still-undecided cell gains all three candidate notes
- **AND** already-placed cells are unchanged

### Requirement: Undead shows live legality errors and supports Check & Save

`executeMove` SHALL recompute, and `redraw` SHALL paint red, the live legality
overlays: a monster type whose placed count exceeds its total (or differs from it
once the grid is full) reddens that count block and every placed cell of that type;
a sightline whose placed monsters already exceed its clue, or whose clue can no
longer be reached even by filling every blank, reddens the clue and the whole line.
Separately, the game SHALL implement `findMistakes`: re-solving the board to its
unique solution and returning every placed cell that contradicts it, plus every
empty cell whose non-empty pencil notes have crossed out its solution monster. The
solution SHALL be derived from the description clues only, never from the player's
notes. Both overlays SHALL be tracked in the render diff key so they repaint on the
frame they are computed.

#### Scenario: Over-placing a monster type reddens it live

- **WHEN** the player places more zombies than the zombie total
- **THEN** the zombie count and every placed zombie cell render in the error colour

#### Scenario: Check & Save flags a wrong placement

- **WHEN** the player places a monster that contradicts the unique solution and
  invokes Check & Save
- **THEN** `findMistakes` reports that cell
- **AND** the save is blocked
- **AND** an empty cell whose notes have crossed out its solution monster is also
  reported, while a cell with merely extra notes is not

### Requirement: Undead renders monsters, mirrors, counts, and sightline hints

`redraw` SHALL draw the monster-count row at the top (three blocks G/V/Z whose
numbers follow the selected count-display style — Total, Remaining, Placed/Total,
or **Left/Total** (remaining-to-place over total, e.g. `3/8`; the default, a
deliberate divergence from upstream's Total default) — and colour dimmed when
complete (0 left) or red on error), the sighting clue
numbers around the grid edge (dimmed when struck through, red on error), and each
interior cell as either a mirror (a thick diagonal), a placed monster (a drawn
ghost/vampire/zombie shape, or the letters G/V/Z when the letters display is
selected), or a 2×2 grid of pencil notes. A monster-count display style and a
pictures-vs-letters monster display SHALL be available both as preferences and as
in-play toggles. The render SHALL flash on solving (but not on Solve/cheat) and use
a per-cell diff cache.

#### Scenario: Count-style and letters toggles

- **WHEN** the player cycles the count-display style and toggles the letters display
- **THEN** the count blocks re-render in the new style and monsters render as letters
- **AND** the same options are available through the preferences dialog
- **AND** the default style is Left/Total, dimming a type's block to grey once 0
  remain to place

#### Scenario: Pencil-mark UX

- **WHEN** the player turns on sticky pencil mode and right-clicks empty cells
- **THEN** pencil notes toggle without leaving pencil mode
- **AND** a CapsLock-style indicator shows pencil mode is active

