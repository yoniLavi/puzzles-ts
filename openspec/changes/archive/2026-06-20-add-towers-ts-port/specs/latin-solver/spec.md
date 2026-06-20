## ADDED Requirements

### Requirement: Shared generic Latin-square solver

The engine SHALL provide a generic Latin-square solver in
`src/native/engine/latin.ts`, the idiomatic-TS port of upstream `latin.c`'s
solver framework, for reuse by every Latin-square game (Towers first; Solo,
Unequal, Keen, Group later). It SHALL expose a `latinSolver(grid, o, maxdiff,
diffSimple, diffSet0, diffSet1, diffForcing, diffRecursive, usersolvers, valid,
ctx)` entry point that, given an `o × o` grid (0 = blank) seeded with a game's
fixed cells, applies — up to `maxdiff` — positional and numeric elimination,
row/column set elimination, single-number set elimination, forcing chains, and
guess-and-verify recursion, interleaved with the game's own `usersolvers` at
their declared difficulty levels and validated by the game's `valid` callback.
It SHALL write the solved grid back in place and return the difficulty level at
which it solved, or the numeric sentinels `DIFF_IMPOSSIBLE` (10),
`DIFF_AMBIGUOUS` (11), or `DIFF_UNFINISHED` (12). The candidate cube SHALL be
indexed `(x·o + y)·o + (n−1)`, faithful to upstream `cubepos`.

#### Scenario: Solves a uniquely-determined board

- **WHEN** `latinSolver` runs on a board with a unique completion, with
  recursion permitted
- **THEN** it returns a non-sentinel difficulty
- **AND** the grid is written back as a valid Latin square

#### Scenario: Reports ambiguity

- **WHEN** `latinSolver` runs with recursion on a board with more than one
  completion
- **THEN** it returns `DIFF_AMBIGUOUS`

#### Scenario: Respects the difficulty ceiling

- **WHEN** a board requires a deduction above `maxdiff` and recursion is not
  permitted
- **THEN** `latinSolver` returns `DIFF_UNFINISHED` rather than guessing

### Requirement: Shared Latin-square generator

The engine SHALL provide, in `src/native/engine/latin.ts`, the RNG-faithful
Latin-square generator promoted from the Singles port: `matching` (randomised
bipartite matching), `latinGenerate(o, rng)`, and `latinGenerateRect(w, h, rng)`.
Their random draws SHALL remain bit-identical to upstream `matching.c` /
`latin.c` so that a faithful game generator reproduces the C description exactly
for the same seed. Singles SHALL consume the shared implementation.

#### Scenario: Generated square is Latin and RNG-faithful

- **WHEN** `latinGenerate(o, rng)` is called
- **THEN** the result contains every value `1..o` exactly once in each row and
  column
- **AND** the Singles byte-match differential remains green against the shared
  implementation
