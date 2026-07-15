# mines Specification

## ADDED Requirements

### Requirement: Mines game implements the Game interface

The engine SHALL provide a registered `mines` game implementing `Game<MinesParams,
MinesState, MinesMove, MinesUi, MinesDrawState>`: a `w × h` grid concealing `n` mines, in
which the player uncovers squares, deduces from the revealed neighbour-counts where the
mines are, and flags them.

Params SHALL be `w`, `h`, `n` and `unique`, encoded `{w}x{h}n{n}[a]` (`a` = not unique),
with a custom `n%` form meaning "percentage of area". All 6 upstream presets (9×9/10,
9×9/35, 16×16/40, 16×16/99, 30×16/99, 30×16/170) SHALL be offered. `validateParams` SHALL
require `n ≥ 1` and `n ≤ w·h − 9`, and additionally `w > 2 && h > 2` when `unique`.

The game SHALL report `canSolve = true`, `canFormatAsText = true`, `wantsStatusbar = true`
and `isTimed = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 16, h: 16, n: 99, unique: true }` are encoded in full
- **THEN** the result is `16x16n99` and decoding it round-trips the params

### Requirement: The first click is never a mine

The mine layout SHALL NOT exist until the player's first click, and SHALL be generated
around that click so that the clicked square and its eight neighbours are all free of mines.
The game SHALL then supersede its description (`Game.supersededDesc`) so that the shareable
game ID, a restart and a save all name the board actually being played.

The layout SHALL be generated **at most once per game**, and SHALL survive undo: undoing past
the first click and clicking a different square SHALL use the layout already generated, not a
fresh one. A player SHALL NOT be able to obtain a new board by undoing.

#### Scenario: The first click generates the board

- **WHEN** the player makes their first click on a board whose description names no layout
- **THEN** a layout is generated in which neither the clicked square nor any of its
  neighbours holds a mine, and the game's description is superseded with the real board

#### Scenario: Undo does not reroll the board

- **WHEN** the player dies, undoes back past their first click, and clicks a different square
- **THEN** the mines are exactly where they already were — the board is not regenerated

### Requirement: Generated boards are solvable without guessing

When `unique` is set — which every preset sets — the generator SHALL perturb the board until
its own solver can complete it by pure deduction, so that no preset ever requires a guess.
A board that requires guessing SHALL be reachable only by explicitly opting out of
uniqueness through custom parameters.

#### Scenario: Every preset board is deducible

- **WHEN** a board is generated from any preset
- **THEN** the solver completes it with no guessing and no perturbation left outstanding

### Requirement: Death is recoverable and is not a loss

Clicking a mine SHALL expose only the mine that killed the player, leaving every other square
covered, and SHALL block further moves until the player undoes. The game status SHALL NOT
report a loss on death — only a win taken with the Solve function SHALL report as
solved-with-help. The count of deaths SHALL persist in the status bar for the rest of the
game, and SHALL survive a save.

#### Scenario: A player dies, undoes, and carries on

- **WHEN** the player clicks a mine and then undoes
- **THEN** play resumes on the same board, the game status is still "ongoing", and the status
  bar reports the death

### Requirement: Chording never reveals more than it must

Clearing around a satisfied number whose flags are misplaced SHALL uncover only the mined
squares among those it would have opened, rather than the whole neighbourhood — revealing as
little additional information as possible.

#### Scenario: A chord on wrongly-flagged squares

- **WHEN** the player chords a number whose flag count is satisfied but whose flags are on the
  wrong squares
- **THEN** only the mine(s) that the chord would have struck are uncovered

### Requirement: A plain left-click chords without a false-uncover preview

A left-click on a number SHALL chord (clear around it when its flags are satisfied) but SHALL
NOT paint the 3×3 mouse-down "pressed" preview — that preview is drawn identically to opened
cells, so on a not-yet-satisfied number it would flash a false uncover that reverts on
release. The deliberate chord gesture (middle button / Shift+left) SHALL keep the preview, and
a left-press over a covered square SHALL keep its single-cell "about to open" highlight.

#### Scenario: Clicking a not-yet-satisfied number

- **WHEN** the player presses the left button on a number whose mines are not all flagged
- **THEN** no 3×3 preview appears, so nothing looks uncovered and nothing re-covers on release

### Requirement: Mines does not offer mistake-checking

Mines SHALL NOT implement `findMistakes`. The only mistake it could report — a flag on a safe
square — is the very deduction the player is playing the game to make, so reporting it would
turn Check & Save into a solver. The Check & Save control SHALL therefore degrade to a plain
quick-save, as it does for every other game without `findMistakes`.

#### Scenario: Check & Save on Mines

- **WHEN** the player invokes the save control while playing Mines
- **THEN** the board is saved without being checked, and no mistake overlay is shown

### Requirement: The clock reflects the state of play

Mines SHALL be timed. The clock SHALL NOT run before the first click (there is no board yet),
SHALL run during play, and SHALL stop on death, on completion, and once the game has been
completed even if the player subsequently undoes. Elapsed time SHALL survive a save and
restore.

#### Scenario: The clock starts on the first click

- **WHEN** a new Mines game is displayed and the player has not yet clicked
- **THEN** the clock is not running; it starts when the first click uncovers the board
