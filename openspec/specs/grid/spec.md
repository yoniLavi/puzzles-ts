# grid Specification

## Purpose
TBD - created by archiving change add-pearl-ts-port. Update Purpose after archive.
## Requirements
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
function of its arguments requiring no constructed grid, for **all 18 tilings**.
Consumers size their drawing surface from it.

For the Penrose and spectre tilings the constructed grid is re-centred within the
reported extent; for the hat tiling it deliberately is not, so a hat grid's
bounding box will generally not equal its reported extent.

#### Scenario: Size is computed without building a grid

- **WHEN** `gridComputeSize(type, w, h)` is called for any tiling
- **THEN** it returns integer `tileSize`, `xExtent` and `yExtent`

#### Scenario: A periodic grid's bounding box matches its reported extent

- **WHEN** a periodic tiling is built at `(w, h)`
- **THEN** its bounding box matches the extent `gridComputeSize` reports

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
error message for a rejected size and null otherwise, for **all 18 tilings**. It
SHALL reject non-positive dimensions and sizes large enough to overflow the
coordinate arithmetic for the given tiling.

Per-type **minimum** sizes are deliberately not part of this requirement; they
are a property of the consuming game, not of the geometry.

#### Scenario: An unreasonably large grid is rejected

- **WHEN** `gridValidateParams` is given a size whose extent would overflow
- **THEN** it returns an error message rather than attempting construction

#### Scenario: A legal size is accepted

- **WHEN** `gridValidateParams` is given a legal size for any of the 18 tilings
- **THEN** it returns null

### Requirement: Aperiodic tilings

`grid.ts` SHALL provide a generator for each of the four aperiodic tilings —
Penrose P2 (kite/dart), Penrose P3 (thick/thin rhombs), hats and spectres —
selected by the same `GridType` whose ordering matches upstream's `GRIDGEN_LIST`,
completing the collection at 18 tilings.

Each aperiodic generator SHALL be a **pure deterministic function of
`(width, height, desc)`**: all randomness SHALL be confined to grid-description
generation. Its arithmetic SHALL be exact — Penrose in ℤ[√5], spectres in ℤ[√3],
hats in plain integers on a triangular lattice — with the irrational part
converted to integer pixels exactly once, at the tiling-to-grid boundary, by
`nTimesRootK`. The rational and irrational parts SHALL be scaled separately and
then summed, so that exactly one rounding occurs.

Dot coordinates SHALL be normalised so that no coordinate is negative zero,
because dot deduplication is by exact coordinate equality and a negative zero
produces a structurally correct grid that nonetheless differs from the reference.

Faces SHALL be emitted in upstream's order, so that dot, edge and face
**indices** agree with the C rather than merely the resulting shape.

Legacy (pre-rewrite) Penrose grid descriptions — those beginning with `'G'` —
SHALL be rejected with an explicit error naming them, rather than silently
falling through to a misleading parse error.

#### Scenario: Every aperiodic tiling builds a consistent grid

- **WHEN** any aperiodic tiling is built at a legal size from a valid
  description
- **THEN** the grid is fully linked — every face's edges join its consecutive
  dots, every edge references one or two faces (a null face being the exterior),
  and every dot's edge and face rings are complete

#### Scenario: Aperiodic construction is deterministic given a description

- **WHEN** the same aperiodic tiling is built twice from the same
  `(width, height, desc)`
- **THEN** the two grids are identical in every dot coordinate, edge and face,
  and in the same order, and no dot coordinate is fractional or negative zero

#### Scenario: A legacy Penrose description is rejected

- **WHEN** `gridNew` or `gridValidateDesc` is given a Penrose description
  beginning with `'G'`
- **THEN** it reports an error identifying the description as an unsupported
  legacy format

### Requirement: Grid description round-trip

`grid.ts` SHALL provide `gridNewDesc(type, width, height, rng)` producing a grid
description string, and `gridValidateDesc(type, width, height, desc)` returning
an error message for a rejected description and null otherwise.

`gridNewDesc` SHALL be the **only** randomness-consuming function in the module.
It SHALL return `"0"` for the triangular tiling and null for the other twelve
periodic tilings; `gridValidateDesc` SHALL reject a description supplied for a
tiling that does not use one.

For the aperiodic tilings, description generation SHALL reproduce upstream's
random draw order **exactly**, including draws whose outcome is predetermined:
where upstream consults a weighted candidate list holding a single entry, the
port SHALL still consume a random draw, because the draw is an observable effect
on the stream rather than a computation whose result may be shortcut. Weight
constants SHALL be transcribed as the integers upstream uses and SHALL NOT be
recomputed from irrational expressions.

Where a stored description is replayed and its coordinates are exhausted, the
port SHALL reproduce upstream's fixed-seed fallback generator exactly — created
lazily at the same point and shared thereafter — because divergence yields a
different grid for the same description with no detectable error.

Description parsing SHALL validate the length of the description before deriving
a coordinate count from it.

#### Scenario: A generated description round-trips

- **WHEN** `gridNewDesc` produces a description for an aperiodic tiling
- **THEN** `gridValidateDesc` accepts it and `gridNew` builds a grid from it

#### Scenario: Description generation reproduces the reference draw order

- **WHEN** `gridNewDesc` is called for an aperiodic tiling with a given seed
- **THEN** the description string it produces matches the one upstream produces
  from the same seed

#### Scenario: A malformed description is rejected rather than crashing

- **WHEN** `gridValidateDesc` is given an empty, truncated, or otherwise
  malformed description, including one too short to carry a coordinate count
- **THEN** it returns an error message, and no construction is attempted

### Requirement: Vigorous trimming of aperiodic patches

`grid.ts` SHALL provide `gridTrimVigorously(grid)`, retaining only those faces
adjacent to a landlocked dot (one not touching the infinite exterior) whose
landlocked dots lie in the single largest connected component, then compacting
faces and dots in place — preserving relative order and renumbering their indices
densely. It SHALL run before incidence is derived, on faces that know only their
clockwise dots.

It SHALL be implemented as a directed-adjacency index over dots rather than a
dense pairwise matrix. Upstream's matrix stores a face index that is never read
back — only tested for presence — and scales as O(dots²) in both time and space,
which is not viable at the sizes this port must support in a browser.

Trimming SHALL raise an error rather than return an empty grid when no landlocked
component exists.

#### Scenario: A ragged patch is trimmed to its landlocked core

- **WHEN** `gridTrimVigorously` runs on a freshly generated aperiodic patch with
  a ragged boundary
- **THEN** faces not adjacent to any landlocked dot are removed, the remaining
  faces and dots are renumbered densely in their original relative order, and the
  grid then links up consistently

#### Scenario: Only the largest landlocked component survives

- **WHEN** trimming a grid whose landlocked dots form more than one connected
  component
- **THEN** only the faces selected by the largest component are retained

#### Scenario: A patch with no landlocked dots is an error

- **WHEN** trimming a grid in which no dot is landlocked
- **THEN** an error is raised rather than an empty grid returned

