# grid Specification

The shared planar-grid geometry leaf and its random-loop generator (upstream
`grid.c` + `loopgen.c`), ported idiomatically and lazily with their first
consumer (Pearl). The square tiling only is in scope here; the remaining tilings
are added by the eventual Loopy port.

## ADDED Requirements

### Requirement: Shared planar-grid data structure and deterministic square tiling

The engine SHALL provide `src/native/engine/grid.ts` exposing a general
planar-grid data structure — `Grid` with arrays of `GridFace`, `GridEdge` and
`GridDot`, a bounding box, and a `tileSize` — with full reference incidence: each
edge references its two dots and its two faces (a null face reference denotes the
infinite exterior); each face references its clockwise-ordered edges and dots
(edge `k` joins dots `k` and `k+1`); each dot references its clockwise-ordered
edges and faces. The structure SHALL be immutable after construction and shared
by reference (no refcount; GC replaces `grid_free`). It SHALL provide
`gridNewSquare(width, height)` building the square tiling **deterministically**
from `(width, height)` alone (no randomness, no floating point): one four-dot
face per cell with `tileSize = 20`, shared corner dots deduplicated. A shared
`makeConsistent` step SHALL derive the edges (deduplicated by their dot pair,
assigning each edge its one or two faces), the per-face edge lists, the per-dot
edge and face rings (walked clockwise then anticlockwise past the exterior face),
and the bounding box. All ordering tie-breaks SHALL be by array index, which
reproduces upstream's sequential-allocation pointer order. Only the square tiling
is provided; the other tilings and the floating-point helpers
(`grid_nearest_edge`, `grid_find_incentre`, `grid_compute_size`) are out of
scope until a later consumer needs them.

#### Scenario: A square grid has the expected incidence

- **WHEN** `gridNewSquare(w, h)` is built
- **THEN** it has `w*h` faces, each a four-sided face whose edges join its
  consecutive corner dots, every interior edge references two faces and every
  border edge references one face (the other being the exterior), and shared
  corner dots are a single dot instance

#### Scenario: Square construction is deterministic

- **WHEN** `gridNewSquare(w, h)` is built twice with the same `w`, `h`
- **THEN** the two grids have identical faces, edges and dots in the same order
  (no randomness enters square construction)

### Requirement: RNG-faithful random loop generation

The engine SHALL provide `src/native/engine/loopgen.ts` exposing
`generateLoop(grid, board, rng, bias?)` which colours every face of `grid`
inside (white) or outside (black) so that the white/black boundary is a single
closed loop, writing the colouring into `board`. It SHALL reproduce the upstream
`generate_loop` RNG draw order exactly — a per-face 31-bit random score, a random
seed face, a per-iteration random candidate colour, a shuffle of the face list,
and a final random flip pass — with candidate faces ordered by score, then their
random score field, then face index (reproducing upstream's pointer-order tie
break). An optional `bias` callback (the upstream contract: invoked with a face
tentatively set, then restored, then notified on commit; consuming no randomness)
SHALL let a consumer bias generation toward desirable loops. Given a fixed seed,
the generated loop SHALL be reproducible.

#### Scenario: Loop generation yields a single closed loop

- **WHEN** `generateLoop` runs on a square grid with a fixed seed and no bias
- **THEN** the resulting white/black face colouring has a boundary that is one
  closed loop, and the same seed yields the same colouring every run
