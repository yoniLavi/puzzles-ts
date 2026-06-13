## MODIFIED Requirements

### Requirement: The engine provides a shared disjoint-set forest (dsf)

The engine SHALL provide the `Dsf` class in `src/native/engine/dsf.ts`, promoted from the Galaxies local implementation. The class SHALL support `constructor(n)`, `reinit()`, `canonify(i)`, `merge(a, b)`, `size(i)` (the number of elements in `i`'s class), and `equivalent(a, b)` (whether `a` and `b` share a class) with path compression and union-by-size. Games that need union-find SHALL import from this shared location.

#### Scenario: A game imports the shared Dsf

- **WHEN** a game needs disjoint-set operations
- **THEN** it imports `Dsf` from `src/native/engine/dsf.ts`
- **AND** no game directory contains a local `dsf.ts`

#### Scenario: Size and equivalence reflect merges

- **WHEN** elements are merged into a class and `size`/`equivalent` are queried
- **THEN** `size(i)` returns the count of elements in `i`'s class for any member `i`
- **AND** `equivalent(a, b)` returns true iff `a` and `b` are in the same class
