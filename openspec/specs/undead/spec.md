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

### Requirement: Undead explained deduction hint

The `undead` game SHALL implement `hint(state, aux?, ui?)`,
`hintKeepTrack(move, step, state)`, and `refreshHintStep(step, state)`, producing an
**explained** plan-carrying hint that meets the fork's hint quality bar (the Hint
System requirements in the `ts-engine` spec and the Palisade exemplar): each step
narrates *why* a marking is forced, one deduction firing is emitted as one
(possibly multi-leg) journey, and equivalent markings share a colour.

Undead is a candidate-elimination (pencil-note) game but **not** a Latin-square game:
its deductions derive from the mirror-bouncing **sightline clues** and the **monster
totals** via its own iterative solver, not from the shared Latin candidate cube. The
hint SHALL recompute its plan from the current board state so it makes progress from
any mid-game position reachable by the player (the cross-game resume guarantee).

The hint's working candidate state SHALL be seeded from the **placed grid only**
(fixed cells plus the player's real monster placements); it SHALL NOT treat the
player's pencil notes as facts, since a note may contradict the solution. Notes are
used only to decide which already-valid deduction to surface and to render.

The plan builder SHALL, on a mistake-free board, prefer in order: a **naked single**
(a cell whose surviving candidates are a single monster) as a placement; else a
**total-exhaustion** strike (a monster type whose full count is already placed,
struck from every still-undecided cell) as one journey; else a **sightline
elimination** (a path whose two count clues rule a monster out of one or more of its
cells), emitted as one journey with one leg per affected cell and the whole sightline
shaded as the evidence area; else a **forcing** elimination (a candidate that, if
hypothesised, forces an immediate contradiction); else a forced **placement**. A lazy
populate (reusing the existing fill-all move) SHALL be emitted only when an
elimination first needs notes to strike.

The hint SHALL be **purely deductive**: it SHALL NOT reveal the known solution and
SHALL NOT narrate a guess or backtracking search. Its guarantee of always reaching a
solved board from any mistake-free position rests on `strengthen-undead-deduction`
making every shipped non-`Unreasonable` tier solvable by the deductive ladder
(arc-consistency + counting + depth-1 forcing). Only on a sanctioned `Unreasonable`
tier (if one is shipped) MAY a hint be non-deductive.

The hint SHALL refuse with `{ ok: false, error }` when the board is already solved or
when `findMistakes` reports any contradiction (lighting the mistake overlay through
the existing refusal coupling). The narration SHALL teach the sighting rule —
vampires counted before the beam first reflects, ghosts only after it has bounced,
zombies anywhere along it — and SHALL read correctly at the degenerate clue values
(a count of zero up to the line's full monster count). Conclusions SHALL use the
necessity voice (a strike "must cross out …", a placement "can only be …").

The game's move set SHALL include a `pencilStrike` move that atomically clears a list
of candidate bits across cells (idempotent and resume-safe), used by the hint for a
multi-strike firing; the single-bit `pencil` toggle and the fill-all `markAll` move
are unchanged. The hint SHALL NOT add an auto-pencil preference and SHALL ignore the
optional `ui` argument, because Undead has no trivial (non-teachable) elimination to
fold away.

The hint SHALL render with `COL_HINT` (placement target / acted-on marking) and
`COL_HINT_CELL` (sightline evidence shade) appended to the palette, following the
element-type colour legend: the placement target is a solid `COL_HINT` fill with no
pre-rendered monster glyph; a struck candidate is drawn in its normal pencil colour
with a strikethrough on a non-`COL_HINT` background so it stays legible; the sightline
evidence is shaded `COL_HINT_CELL`. The hint signature SHALL be folded into the
per-cell draw-state cache so the overlay repaints and clears correctly.

`findMistakes` and the quick-save / Check-&-Save coupling are unchanged: an empty
cell whose non-empty notes exclude the solution monster is already a `note` mistake,
so a hint refused for mistakes highlights those cells for free.

#### Scenario: A sightline elimination is taught as one journey

- **WHEN** a player asks for a hint on a mistake-free Undead board where a path's
  count clues rule a monster value out of one or more of the path's cells, and no
  naked single or total exhaustion is available
- **THEN** the hint returns a journey whose legs strike that monster from those cells
  (one leg per cell, continuation legs flagged `continuesPrevious`), every struck mark
  lying on the narrated path
- **AND** the explanation names the sightline and its clue and explains the
  mirror-sighting rule that forces the elimination
- **AND** the whole sightline is shaded as the evidence area while each leg targets a
  single cell

#### Scenario: Total exhaustion is narrated honestly, not as a sightline

- **WHEN** every monster of one type permitted by the totals is already placed and an
  undecided cell still lists that monster as a candidate
- **THEN** the hint emits a `total` strike of that monster from every still-undecided
  cell as one journey, explaining that the type's full count is already placed
- **AND** the narration does not claim a sightline forced the elimination

#### Scenario: Naked single is surfaced first as a placement

- **WHEN** an undecided cell's surviving candidates have collapsed to a single monster
- **THEN** the hint places that monster (a `set` move) before any elimination step,
  explaining that only that monster keeps the cell consistent

#### Scenario: The plan reaches a solved board from any mistake-free position

- **WHEN** a hint is asked repeatedly from a mistake-free board on any shipped
  non-`Unreasonable` tier — each time applying only the first step and recomputing
- **THEN** every hint makes progress (never a no-op and never "give up") and the
  sequence reaches the solved board using only deductive steps (no solution reveal,
  no guess)

#### Scenario: The hint refuses on a solved or contradictory board

- **WHEN** a hint is requested on an already-solved board, or on a board where
  `findMistakes` reports a contradiction
- **THEN** the hint returns `{ ok: false, error }` and (for the mistake case) the
  mistake overlay highlights the offending cells

