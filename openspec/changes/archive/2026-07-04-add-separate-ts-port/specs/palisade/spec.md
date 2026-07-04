# palisade Specification

## ADDED Requirements

### Requirement: Palisade shades completed correct regions

The render SHALL shade a wall-bounded region with the shared completed-region colour (a neutral `COL_CORRECT` grey, matching Rectangles) once
it is a completed, correct region — exactly `k` cells, every clue in it equal to
its wall count, and no wall interior to it — giving the player the same
local-correctness feedback Galaxies and Rectangles give. The untouched board (one
undivided region) SHALL NOT be shaded. The shading is a local check on the region
as drawn, not a check against the unique solution. The valid overlay SHALL be part
of the render cache diff key so it appears and clears as regions are completed and
broken. (Introduced alongside the Separate port, which shares Palisade's wall
model and gains the identical feedback.)

#### Scenario: The solved board shades every region, the untouched board none

- **WHEN** the board carries the unique solution's walls
- **THEN** every region renders with the `COL_CORRECT` background
- **AND** the untouched board (no interior walls) renders none
