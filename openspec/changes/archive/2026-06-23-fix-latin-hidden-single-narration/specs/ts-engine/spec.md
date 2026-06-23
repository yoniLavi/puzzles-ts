# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: Latin-family hints distinguish naked, hidden and forced singles

A Latin-square-family game's hint SHALL narrate a forced single placement by the deduction that actually forces it, re-derived from the working board, not from the solver's recorded reason.

This applies to every game riding the shared `latin.ts` solver (Towers, Unequal,
Keen, and future Solo / Undead). The generic `elim` records naked and hidden singles
under one `single` reason; the hint re-derives which it is and narrates accordingly.
The shared classifier (`src/native/engine/latin-hint.ts`) distinguishes three kinds,
considering only *empty* cells as competitors for a digit:

1. a **naked single** — the cell's own candidates are exactly `{n}` — narrated "every
   other number/height has been ruled out in this cell, so it can only be N", with the
   cell alone as evidence;
2. a **hidden single** — no other empty cell of a row (or a column) can still take `n`,
   the cell itself still showing several candidates — narrated by its line ("in this
   row/column, N can go in only this cell"), with the **whole row or column** shaded as
   evidence;
3. a **forced single** — neither of the above (the working notes lag behind a deeper
   set/forcing deduction) — narrated honestly ("working through this cell's row and
   column together, only N can still go here") **without** claiming the cell's visible
   candidates are down to one.

A game SHALL reclassify **only** a recorded `single` placement; a game's own
clue/region-driven forced placements (e.g. Towers' facing-clue and full-line
placements) keep their own reasons. A hidden single's evidence SHALL be its full line
of cells so the player can see that no other cell in the line takes the digit.

#### Scenario: A hidden single is narrated by its line

- **WHEN** a Latin-family hint forces a placement into a cell that still shows several
  candidates, because the placed digit fits nowhere else in its row (or column)
- **THEN** the narration names the line ("in this row/column, N can go in only this
  cell"), not "every other number has been ruled out in this cell"
- **AND** the whole row (or column) is shaded as evidence, the cell marked as the
  placement target

#### Scenario: The naked-single phrasing is never used on a multi-candidate cell

- **WHEN** any Latin-family hint emits a placement step whose narration says "ruled
  out in this cell"
- **THEN** the cell's working notes are genuinely a single candidate (a true naked
  single) — a hidden or forced single uses its own truthful narration instead
