# cube Specification

## ADDED Requirements

### Requirement: Cube game implements the Game interface

The engine SHALL provide a registered `cube` game implementing
`Game<CubeParams, CubeState, CubeMove, CubeUi, CubeDrawState>`: a polyhedron
rolled around a tiled arena to collect paint from blue grid squares onto the
solid's faces. Params SHALL be `solid` (one of tetrahedron/cube/octahedron/
icosahedron), `d1`, `d2`, encoded `<t|c|o|i><d1>x<d2>` with lenient decode (a
missing leading solid letter and a missing `x<d2>` both tolerated, `d2`
defaulting to `d1`). The four upstream presets (Cube `c4x4`, Tetrahedron
`t1x2`, Octahedron `o2x2`, Icosahedron `i3x3`) SHALL be offered. The game
SHALL report `wantsStatusbar = true`, `isTimed = false`, `canSolve = false`,
and `canFormatAsText = false` (Cube is a route puzzle with no solver, hint,
mistake-check, or text format).

#### Scenario: Params round-trip and lenient decode

- **WHEN** params `{ solid: cube, d1: 4, d2: 4 }` are encoded
- **THEN** the result is `c4x4`
- **AND** decoding `c4x4`, `4x4`, and `4` all yield well-formed params with
  `d2` defaulting to `d1` when the `x<d2>` segment is absent

#### Scenario: A generated board is winnable and starts unsolved

- **WHEN** a new game is created from any preset
- **THEN** the solid is placed on a start square, a non-empty set of blue
  squares is painted, and the initial state reports a not-completed status

### Requirement: Cube roll moves transform orientation and swap paint

A `CubeMove` SHALL be a roll in one direction (the four orthogonal directions
on a square grid; up to eight, including diagonals, on triangular and
hexagonal grids). `executeMove` SHALL be pure (returning a new state),
computing the destination square and the solid's new resting face from the
current orientation key-points, and exchanging paint between the destination
square and the face that lands on it. Rolling onto the last required blue
square SHALL transition the state to completed (recording the move count).

#### Scenario: Rolling tips the solid onto a new face

- **WHEN** a roll move executes from a given orientation
- **THEN** the new state's resting face differs per the polyhedron's geometry
- **AND** paint is exchanged between the destination square and the landing
  face, leaving the source state unmutated

#### Scenario: Direction set depends on grid topology

- **WHEN** input is interpreted on a square-grid board
- **THEN** only the four orthogonal roll directions are produced
- **AND** on a triangular or hexagonal board the diagonal directions are also
  available

### Requirement: Cube renders the solid, grid, and rolling animation

The Cube `redraw` SHALL draw the arena's grid squares (blue squares
distinguished from background), the solid projected to two dimensions with its
isometric shear and back-face culling, and a roll animation interpolating the
solid's orientation from the previous square to the current one over the roll
duration. Cube fully repaints every frame (its scene is a handful of polygons)
— there is no per-tile cache and **no win flash** (upstream's `flash_length`
is 0; completion is reported only in the status bar). The engine SHALL emit no
pixels of its own: cube fills its own background rect each frame.

#### Scenario: Draw output contains grid squares and the solid

- **WHEN** `redraw` runs against a recording `GameDrawing` double for a fresh
  board
- **THEN** the recorded operations include the grid squares (with blue squares
  drawn in the blue colour) and the solid's projected polygons

#### Scenario: A roll animates between squares

- **WHEN** a roll move has just executed and `redraw` runs mid-animation
- **THEN** the solid is drawn at an interpolated orientation between its
  previous and current squares, settling exactly on the destination square at
  animation end
- **AND** the grid squares and face paint drawn during the animation are the
  pre-move (old) state's, since the roll visibly happens before the paint
  swap settles
