# fifteen Specification Delta — unify-cross-game-vocabulary

## MODIFIED Requirements

### Requirement: Fifteen slide and solve moves transform state purely

A `FifteenMove` SHALL be either a slide carrying the destination gap cell
(`{ type: "move", x, y }`) or a solve (`{ type: "solve" }`). `interpretMove`
SHALL produce a slide only when the target cell shares exactly one coordinate
with the current gap (a click sharing zero or both coordinates, or out of
bounds, produces nothing); cursor keys SHALL slide the adjacent tile into the
gap immediately using the default arrow semantics (the pressed arrow moves a
tile in that direction). `executeMove` SHALL be pure (returning a new state):
a slide shifts every tile on the line between the old and new gap one cell
toward the old gap, incrementing the move count once per shifted tile and
recording completion when the solved arrangement is first reached; a solve
SHALL replace the grid with the solved permutation, set `cheated`, and
suppress the completion flash.

#### Scenario: A slide shifts a line of tiles into the gap

- **WHEN** a slide move targets a cell sharing one coordinate with the gap,
  three tiles away along that line
- **THEN** all three tiles shift one cell toward the old gap, the gap lands on
  the targeted cell, the move count increases by three, and the source state
  is unmutated

#### Scenario: Click geometry constrains legal slides

- **WHEN** a click targets a cell diagonal to the gap (sharing neither
  coordinate exactly, or sharing both)
- **THEN** no move is produced

#### Scenario: Solve snaps to the solved board

- **WHEN** the solve move executes
- **THEN** the new state is the solved permutation with `cheated` set, and
  the completion flash is suppressed on the following redraw
