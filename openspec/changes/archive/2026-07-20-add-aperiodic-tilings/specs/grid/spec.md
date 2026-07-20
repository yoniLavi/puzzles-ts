# grid Specification Delta — add-aperiodic-tilings

## ADDED Requirements

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

## MODIFIED Requirements

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
