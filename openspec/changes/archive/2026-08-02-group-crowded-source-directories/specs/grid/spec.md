# grid Specification Delta — group-crowded-source-directories

> Path correction only. The grid family moves into `src/engine/grid/`, and the
> barrel `grid.ts` becomes `grid/index.ts` (design D4). Nothing about the data
> structure or its guarantees changes; the requirement is restated because it
> names the file.

## MODIFIED Requirements

### Requirement: Shared planar-grid data structure and deterministic square tiling

The engine SHALL provide `src/engine/grid/index.ts` exposing a general
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
reproduces upstream's sequential-allocation pointer order.

That module is a **barrel**, and its own doc comment tells callers to import from
it rather than from the parts (`grid-core.ts`, `grid-desc.ts`, `grid-geometry.ts`,
`grid-trim.ts`, the `grid-tilings*` family and `tilings/`), which live beside it
under `src/engine/grid/`. The barrel status is load-bearing beyond convenience:
`scripts/feedback-probe.mjs` counts a test importing the barrel as a local test
of every part it re-exports.

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
