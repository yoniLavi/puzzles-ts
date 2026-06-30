# pattern Specification

## MODIFIED Requirements

### Requirement: Pattern accepts drag-fill rectangle and cursor input

`interpretMove` SHALL reproduce upstream's input with one deliberate
divergence (drag-paint skips placed marks): a left/right/middle press begins a
drag setting the target state (`Full` / `Empty` / `Unknown`, with the
stylus-modifier cycling), a drag snaps to a single row or column (except a
middle-button `Unknown` drag, which fills a rectangle), and release emits a
`fill` move covering the dragged rectangle **only when at least one non-immutable
cell in it would change** (otherwise a UI update).

A **multi-cell paint drag** (the value is `Full` or `Empty` and the rectangle
covers more than one cell) SHALL fill only cells currently `Unknown`, leaving
already-marked cells untouched, so dragging across the board never rewrites a
mark the player already placed. A **single-cell** action SHALL overwrite the
cell (so a deliberate click can change a mark), and a **clear** drag (value
`Unknown`) SHALL still reset marked cells. This is carried by an `onlyBlank`
flag on the `fill` move, honoured by `executeMove` and previewed consistently by
`redraw`.

Keyboard cursor movement with the control/shift modifiers SHALL set cells to
`Empty` / `Full` / `Unknown` via the same rectangle move, and the cursor-select
keys SHALL cycle a cell's state. Immutable cells SHALL never be overwritten.

#### Scenario: A drag that changes cells emits a move

- **WHEN** the player left-drags across cells not all already `Full`
- **THEN** release emits a `fill` move setting the blank cells of that line to
  `Full`

#### Scenario: A multi-cell paint drag leaves placed marks

- **WHEN** the player drag-paints a line that crosses a cell they have already
  marked the opposite colour
- **THEN** that already-marked cell keeps its colour and only the blank cells of
  the line are painted

#### Scenario: A single click still overwrites a mark

- **WHEN** the player clicks a single already-marked cell with the other paint
  button
- **THEN** the cell takes the new colour

#### Scenario: A no-op drag produces no move

- **WHEN** the player drags over cells that already hold the target state (or are
  all immutable)
- **THEN** no history-affecting move is produced
