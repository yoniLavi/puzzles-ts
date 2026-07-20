# path Specification Delta — add-path-ts-port

## ADDED Requirements

### Requirement: Path provides a Numberlink solver that proves uniqueness

The engine SHALL provide `src/native/games/path/solver.ts` implementing a
Numberlink solver that, given a board of numbered endpoint pairs, determines
whether the board is solvable and whether its solution is **unique**. Upstream
never wrote this solver, and unique-solution generation is impossible without
it, so it is a prerequisite of every other part of this capability and SHALL be
proven before the game and generator are built.

#### Scenario: The solver classifies a board's solution count

- **WHEN** the solver is run on a hand-authored board known to be uniquely
  solvable, ambiguous, or unsolvable
- **THEN** it reports the matching classification

### Requirement: Path implements the Numberlink game over a uniqueness-gated generator

The engine SHALL provide a registered `path` game implementing the `Game`
interface: on a `w × h` grid the player links each pair of like-numbered
endpoints with a non-crossing path, filling the grid under the standard ruleset.
The generator SHALL use upstream `path.c`'s path-growing strategy as a candidate
producer but SHALL accept only candidates the solver proves uniquely solvable,
and SHALL mitigate the quality problems upstream recorded (too many trivial
paths, hopelessly interwoven grids, and boring straight-line paths). Because
there is no upstream game or solver, this capability's assurance SHALL be
behavioural — every generated board is uniquely solvable — rather than a
byte-for-byte differential against C.

Input SHALL be click-and-drag between adjacent cells to create a link, over a
connection-based data model that lets the player mark path sections before they
are joined to an endpoint. The game SHALL be reported solved when every pair is
joined by a non-crossing path satisfying the ruleset.

#### Scenario: Generated boards are uniquely solvable

- **WHEN** a new game is generated at any offered size and difficulty
- **THEN** the board it produces has exactly one solution under the solver

#### Scenario: Linking adjacent cells builds a path

- **WHEN** the player drags from a cell to an adjacent cell
- **THEN** a link is created between them and recorded as an undoable move

#### Scenario: Completing all paths wins

- **WHEN** every numbered pair is joined by a non-crossing path satisfying the
  ruleset
- **THEN** the game is reported solved
