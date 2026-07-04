# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: The engine provides a shared loop-finding helper

The engine SHALL provide `src/native/engine/findloop.ts`, an idiomatic TS
port of upstream `findloop.c` (Tarjan's bridge-finding algorithm, the
non-recursive linked-list variant): `findLoops(nvertices, neighbours)`
takes a neighbour callback `(vertex: number) => Iterable<number>` over an
undirected graph and returns `{ anyLoop, isLoopEdge(u, v),
isBridge(u, v) }`, where an edge is a loop edge exactly when it is not a
bridge (its removal would not disconnect its component) and `isBridge`
optionally reports the vertex counts on either side. Games needing
loop-error detection (Slant now; Bridges, Dominosa, Loopy, Tracks when
ported) SHALL consume this helper rather than re-rolling it.

#### Scenario: A cycle's edges are loop edges

- **WHEN** `findLoops` runs over a graph containing a cycle with a tail
- **THEN** `anyLoop` is true, every cycle edge reports `isLoopEdge` true,
  and the tail edge reports `isLoopEdge` false

#### Scenario: A forest has no loops

- **WHEN** `findLoops` runs over a multi-component tree graph
- **THEN** `anyLoop` is false and every edge is a bridge with correct
  vertex counts on each side

### Requirement: Fit-to-window sizing honours user-size expansion

`Midend.size(maxSize, isUserSize, dpr)` SHALL resolve the tile size as
upstream `midend_size` does: the largest integer tile size whose
`computeSize` result fits `maxSize` (binary search), where `isUserSize`
permits growing beyond the game's preferred tile size and its absence caps
the tile at the preferred size. The app shell passes `isUserSize = true`
(fill the layout slot), so a TS-served game SHALL occupy the same space the
C/WASM build did rather than freezing at its preferred size. The call
remains purely informational per the existing size requirement (no
drawstate recreation, no cache invalidation).

#### Scenario: A large slot expands the board

- **WHEN** `size` is called with user-size on a slot much larger than the
  preferred-size board
- **THEN** the resolved tile size exceeds the preferred tile size and the
  returned window size fits the slot

#### Scenario: Without user-size the preferred size is the ceiling

- **WHEN** `size` is called without user-size on the same large slot
- **THEN** the resolved tile size equals the preferred tile size
