# group Specification

## Purpose
Define the native-TypeScript Group puzzle — a Latin-square game whose completed
grid must be a valid group Cayley table (Latin **and** associative) — as a full
catalog citizen served by the TS engine, reusing the shared `engine/latin.ts`
solver framework and adding Group's own associativity/identity deductions, the
row/column-reorder and subgroup-divider visual aids, and Check & Save mistake
detection.
## Requirements
### Requirement: Group game implements the Game interface

The engine SHALL provide `src/games/group/` implementing the `Game`
interface for Group — a Latin-square puzzle whose completed grid must be a valid
group Cayley table (Latin **and** associative) — registered so the puzzle is
served by the TypeScript engine.

Group SHALL accept a grid size (group order) between 3 and 26, a difficulty of
Trivial, Normal, Hard, Extreme or Unreasonable, and a "show identity" flag. It
SHALL reject an identity-hidden Trivial puzzle and an identity-hidden 3×3 puzzle,
because such puzzles cannot be made: identity-hidden puzzles leave two rows and
columns blank, and only a non-Trivial deduction can distinguish them.

The element-numbering used for display and keyboard input SHALL depend on the
"show identity" flag — with identity shown, the identity element is presented
first — and this SHALL affect the solution encoding and on-screen labels but
SHALL NOT affect the grid description.

#### Scenario: A generated board is a solvable group table

- **WHEN** a new game is generated for a legal size and difficulty in either
  identity mode
- **THEN** its clues admit exactly one completion, that completion is a valid
  group table, and the solver grades it at the requested difficulty

#### Scenario: Impossible identity-hidden parameters are rejected

- **WHEN** parameters request an identity-hidden Trivial puzzle, or an
  identity-hidden 3×3 puzzle
- **THEN** validation rejects them with a reason

### Requirement: Group descriptions use the upstream run-length encoding

A Group description SHALL encode the grid in reading order: each clue as a
decimal number in the range 1 to the grid size, each run of 1–26 blank cells as a
single letter `a`–`z` (runs longer than 26 split across letters), and an
underscore separator where a number would otherwise abut adjacent data. The
solution SHALL be encoded separately using the identity-dependent element letters
rather than decimal numbers.

Validation SHALL reject a description whose cell count does not equal the grid
area, distinguishing "not enough data" from "too much", and SHALL reject
out-of-range numbers and unknown characters.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded
- **THEN** the resulting clues are identical, and re-encoding yields the same
  description

#### Scenario: A description of the wrong length is rejected

- **WHEN** a description carrying more or fewer cells than the grid area is
  validated
- **THEN** it is rejected with a message distinguishing which

### Requirement: Group ports the graded group-axiom solver over the shared Latin solver

Group SHALL solve using the shared `src/engine/latin.ts` engine, supplying
only its group-specific deductions and validator: at Normal, an associativity
forward-deduction ((ab)c = a(bc)) together with filling the identity's row and
column once the identity is known; at Hard, ruling out identity candidates from
any product that equals neither of its factors. Extreme SHALL use the generic
set-elimination and forcing techniques and Unreasonable the generic
guess-and-verify recursion, with no Group-specific technique. A completed grid
SHALL be accepted only if it is associative.

The solver SHALL NOT introduce a difficulty tier beyond the five upstream ships,
and SHALL NOT implement the inverse-based, hard-mode-associativity or
element-order techniques upstream lists as unimplemented; the shipped difficulty
grading depends on their absence.

#### Scenario: The solver grades a board at the intended difficulty

- **WHEN** a board generated at a given difficulty is solved
- **THEN** it is solvable at that difficulty and not at the tier below

#### Scenario: Associativity is used as a deduction

- **WHEN** a partially-filled board has `ab`, `bc` and `(ab)c` known but `a(bc)`
  blank at Normal or harder
- **THEN** the solver places `a(bc)` equal to `(ab)c`

### Requirement: Group generation from the group data table

Group SHALL generate boards by selecting a group of the requested order from the
transcribed group data table, decompressing its generators into the full Cayley
table by breadth-first search, permuting its elements (fixing the identity in
place when the identity is shown), then removing clues one at a time while the
board remains uniquely solvable at the requested difficulty. Generation SHALL
apply upstream's difficulty-downgrade exceptions, whereby some small sizes cannot
reach the higher difficulties and are generated one tier easier.

In identity-hidden mode, generation SHALL additionally blank the identity's row
and column and one further row and column, so the identity cannot be read
directly, and SHALL re-verify solvability afterward. Generation SHALL reject a
board that is already solvable one difficulty tier below the target.

#### Scenario: Small sizes are downgraded rather than failing

- **WHEN** a size too small to support the requested difficulty is used
- **THEN** a board is generated at the highest difficulty that size supports

#### Scenario: Identity-hidden boards do not reveal the identity

- **WHEN** an identity-hidden board is generated
- **THEN** the identity's row and column, and one further row and column, are
  blank, and the board is still uniquely solvable at its difficulty

### Requirement: Group input, gameplay aids and rendering

Group SHALL be played with mouse and keyboard: selecting a cell and typing an
element letter or number fills it, right-click selects a cell for pencil marks,
and a diagonal drag from a selected cell fills a whole diagonal at once. Filling
a cell SHALL be idempotent, and setting an immutable cell to the value it already
holds SHALL be permitted so a multifill need not detour around it.

Group SHALL provide two structural gameplay aids: dragging a row or column header
SHALL reposition that element's entire row and column so a player can group a
subgroup with its cosets, and dropping a divider between two adjacent elements
SHALL mark a boundary, cleared automatically when those two elements are dragged
apart. Group SHALL provide `findMistakes`, since the puzzle is uniquely solvable,
so Check & Save applies.

Rendering SHALL draw the element legend along the top and left, shade the leading
diagonal, draw dividers as thick edges, lay out pencil marks in a grid, highlight
the selection, annotate Latin duplicates and associativity failures in the error
colour, and flash on completion.

#### Scenario: A diagonal multifill sets several cells at once

- **WHEN** a cell is selected and the pointer is dragged diagonally to another
  cell, then an element is entered
- **THEN** every cell along that diagonal is set to the element, skipping any
  immutable cell that already holds it

#### Scenario: Reordering rows carries its divider correctly

- **WHEN** a row header is dragged to a new position such that a divider's two
  bordering elements are no longer adjacent
- **THEN** the affected divider is removed

#### Scenario: A completed valid table wins

- **WHEN** every cell is filled so the grid is Latin and associative
- **THEN** the game is reported solved and flashes

### Requirement: Group provides an explained deduction hint

The game SHALL implement `hint(state, aux?, ui?)`, returning a plan of
`HintStep`s that teaches the player the next deduction, working in a sound
candidate cube **seeded from the placed entries only — never from the player's
pencil notes** (a note can be wrong; that is what `findMistakes` flags). The plan
is built by walking a working copy of the board the way a person solves it,
preferring at each step:

1. a **naked single** — an empty cell whose live notes have collapsed to a single
   candidate — placed via a `set` move; else
2. (after a lazy **populate** step that fills every empty cell's candidate notes
   via the fill-all `pencil` move, emitted only when some empty cell lacks notes)
   the **basic Latin** row/column eliminations a placed value implies, struck via a
   `pencil` move; else
3. **Group's own deduction** — one of:
   - an **associativity placement**: for some `a,b,c` the player has filled `a·b`,
     `b·c` and `(a·b)·c`, so the cell `a·(b·c)` is forced to that same value (since
     `(a·b)·c = a·(b·c)` in every group); placed via a `set` move; or
   - an **identity-row/column fill**: once the identity `e` is known (a filled
     `a·b = a` reveals `b = e`), the identity's whole row and column are the
     element labels — emitted as one journey filling those cells; or
   - an **identity-mark elimination** (identity-hidden mode): a filled `a·b` that
     equals neither `a` nor `b` proves neither is the identity, ruling out the
     identity marks — struck via a `pencil` move; else
4. a forced generic **placement** — a **naked single** (the cell's own candidates
   collapsed to one) or a **hidden single** (a value that fits only one cell of a
   row or column, the cell still showing several candidates), narrated and
   highlighted by *which* it is (the recorded reason conflates them, so the *why*
   is re-derived from the working board).

Each step SHALL carry a narration meeting the hint quality bar — leading with the
spotted indication, then the reasoning, then a necessity-voice conclusion — and
SHALL refer to each cell by the element letter it shows. The **associativity**
step SHALL state the actual triple and the three known products that force the
fourth (teaching the technique, not merely pointing at the cell). A single
deduction *firing* that forces several cells (the identity fill) SHALL be one
journey (continuation legs flagged `continuesPrevious`), and equivalent
placements of one firing SHALL share the target hint colour.

The hint SHALL refuse (`{ ok: false, error }`) when the board is solved or when
`findMistakes` is non-empty, and refusal SHALL light the mistake overlay through
the engine's refusal→`findMistakes` coupling. The deduction SHALL be capped below
recursion (a guess is not a teachable step); when no forced move exists below
recursion the hint SHALL refuse honestly rather than invent one.

Every step SHALL be monotone progress (a note added by populate, a note removed by
a strike, or a cell filled by a placement — never undone by the hint), so a
freshly-recomputed hint from any solvable, mistake-free mid-game position SHALL
make progress and lead to a solved board (the cross-game resume guarantee); on
recompute the plan SHALL skip any operation already reflected on the board.
`hintKeepTrack` SHALL advance the plan when the player's move matches the displayed
step's intent (a `set` of the hinted value is `completed`; a `pencil` strike
clearing a subset of the step's marks is `onTrack` or `completed`) — otherwise drop
the plan (`off`). `refreshHintStep` SHALL drop a stored step's dead marks (or
resolve the step) before each (re-)display so a kept plan never tells the player to
act on something already resolved.

The solver's recording mode SHALL be gated so that with recording off the
generator/solve path is **byte-for-byte unchanged** (verified by the existing
frozen `group-c-reference.json` differential), and one recorded deduction *firing*
SHALL map to exactly one `group` so a hint step never mixes deductions.

#### Scenario: Associativity forces a placement and the hint teaches why

- **WHEN** the player asks for a hint on a board where `a·b`, `b·c` and `(a·b)·c`
  are filled but `a·(b·c)` is not
- **THEN** the hint returns a `set` step placing `a·(b·c)` to the value of
  `(a·b)·c`
- **AND** the narration names the three known products and states that
  `(a·b)·c = a·(b·c)` forces the fourth
- **AND** the three known-product cells are shaded as evidence and the target cell
  is ringed in the hint colour

#### Scenario: The identity's row and column are filled as one journey

- **WHEN** the hint has just learned which element is the identity (from a filled
  `a·b = a`)
- **THEN** the placements filling the identity's row and column are emitted as a
  single multi-leg journey (continuation legs flagged `continuesPrevious`), not as
  separate hints

#### Scenario: Identity-hidden mode rules out an identity mark

- **WHEN** a hint is requested on an identity-hidden board where a filled `a·b`
  equals neither `a` nor `b`
- **THEN** the hint returns a `pencil` step striking the identity marks of `a` and
  `b`, narrated as "neither can be the identity"

#### Scenario: The hint resumes from a self-played mid-game position

- **WHEN** a hint is requested from a solvable, mistake-free board the player
  reached by their own placements
- **THEN** the freshly-recomputed hint makes progress and, applied step by step
  with recompute, leads to a solved board

#### Scenario: The hint refuses on a board with mistakes

- **WHEN** a hint is requested while `findMistakes` is non-empty
- **THEN** the hint refuses and the engine lights the mistake overlay

