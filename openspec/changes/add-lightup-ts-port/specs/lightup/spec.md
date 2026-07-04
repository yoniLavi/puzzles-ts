# lightup Specification

## ADDED Requirements

### Requirement: Light Up game implements the Game interface

The engine SHALL provide a registered `lightup` game implementing
`Game<LightupParams, LightupState, LightupMove, LightupUi, LightupDrawState>`:
place light bulbs on open squares of a `w × h` grid so that every open square
is lit (bulbs shine along rows and columns until blocked by a black square),
no bulb is lit by another bulb, and every numbered black square has exactly
that many orthogonally-adjacent bulbs. Params SHALL be `w`, `h`, `blackpc`
(percentage of black squares), `symm` (none / 2-way mirror / 2-way rotational /
4-way mirror / 4-way rotational) and `difficulty` (easy / tricky / hard),
encoded `{w}x{h}b{blackpc}s{symm}d{difficulty}` (short form `{w}x{h}`). All 9
upstream presets SHALL be offered. Decoding SHALL keep upstream's lenient
quirks: a bare `WxH` id demotes 4-way-rotational symmetry to 2-way-rotational
when `w ≠ h`, and the legacy `r` flag decodes as difficulty 2. `validateParams`
SHALL enforce minimum size 2×2, blackpc 5–100, 4-way symmetry only on
square grids of at least 3×3, and known symmetry/difficulty values. The game
SHALL report `canSolve = true` and `canFormatAsText = true` and SHALL drive a
solve-completion flash.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 10, h: 10, blackpc: 20, symm: ROT2, difficulty: 1 }`
  are encoded in full
- **THEN** the result is `10x10b20s2d1` and decoding it round-trips the params

#### Scenario: Lenient decode quirks

- **WHEN** `18x10` is decoded with defaults carrying 4-way-rotational symmetry
- **THEN** the symmetry demotes to 2-way rotational
- **AND** a params string using the legacy `r` suffix decodes as difficulty 2

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is given a 1-wide grid, a blackpc outside 5–100,
  or 4-way symmetry on a non-square grid
- **THEN** it returns a non-null error string

### Requirement: Light Up descriptions use the upstream run-length encoding

The desc SHALL encode the grid row-major, one character per black square
(`B` unnumbered, `0`–`4` numbered) with maximal runs of open squares
compressed as `a`–`z` (run of 1–26). `validateDesc` SHALL reject unknown
characters, short descs, and over-long descs. `newState` SHALL parse the desc
into black/numbered flags and clue values with all open squares unlit.

#### Scenario: A description round-trips

- **WHEN** a generated desc is parsed by `newState` and re-encoded
- **THEN** the re-encoded desc equals the original

#### Scenario: A malformed description is rejected

- **WHEN** `validateDesc` is given a desc with an invalid character or a
  length not matching `w × h`
- **THEN** it returns a non-null error string

### Requirement: Light Up ports the graded solver faithfully

The port SHALL implement the upstream solver with its exact deductive power at
each difficulty: at easy, forced-light ("this unlit square has exactly one
remaining way to be lit") and clue deductions (a satisfied clue marks its
remaining neighbours impossible; a clue whose remaining lights equal its
remaining spaces fills them); at tricky, additionally the overlapping-set
discount (every MAKESLIGHT set — from an unlit square or a `C(n, n−m+1)`
combination of a clue's free neighbours enumerated via the ported `Combi`
module — is tested against candidate MAKESDARK squares chosen by the upstream
minimum-rule-out heuristic, marking squares impossible), restarting the cheap
deduction sweep after the first successful discount; at hard, additionally
recursion on the most-illuminating candidate square, depth-capped at 5, with
upstream's unique-solution bookkeeping (recursion-limit hits propagate
"unknown" under force-unique; solution counts sum across branches). The solver
SHALL track which clue numbers it used, for generator stripping. The solver
SHALL be reused by `solve()` and `findMistakes`.

#### Scenario: Generated boards solve at exactly their difficulty

- **WHEN** a board generated at difficulty `d > 0` is solved
- **THEN** the solver succeeds with the difficulty-`d` technique set and fails
  (or needs recursion it is denied) with the difficulty-`d−1` set

#### Scenario: Solve recovers a solution from a dirty board

- **WHEN** `solve()` is invoked on a mid-game state containing wrong bulbs
- **THEN** it returns a move that leaves the board correctly and completely
  lit (solving from the current position when possible, else from the clean
  clues)

### Requirement: Light Up generation byte-matches the C reference

The generator SHALL reproduce upstream `new_game_desc` faithfully: symmetric
black-square placement per the symmetry mode (including the centre-square
random draw for odd 4-way-rotational grids), a correct random light placement
seeded by filling all open squares then removing lights via the marked-sweep,
numbering all black squares, solver-gating at the target difficulty, stripping
unused numbers, removing surviving numbers one-by-one in the one-shot shuffled
order while the puzzle stays good, rejecting boards that are still solvable
one difficulty lower, and ramping `blackpc` by 5 (to at most 90) after 20
failed grids. The published desc SHALL match the C reference byte-for-byte for
the same seed, asserted by a committed gated differential test across all 9
presets (plus at least one non-default symmetry/blackpc parameter set) against
`__fixtures__` recorded by a transient `puzzles/auxiliary/lightup-trace.c`
harness (deleted together with `lightup.c` at acceptance).

#### Scenario: Desc byte-match

- **WHEN** `newDesc` is run for a preset and seed recorded in the fixture
- **THEN** the produced desc equals the fixture desc byte-for-byte

### Requirement: Light Up accepts pointer and cursor input

`interpretMove` SHALL reproduce upstream input: left-click toggles a bulb on
an open, unmarked square (clearing any mark when placing); right-click toggles
the impossible-mark on an open, bulb-less square (placing a mark removes any
bulb); clicks on black squares and out-of-grid are no-ops; a left-click on a
marked square (and a right-click on a bulb) is rejected without a history
entry. Keyboard: arrow cursor movement (revealing the cursor), select/Enter
toggles a bulb, select2/`i` toggles a mark, with the same rejection rules.
Completion SHALL hide the cursor. Bulb and mark are mutually exclusive in
`executeMove`, which SHALL recompute lit counts and set `completed` when the
grid is correct (all lit, no overlap, all clues exact).

#### Scenario: Left-click places and toggles a bulb

- **WHEN** the player left-clicks an empty open square, then left-clicks it
  again
- **THEN** a bulb appears (lighting its row/column to the nearest black
  squares) and then disappears

#### Scenario: Marks block bulbs

- **WHEN** the player left-clicks a square carrying an impossible-mark
- **THEN** no move is produced and no history entry is created

#### Scenario: Completion is detected

- **WHEN** a move leaves every open square lit, no bulb lit by another, and
  every clue exactly satisfied
- **THEN** the state reports `completed` and the solve-completion flash plays

### Requirement: Light Up renders to C parity with live error feedback

`redraw` SHALL draw: black squares (numbered ones showing their clue,
in the error colour when the clue is provably wrong — too many adjacent
bulbs, or too few even if all plausible neighbours were filled); open squares
with lit squares filled yellow; bulbs as circles (error-coloured when lit by
another bulb); impossible-marks as small black blobs — suppressed on lit
squares when the `show-lit-blobs` preference (default on, via the `Game.prefs`
hook) is off; the keyboard cursor; and the 3-phase completion flash. The
per-tile packed flags SHALL be the render cache key (`Int32Array`), and every
overlay not in the packed value (the `findMistakes` highlight) SHALL be in a
sidecar included in the diff key. The palette SHALL stay index-for-index with
the upstream colour enum (0 background, 1 grid, 2 black, 3 light, 4 lit,
5 error, 6 cursor) because the app's dark-mode overrides target indices 2
and 3.

#### Scenario: Overlapping bulbs render as errors

- **WHEN** two bulbs light each other
- **THEN** both are drawn in the error colour

#### Scenario: A provably-wrong clue turns red

- **WHEN** a numbered black square has more adjacent bulbs than its clue
- **THEN** its number is drawn in the error colour

#### Scenario: Lit blobs honour the preference

- **WHEN** a marked square becomes lit and `show-lit-blobs` is off
- **THEN** the blob is not drawn (and reappears when the preference is
  re-enabled)

### Requirement: Light Up ships findMistakes

The game SHALL implement `findMistakes(state)`: re-solve the clues to the
unique solution and flag every player bulb on a square the solution leaves
bulb-less (`kind: "light"`) and every impossible-mark sitting on a solution
bulb position (`kind: "mark"`). A board without a unique solution yields `[]`.
Flagged squares SHALL render with a distinct error overlay that repaints on
the frame it is computed (sidecar in the render diff key).

#### Scenario: Check & Save flags a wrong bulb

- **WHEN** `findMistakes` runs on a board with a bulb where the unique
  solution has none
- **THEN** that square is returned as a mistake and rendered with the mistake
  overlay on the next redraw

#### Scenario: A merely-unhelpful mark is not flagged

- **WHEN** a mark sits on a square the solution leaves empty
- **THEN** it is not reported as a mistake

### Requirement: Light Up is parity-gated, then served from TS with its C deleted

The game SHALL first be registered (TS-ported id list + `games/index.ts`
import) for owner smoke-testing while `puzzles/lightup.c` remains the
catalog/wasm source. Only on owner-accepted full behavioural parity
(rendering, input, flash) SHALL the game's `puzzle()` gain `TS_PORTED` and
`puzzles/lightup.c` (with its `solver()` line and the trace harness) be
deleted, in the same commit that archives this change.

#### Scenario: Registered game serves the TS implementation

- **WHEN** `lightup` is present in the runtime registry
- **THEN** the midend serves the TS `Game` implementation rather than the
  C/WASM path

#### Scenario: C deletion is gated on owner acceptance

- **WHEN** owner acceptance of full parity has not yet happened
- **THEN** `TS_PORTED` is not set and `puzzles/lightup.c` is not deleted
