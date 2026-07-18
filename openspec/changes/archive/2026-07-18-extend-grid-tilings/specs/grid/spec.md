# grid — spec delta for extend-grid-tilings

## MODIFIED Requirements

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
reproduces upstream's sequential-allocation pointer order.

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

## ADDED Requirements

### Requirement: Periodic tilings

`grid.ts` SHALL provide a generator for each of the 14 periodic tilings —
square, honeycomb, triangular, snub-square, Cairo, great-hexagonal, Kagome,
octagonal, kites, floret, dodecagonal, great-dodecagonal,
great-great-dodecagonal and compass-dodecagonal — selected by a `GridType`
whose ordering SHALL match upstream's `GRIDGEN_LIST`.

Every periodic generator SHALL be a pure function of `(width, height)` (and, for
triangular, its version desc): it SHALL consume no randomness and SHALL use
**exact integer arithmetic only**, because shared corner dots are deduplicated
by exact coordinate equality and a fractional coordinate would silently produce
duplicate dots rather than a visible error. Where upstream relies on C's
truncating integer division, the port SHALL use `Math.trunc` rather than `/`.

Each generator SHALL emit its faces and dots in upstream's emission order, so
that dot, edge and face **indices** agree with the C, not merely the resulting
shape.

The triangular tiling SHALL support both of upstream's algorithms, selected by
its version desc: an absent desc selects the legacy generator (which leaves
ragged boundary "ears") and the desc `"0"` selects the current ear-trimmed one.

#### Scenario: Every periodic tiling builds a consistent grid

- **WHEN** any periodic tiling is built at a legal size
- **THEN** the grid is fully linked — every face's edges join its consecutive
  dots, every edge references one or two faces (a null face being the exterior),
  and every dot's edge and face rings are complete

#### Scenario: Periodic generation is deterministic and integer-exact

- **WHEN** the same periodic tiling is built twice at the same size
- **THEN** the two grids are identical in every dot coordinate, edge and face,
  and in the same order; and no dot coordinate is fractional

#### Scenario: Triangular honours its version desc

- **WHEN** the triangular tiling is built with no desc and again with the desc
  `"0"`
- **THEN** the two grids differ, the former retaining upstream's ragged boundary
  and the latter being ear-trimmed

### Requirement: Grid size computation

`grid.ts` SHALL provide `gridComputeSize(type, width, height)` returning the
tiling's natural `tileSize` and its `xExtent`/`yExtent`, as a pure integer
function of its arguments requiring no constructed grid. Consumers size their
drawing surface from it.

#### Scenario: Size is computed without building a grid

- **WHEN** `gridComputeSize(type, w, h)` is called for a periodic type
- **THEN** it returns integer `tileSize`, `xExtent` and `yExtent` matching the
  bounding box of the grid that `(type, w, h)` would build

### Requirement: Nearest-edge hit testing

`grid.ts` SHALL provide `gridNearestEdge(grid, x, y)` returning the edge nearest
a point, or null when no edge is close enough. Eligibility SHALL be decided by
exact integer arithmetic on squared lengths; only the perpendicular distance
comparison is floating point. The nearest-edge comparison SHALL be strict, so
that on an exact tie the lowest-index edge wins by iteration order.

#### Scenario: A click near an edge selects it

- **WHEN** `gridNearestEdge` is given a point close to one edge of a grid
- **THEN** it returns that edge

#### Scenario: A click far from every edge selects nothing

- **WHEN** `gridNearestEdge` is given a point far from every edge
- **THEN** it returns null

### Requirement: Face incentre for label placement

`grid.ts` SHALL provide `gridFindIncentre(face)` computing the centre of the
largest circle inscribable in a face — the point at which a clue digit or symbol
most easily fits. It SHALL be computed lazily on first request and cached on the
face.

The incentre is **display-only**: it SHALL NOT influence any grid description,
generation or solving, and its exact coordinates SHALL NOT be treated as
byte-parity surface.

#### Scenario: The incentre lies inside its face

- **WHEN** `gridFindIncentre` is called on any face of any tiling, including
  concave and highly non-convex faces
- **THEN** the returned point lies inside that face, and the largest circle
  inscribable at that point is within a small tolerance of upstream's

#### Scenario: The incentre is cached

- **WHEN** `gridFindIncentre` is called twice on the same face
- **THEN** the second call returns the cached result without recomputing

### Requirement: Grid parameter validation

`grid.ts` SHALL provide `gridValidateParams(type, width, height)` returning an
error message for a rejected size and null otherwise. It SHALL reject
non-positive dimensions and sizes large enough to overflow the coordinate
arithmetic for the given tiling.

Per-type **minimum** sizes are deliberately not part of this requirement; they
are a property of the consuming game, not of the geometry.

#### Scenario: An unreasonably large grid is rejected

- **WHEN** `gridValidateParams` is given a size whose extent would overflow
- **THEN** it returns an error message rather than attempting construction

#### Scenario: A legal size is accepted

- **WHEN** `gridValidateParams` is given a legal size for a tiling
- **THEN** it returns null
