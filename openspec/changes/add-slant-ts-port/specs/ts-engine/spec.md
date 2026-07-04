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
