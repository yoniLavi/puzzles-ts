# grid Specification Delta — adopt-american-spelling

## RENAMED Requirements

- FROM: `### Requirement: Face incentre for label placement`
- TO: `### Requirement: Face incenter for label placement`

## MODIFIED Requirements

### Requirement: Face incenter for label placement

`grid.ts` SHALL provide `gridFindIncenter(face)` computing the center of the
largest circle inscribable in a face — the point at which a clue digit or symbol
most easily fits. It SHALL be computed lazily on first request and cached on the
face.

The incenter is **display-only**: it SHALL NOT influence any grid description,
generation or solving, and its exact coordinates SHALL NOT be treated as
byte-parity surface.

The stored point SHALL be rounded to the nearest integer on each axis.
Upstream's `(int)(v + 0.5)` SHALL NOT be reproduced: C's double-to-int
conversion truncates toward zero, so that expression is round-to-nearest only
for a positive coordinate, and grid coordinates are negative over most of a
board. Reproducing it costs up to 1.229 units of inscribed radius against the
best the integer lattice admits, where rounding costs 0.053 — measured over
every face of all eighteen tilings.

The quality of the returned point SHALL be asserted against the largest circle
**independently computable** at any integer point of the face, not against
another implementation's answer. A comparison to a peer is green whenever both
implementations are wrong in the same way, which is exactly how the truncation
above survived for as long as it existed.

#### Scenario: The incenter lies inside its face

- **WHEN** `gridFindIncenter` is called on any face of any tiling, including
  concave and highly non-convex faces
- **THEN** the returned point lies strictly inside that face, admitting a circle
  of non-zero radius

#### Scenario: The incenter admits nearly the largest circle the face allows

- **WHEN** the inscribed radius at the returned point is compared with the best
  inscribed radius over the integer points of the face, derived independently of
  `grid-geometry.ts`
- **THEN** the shortfall is within the half-unit-per-axis the rounding step can
  cost, and the ratio is close to 1
- **AND** the tilings swept are enumerated from `ALL_GRID_TYPES`, so a newly
  added tiling joins the sweep without anyone remembering to add it

#### Scenario: The incenter is cached

- **WHEN** `gridFindIncenter` is called twice on the same face
- **THEN** the second call returns the cached result without recomputing
