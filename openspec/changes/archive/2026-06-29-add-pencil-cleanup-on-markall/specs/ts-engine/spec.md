# ts-engine Specification (delta)

## MODIFIED Requirements

### Requirement: The engine surface exposes a "fill all pencil marks" capability

The engine surface SHALL expose `canMarkAll` in its static attributes, true
iff the active game supports the "fill every empty cell with all candidate
pencil marks" action (upstream's `M`/`m` key). The `Game` interface SHALL
define an optional `readonly canMarkAll?: boolean` flag; the `Midend` SHALL
surface it as `canMarkAll: game.canMarkAll ?? false`. For an unported C/WASM
game, `canMarkAll` SHALL be false.

The action itself reuses the existing keyboard input path rather than a new
engine method: a game that sets `canMarkAll` SHALL handle the `M`/`m` key in
`interpretMove` and return its mark-all move. The app shell SHALL render a
control in the same toolbar `wa-button-group` as Hint and Check & Save, shown
only when `canMarkAll` is true, which on activation injects the `M` key via the
surface's `processKey`.

The mark-all action SHALL be **adaptive** for a game whose cells have uniqueness
regions (one that supplies a per-game region provider): if any empty cell has **no
pencil notes at all** the action fills every note-less empty cell with all candidates
(as before); otherwise (every empty cell already carries notes) the action SHALL
instead **remove the obvious candidates** — every pencilled value equal to a value
already *placed* in one of that cell's uniqueness regions (row/column, plus sub-block
and X-diagonal where the game has them; a Keen arithmetic cage is NOT a uniqueness
region). "Obvious" SHALL be judged only against placed values, never inferred from
another pencil mark.

The cleanup SHALL be emitted as the existing atomic `pencilStrike` move with its marks
computed at `interpretMove` time, so replay and undo are exact. When there is nothing to
fill **and** nothing to strike (an already-cleaned, fully-noted board) the action SHALL
produce **no move at all** (a true no-op that adds no undo entry), rather than an empty
`pencilStrike`. The cleanup SHALL be **idempotent** and a pure function of the placed
(non-pencil) grid: repeated presses converge to and remain at "every empty cell noted with
all candidates minus the values placed in its regions" — there SHALL be no fill⇄clean
toggle, and a cleaned board SHALL NOT silently re-fill. A clean SHALL NOT empty a cell of its last note (a cell whose every
candidate is region-eliminated occurs only on an already-mistaken board; leaving its last
note keeps idempotency unconditional). A game without a row/column uniqueness model (e.g.
Undead) SHALL keep the fill-only behaviour.

#### Scenario: A pencil-mark game shows the control and fills candidates

- **WHEN** the active game reports `canMarkAll` true and the player activates
  the toolbar control
- **THEN** the `M` key is injected via `processKey`, the game fills every empty
  cell with all candidate pencil marks, and the board repaints

#### Scenario: A second press on a fully-noted board removes obvious candidates

- **WHEN** every empty cell is already fully noted and the player activates the
  mark-all control on a game with uniqueness regions
- **THEN** the action emits a `pencilStrike` that removes exactly the pencilled
  values already placed in each cell's row/column (and block/diagonal where the game
  has them), leaving every still-possible candidate, and replaying the move
  reproduces the cleaned board

#### Scenario: Repeated presses are idempotent (no re-fill, no toggle)

- **WHEN** the player activates the mark-all control a third time, after a fill and a
  clean, with no board change in between
- **THEN** the cleaned board is unchanged — the action produces no move (a true no-op,
  no undo entry) and does not re-fill any cell — and the resulting notes equal `{1..n}`
  minus the placed values in each cell's regions

#### Scenario: An arithmetic cage is not a uniqueness region

- **WHEN** the game is Keen and a cell's pencilled value also appears in its cage but
  not in its row or column
- **THEN** the cleanup does NOT remove that candidate (the value is still legal under
  the cage's arithmetic constraint)

#### Scenario: A non-uniqueness game keeps fill-only

- **WHEN** the game has no row/column uniqueness model (e.g. Undead)
- **THEN** the mark-all action only ever fills missing candidates; it performs no
  obvious-candidate cleanup

#### Scenario: A game without pencil marks shows no control

- **WHEN** the active game does not set `canMarkAll`
- **THEN** `canMarkAll` is false and the app shell renders no mark-all control

#### Scenario: An unported game reports no capability

- **WHEN** the active game runs on the C/WASM engine
- **THEN** `canMarkAll` is false and the app shell renders no mark-all control
