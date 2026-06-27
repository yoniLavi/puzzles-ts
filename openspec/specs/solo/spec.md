# solo Specification

## Purpose
TBD - created by archiving change add-solo-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Solo game implements the Game interface

The engine SHALL provide a registered `solo` game implementing
`Game<SoloParams, SoloState, SoloMove, SoloUi, SoloDrawState, SoloMistake>`: a
Latin-square puzzle on a `cr × cr` grid (`cr = c·r`) in which the player places a
digit `1..cr` in every cell so each row, each column, and each sub-block contains
every digit exactly once, with a subset of cells given. The game SHALL support
four composable variants: **standard** (rectangular `c × r` sub-blocks),
**jigsaw** (`r === 1`, irregular sub-blocks), **X** (`xtype` — the two main
diagonals must also contain every digit), and **killer** (`killer` — a second
cage partition with digit-sum clues). Params SHALL be
`{ c, r, symm, diff, kdiff, xtype, killer }` with two difficulty axes (the
standard solver difficulty and the killer-cage difficulty). The game SHALL report
`canSolve = true`, `canMarkAll = true`, and implement `findMistakes`.

#### Scenario: Variants are served from one registered game

- **WHEN** a standard, jigsaw, X, or killer Solo puzzle is requested
- **THEN** the same registered `solo` game produces a playable board for it
- **AND** a jigsaw board (`r === 1`) has irregular sub-blocks while a standard
  board has rectangular `c × r` sub-blocks
- **AND** an X board additionally constrains the two main diagonals, and a killer
  board additionally carries digit-sum cages

### Requirement: Solo encodes and decodes its parameters

`encodeParams` SHALL produce the upstream string: a base of `"{c}x{r}"` when
`r > 1` or `"{c}j"` when `r === 1` (jigsaw), then `"x"` if `xtype` and `"k"` if
`killer`; in *full* mode, the symmetry (`m8`/`m4`/`md4`/`m2`/`md2`/`r4`/`a`, with
`r2` the omitted default) and the difficulty (`db`/`di`/`da`/`de`/`du`, with `dt`
= the omitted `DIFF_BLOCK` default). `decodeParams` SHALL be lenient (ignoring
unknown characters), accept the legacy `"{c}x{r}j"` form (a `j` after a seen `r`
collapses the rectangle to a jigsaw of edge `c·r`), and round-trip the preset
list. `validateParams` SHALL enforce the upstream bounds (including killer grid
dimensions below 10) and a known difficulty.

#### Scenario: Params round-trip across variants

- **WHEN** standard, jigsaw, X, and killer params are encoded with `full = true`
  and decoded
- **THEN** each decodes back to the original params
- **AND** the non-full encoding omits the symmetry and difficulty suffixes

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` receives out-of-range dimensions or an unknown
  difficulty
- **THEN** it returns a non-null error string

### Requirement: Solo descriptions encode givens, block structure, and killer cages

The desc SHALL begin with the **givens grid** (run-length blank/digit encoding).
For a **jigsaw** board (`r === 1`) it SHALL append `","` and the **block-structure**
encoding (run-length internal-edge encoding, transposed read order). For a
**killer** board it SHALL append `","` and the **cage block-structure**, then `","`
and the **cage-sum grid** encoding. `newState` SHALL rebuild the block partition
(a disjoint-set structure) and, for killer, the cage partition and per-cage sum,
flagging given cells immutable. `validateDesc` SHALL reject a malformed grid,
block structure, or cage-sum grid.

#### Scenario: Description round-trips through generate and decode

- **WHEN** a board (of any variant) is generated and its desc decoded by
  `newState`
- **THEN** the givens, block partition, and (for killer) the cage partition and
  sums match what was encoded
- **AND** non-given cells start empty with no pencil marks

#### Scenario: Malformed description is rejected

- **WHEN** `validateDesc` receives a malformed grid, block structure, or (killer)
  cage-sum grid
- **THEN** it returns a non-null error string

### Requirement: Solo generates uniquely-solvable boards at the requested difficulty

`newDesc` SHALL generate a full solution grid satisfying all active constraints
(Latin rows/columns, sub-blocks, X-diagonals when `xtype`, killer cages when
`killer`; jigsaw blocks produced by the lazily-ported `divvy`), then remove givens
in symmetry orbits (per the `symm` mode) by re-running the graded solver, keeping a
board only when it is **uniquely** solvable at **exactly** the requested
difficulty, regenerating otherwise. Generation SHALL carry a capped-iteration
backstop that throws rather than hanging. Where the generation path is RNG-faithful
and order-deterministic to the desc, the emitted desc SHALL match the C reference
byte-for-byte for the same seed; where it is not (an order-dependent step), the
differential SHALL instead validate order-independent solver verdicts.

#### Scenario: Generated board is uniquely solvable at its difficulty

- **WHEN** a board is generated for given params
- **THEN** the graded solver solves it uniquely at the requested difficulty
- **AND** (for difficulties above the lowest) the solver fails to solve it one
  difficulty level lower

#### Scenario: Generated board matches the C reference

- **WHEN** a board is generated from a fixed seed and params matching a frozen C
  trace fixture
- **THEN** for a byte-match variant the emitted desc equals the recorded C desc
  exactly
- **AND** for a verdict-record variant the TS solver reaches the C-recorded
  difficulty and unique-solvability verdict on the recorded board

### Requirement: Solo solves with its bespoke graded solver

The solver SHALL be a self-contained port of upstream's `solver_usage` model: a
per-cell candidate cube plus per-constraint-group position grids, built from a
constraint-group list (rows, columns, sub-blocks, and — when `xtype` — the two
diagonals) so X-type and jigsaw fall out of the shared technique loops. It SHALL
implement, in difficulty order, the standard techniques (positional and numeric
elimination, block/row/column intersection, set elimination, extreme forcing
chains, and bounded recursion) and the killer techniques (single-cell sums,
min/max elimination, sum-combination enumeration, and cage/line intersection).
`solveSolo(...)` SHALL return the difficulty reached, or an impossible/ambiguous
sentinel, faithfully reproducing upstream's grading (including any upstream quirk
that the solver-gated generator depends on).

#### Scenario: Solver grades a known board

- **WHEN** `solveSolo` is run on a generated board at its difficulty
- **THEN** it returns that difficulty and fills the grid with the unique solution

#### Scenario: Solver detects an inconsistent board

- **WHEN** `solveSolo` is run on a board with no solution
- **THEN** it returns the impossible sentinel

### Requirement: Solo interprets digit, pencil, and mark-all input

`interpretMove` SHALL support: a left-click / cursor-select that highlights a cell
for a real entry; a right-click / select2 that highlights an empty cell for a
pencil mark (and, in sticky pencil mode, toggles a persistent pencil mode); a
digit key `1..cr` that enters that digit (or toggles that pencil mark) in the
highlighted non-given cell; backspace / space that clears it; keyboard cursor
movement; and the `M`/`m` key that fills every empty cell with all candidate
pencil marks. A right-click on a given/filled cell SHALL toggle pencil mode but not
select that cell. Entering a digit equal to a cell's current contents (no pencil
marks) SHALL be a no-op that hides the mouse highlight. With auto-pencil enabled, a
real placement SHALL additionally strike that digit from the pencil marks of every
other cell sharing a row, column, block (or diagonal) with it. `executeMove` SHALL
return a new state and never mutate its input; a placement that completes the grid
with no errors SHALL mark the state completed.

#### Scenario: Placing and pencilling digits

- **WHEN** a non-given cell is highlighted and a digit key is pressed
- **THEN** `interpretMove` yields a `set` move that places (or, in pencil mode,
  toggles the pencil mark of) that digit
- **AND** `executeMove` applies it to a new state without mutating the old one

#### Scenario: Mark-all fills pencil candidates

- **WHEN** the `M` key is pressed
- **THEN** `interpretMove` yields a `pencilAll` move
- **AND** `executeMove` fills every empty cell with all candidate pencil marks

### Requirement: Solo renders blocks, cages, diagonals, digits, pencil marks, and overlays

`redraw` SHALL draw the grid with thick sub-block boundaries derived from the block
partition (so rectangular and jigsaw-irregular blocks use the same pass), the
killer cage dashes and cage-sum labels (at each cage's top-left-most cell) when
`killer`, the two diagonals shaded when `xtype`, given digits distinct from player
digits, an auto-sized grid of pencil marks per empty cell, the cursor and
pencil-mode highlights, live rule-violation errors, the Check & Save mistake
overlay, and a completion flash. A CapsLock-style pencil-mode indicator SHALL be
shown while persistent pencil mode is on. The palette SHALL be index-for-index with
the upstream colour enum. Rendering SHALL use a per-tile diff cache keyed on an
`Int32Array`, with every overlay that is not part of the tile value (the mistake
overlay) included in the diff key so it repaints on an already-drawn cell.

#### Scenario: Variant decorations are drawn

- **WHEN** a jigsaw, killer, or X board is rendered to a recording drawing
- **THEN** a jigsaw board draws block boundaries along the irregular partition
- **AND** a killer board draws the cage-sum label at each cage and dashed cage
  outlines
- **AND** an X board shades the two main diagonals

#### Scenario: Mistake overlay repaints on an already-drawn cell

- **WHEN** a cell is drawn, then `findMistakes` flags it, then the board is
  redrawn against the same draw state
- **THEN** the mistake highlight is painted on the second redraw

### Requirement: Solo flags mistakes against its unique solution

The game SHALL implement `findMistakes`: re-solve from the given cells (and, for
killer, the cage sums) to the unique solution — deriving it from the givens only,
never the player's notes — and return every player cell that contradicts it: a
filled cell whose digit is wrong (`"cell"`), and an empty cell whose non-empty
pencil notes have crossed out its solution digit (`"note"`). When the board is not
uniquely solvable from the givens the result SHALL be empty. This drives the
shell's Check & Save control, which hard-blocks a quick-save while any mistake
exists.

#### Scenario: A wrong digit and a wrong note are flagged

- **WHEN** the player fills a cell with a digit other than its solution value, or
  pencils out the solution digit in an empty cell
- **THEN** `findMistakes` includes that cell
- **AND** a cell whose notes merely carry extra (non-solution) candidates is not
  flagged

### Requirement: Solo exposes pencil-mark preferences

The game SHALL expose, via the `prefs` hook, a sticky-pencil-mode preference
(default on; right-click toggles a persistent pencil mode), an auto-pencil
preference (default on; placing a digit strikes it from the pencil marks of its
row, column, block, and diagonal), and a keep-mouse-highlight-after-pencil
preference (default off, matching upstream `PREF_PENCIL_KEEP_HIGHLIGHT`).
Preference values SHALL live on the `Ui` and be set as defaults by `newUi`.

#### Scenario: Sticky pencil mode is exposed and defaults on

- **WHEN** the game's preferences are read
- **THEN** they include a sticky-pencil-mode boolean defaulting to on
- **AND** an auto-pencil boolean defaulting to on
- **AND** a keep-highlight boolean defaulting to off

### Requirement: Solo provides an explained deduction hint

The game SHALL implement `hint(state, aux?, ui?)`, returning a plan of
`HintStep`s that teaches the player the next deduction in pencil-notes terms,
working in a sound candidate cube **seeded from the placed entries (givens and
player digits) only — never from the player's pencil notes** (a note can be wrong;
that is what `findMistakes` flags). The plan is built by walking a working copy of
the board the way a person solves it, preferring at each step:

1. a **naked single** — an empty cell whose live notes have collapsed to a single
   candidate (sound on a mistake-free board, since that candidate is then the
   solution) — placed via a `set` move; else
2. (after a lazy **populate** step that fills every empty cell's candidate notes
   via the existing fill-all `pencilAll` move, emitted only when some empty cell
   lacks notes) the **basic-region** eliminations a placed or given value implies —
   the digit struck from the rest of its row, column, sub-block (rectangular or
   jigsaw) and, on an X board, its diagonal(s) — via `pencilStrike`; else
3. the next **deductive elimination** — one technique *firing* (a positional or
   numeric single, a block/line intersection, a naked/hidden subset, a forcing
   chain, or — on a killer board — a single-square cage, a cage min/max bound, a
   cage sum-combination, or a deduced extra-cage) — striking the candidate(s) it
   rules out, via one or more `pencilStrike` moves linked as one journey; else
4. a forced **placement** — a naked single (the cell's own candidates have
   collapsed to one) or a positional/hidden single (a digit that fits only one cell
   of a row, column, sub-block or diagonal, the cell itself still showing several
   candidates), narrated and highlighted by *which* it is (the recorded reason
   conflates them, so the *why* is re-derived from the working board).

Each step SHALL carry a narration meeting the hint quality bar — leading with the
spotted indication (the firing region, named by its kind; a killer cage named by
its sum clue), then the reasoning, then a necessity-voice conclusion ("must cross
out the N" for an elimination, "can only be N" for a placement). A single technique
firing forcing several strikes SHALL be one journey (continuation legs flagged
`continuesPrevious`), and equivalent strikes of one firing SHALL share the target
hint colour. When a single step names two or more board-element types at once, each
type SHALL carry a stable per-game colour always paired with a non-colour cue
(shade / ring / cross-through), per the cross-game hint colour-legend convention.

The trivial region eliminations a placement implies SHALL be governed by the
auto-pencil preference (read from `ui`): with it on they are folded silently into
the placement; with it off they are taught as explicit `continuesPrevious` strike
continuations.

The hint SHALL refuse (`{ ok: false, error }`) when the board is solved or when
`findMistakes` is non-empty, and refusal SHALL light the mistake overlay through
the engine's refusal→`findMistakes` coupling. The deduction SHALL be capped below
recursion (`DIFF_RECURSIVE`) — a guess is not a teachable note strike — so on a
board only solvable by guessing the hint reports it cannot deduce the next move.

Every step SHALL be monotone progress (a note added by populate, a note removed by
a strike, or a cell filled by a placement — never undone by the hint), so a
freshly-recomputed hint from any solvable, mistake-free mid-game position SHALL
make progress and lead to a solved board (the cross-game resume guarantee); on
recompute the plan SHALL skip any operation already reflected on the board.
`hintKeepTrack` SHALL advance the plan when the player's move matches the displayed
step's intent — a `pencilStrike` clearing a subset of the step's marks is
`onTrack` (the step shrinks in place) or `completed`; a placement of the hinted
value is `completed` — otherwise drop the plan (`off`). `refreshHintStep` SHALL
drop a stored step's dead marks (or resolve the step) before each (re-)display so a
kept plan never tells the player to remove a candidate already gone.

The solver's recording mode SHALL be gated so that with recording off the
generator/solve path is **byte-for-byte unchanged** (verified by the existing C
differential — Solo's solver is a faithful bespoke port, not the shared
`engine/latin.ts`, so the recording mode is added to Solo's own techniques), and
one recorded deduction *firing* (one region's elimination, one cage's pruning, …)
SHALL map to exactly one `group` so a hint step never mixes regions.

#### Scenario: A region elimination is taught as a note strike

- **WHEN** the player asks for a hint on a fully-pencilled board where a placed
  digit, or a deductive technique, rules a digit out of a cell
- **THEN** the hint returns a step whose `pencilStrike` move clears exactly those
  candidates
- **AND** the narration names the firing region (row / column / sub-block /
  diagonal, or a killer cage by its sum clue) and concludes in the necessity voice
- **AND** the region's cells are shaded and the struck candidates marked in the
  hint colour

#### Scenario: A killer-cage deduction is taught on a killer board

- **WHEN** the player asks for a hint on a killer board where a cage's sum clue
  rules a digit out of one of its cells
- **THEN** the hint returns a `pencilStrike` step naming the cage by its sum goal
  ("this cage must sum to V") and concluding in the necessity voice

#### Scenario: A positional single is named by its region, not the cell

- **WHEN** the hint forces a placement into a cell that still shows several
  candidates, because the placed digit fits nowhere else in its row (or column,
  block, or diagonal)
- **THEN** the narration names that region ("in this row, N can go in only this
  cell") rather than claiming every number is ruled out in the cell
- **AND** the whole region is shaded as evidence, with the cell marked as the
  placement target

#### Scenario: An empty board is populated before elimination

- **WHEN** the player asks for a hint on a board with no pencil notes
- **THEN** the first elimination is preceded by the fill-all populate step

#### Scenario: The hint resumes from a self-played mid-game position

- **WHEN** a hint is requested from a solvable, mistake-free board (standard, X,
  jigsaw or killer) the player reached by their own notes and placements
- **THEN** the freshly-recomputed hint makes progress and, applied step by step
  with recompute, leads to a solved board

#### Scenario: The hint refuses on a board with mistakes

- **WHEN** a hint is requested while `findMistakes` is non-empty
- **THEN** the hint refuses and the engine lights the mistake overlay

#### Scenario: The hint declines when only a guess remains

- **WHEN** a hint is requested on a board whose next move requires the recursion
  (Unreasonable) tier
- **THEN** the hint reports that it cannot deduce the next move rather than
  narrating a guess

