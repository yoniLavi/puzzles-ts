# boats Specification Delta — audit-author-known-issues

## ADDED Requirements

### Requirement: The fleet display fits the canvas for every legal fleet

The inventory of boats drawn beneath the board SHALL be laid out entirely within
the width the game reports for its canvas, for every fleet configuration
parameter validation admits. Rows SHALL break between whole batches of one boat
size, keeping a size's boats together, **and** within a batch that is itself too
wide for a row — a fleet holding more boats of one size than fit across the board
otherwise draws past the right edge, which upstream records as a known defect
(`TODO ui: Certain custom fleets don't fit in the UI`).

The layout SHALL be computed once and shared by the size calculation and the
renderer, so the reported canvas height always matches the number of rows drawn.
Wherever upstream's batch-only layout stayed inside the row limit, the layout
SHALL be identical to it.

#### Scenario: A fleet wider than one row wraps instead of overflowing

- **WHEN** the fleet holds more boats of one size than fit across the board
- **THEN** that batch wraps onto a further row, every boat is drawn inside the
  canvas width, and the reported canvas is tall enough for the extra row

#### Scenario: A fleet that already fitted is laid out unchanged

- **WHEN** a fleet whose every batch fits within a row is drawn
- **THEN** each size's boats stay together on one row, positioned as before
