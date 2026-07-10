## ADDED Requirements

### Requirement: The engine surface exposes a per-game reference-aid capability

The engine surface SHALL expose an optional per-game "reference aid": a read-only
checklist of a puzzle's fixed inventory of pieces with found/outstanding status, plus a
way to spotlight one item on the board.

The `Game` interface SHALL define two optional hooks:

- `reference(state, ui): ReferenceModel` — returns a plain, serialisable model of the
  inventory. `ReferenceModel` SHALL be `{ items: ReferenceItem[]; selected: string | null;
  columns?: number }`, and `ReferenceItem` SHALL be `{ key: string; label: string; pips?:
  readonly number[]; status: "outstanding" | "placed" | "conflict" }`. `key` is a stable id;
  `pips` is optional face-value data for games whose pieces render as pips; `selected`
  echoes the currently spotlighted key (or null).
- `selectReference(ui, key): boolean` — spotlights the item `key` (or clears it when `key`
  is null) by mutating `Ui`, and returns whether anything changed.

The `Midend` SHALL surface `hasReference = this.game.reference !== undefined` in its static
attributes, and SHALL provide `getReference(): ReferenceModel | null` (returning
`game.reference(state, ui)` or null) and `selectReference(key): void`. `selectReference`
SHALL call `game.selectReference(this.ui, key)` and, on a `true` return, take the same
repaint path as a `UI_UPDATE`: it SHALL NOT create a move, add an undo entry, alter the move
log, or be serialised into a save. For an unported C/WASM game `hasReference` SHALL be false,
`getReference()` SHALL return null, and `selectReference()` SHALL be a no-op.

`hasReference`, `getReference`, and `selectReference` SHALL be part of the shared
`PuzzleEngineSurface` so the same call site works for both the TS midend and C/WASM.

#### Scenario: A game exposing a reference is discoverable through the surface

- **WHEN** the active game defines `reference` and the app queries static attributes
- **THEN** `hasReference` is true and `getReference()` returns the game's model, whose
  `items` reflect current board state and whose `selected` matches the spotlighted key

#### Scenario: Selecting a reference item repaints without a history entry

- **WHEN** the app calls `selectReference(key)` on a game whose `selectReference` reports a
  change
- **THEN** the board repaints with that item spotlighted, and no move is added — the move
  log, undo/redo availability, and any subsequent save are byte-for-byte identical to before
  the call

#### Scenario: An unported game reports no reference

- **WHEN** the active game is served by C/WASM
- **THEN** `hasReference` is false, `getReference()` returns null, `selectReference()` does
  nothing, and no reference control is shown

### Requirement: The app shell shows a non-blocking, responsive reference panel

The app shell SHALL render a reference control in the same toolbar button group as Hint,
shown only when `hasReference` is true. Activating it SHALL toggle a `<reference-panel>`
open and closed like a disclosure (not a one-shot modal).

The panel SHALL be **non-blocking** and keep the board visible and interactive while open,
in both layouts:

- When there is room to dock beside the board — a wide viewport that is **not** in the
  app's short-landscape "horizontal" orientation — the panel SHALL dock beside the board
  (the board reflowing to make room), with no scrim over the board.
- On a narrow viewport, **or** in the app's "horizontal" orientation (short landscape,
  where a side dock would shove the board off-centre against the toolbar column), the panel
  SHALL present as a bottom sheet, leaving the board visible and centred above it, with an
  explicit close affordance and no scrim.

The panel SHALL render each `ReferenceItem` with status-distinct styling (drawing `pips` as
piece faces when present, else `label`), reflect found status **live** as the board changes,
and on clicking an item SHALL toggle its selection and call `selectReference` with that item's
`key` (or null when deselecting). Selection feedback in the list SHALL be immediate and SHALL
NOT wait on the asynchronous model refresh.

The board spotlight SHALL **persist when the panel is closed** — on a small screen the common
flow is to mark a piece, close the (large) panel to see the board, then act on the highlight,
so closing MUST NOT clear it. The primary dismiss is therefore a **board interaction**: acting
on the board clears the spotlight (a game clears it in `interpretMove` on any board tap — the
discoverable, touch-friendly clear). Additionally, the **Escape** key SHALL clear it whether the
panel is open (leaving the panel open) or closed, and re-clicking the selected item also clears
it.

#### Scenario: The control appears only for a reference-bearing game

- **WHEN** the active game reports `hasReference` true
- **THEN** a reference toggle button is shown next to Hint; for a game reporting false, no
  such button is shown

#### Scenario: The panel keeps the board interactive and updates live

- **WHEN** the panel is open and the player places or removes a piece on the board
- **THEN** the board input is unaffected by the panel and the panel's checklist status
  updates to reflect the new board state without being reopened

#### Scenario: Clicking an item spotlights it on the still-visible board

- **WHEN** the player clicks an outstanding item in the open panel
- **THEN** the item shows as selected immediately and the board (still visible beside or
  above the panel) highlights that item's occurrences; clicking it again clears the highlight

#### Scenario: The spotlight persists after close and clears on Escape

- **WHEN** a reference item is spotlighted and the player closes the panel
- **THEN** the board spotlight remains (so the player can act on it with the panel out of the way)
- **WHEN** a reference item is spotlighted and the player presses Escape (panel open or closed)
- **THEN** the spotlight is cleared — and if the panel is open its item is deselected and it stays open
