# mathrax Specification Delta — audit-guessing-tier-names

Mathrax's top tier is renamed `Recursive` → `Unreasonable` (design D7): it
guesses and verifies — a **Search** under design D9 — and `Unreasonable` is the
one tier word the collection reserves for that. The encoded difficulty character
is unchanged, so game IDs, saved games and shared links are unaffected, and no
board moves.

The size-3 refusal message named two tiers **in prose**, so a rename would have
left the message and the menu disagreeing; it is now built from the tier list.

## MODIFIED Requirements

### Requirement: Mathrax game implements the Game interface

The engine SHALL provide a complete implementation of the `Game<…>` engine
interface for Mathrax, registered so the puzzle is served by the TypeScript engine.

Parameters SHALL be a grid size, a difficulty (Easy, Normal, Tricky or
`Unreasonable`), and a set of enabled clue types (addition, subtraction,
multiplication, division, equality, even/odd). The top tier is named
`Unreasonable` rather than upstream's `Recursive` because it reaches its answer by
guessing and verifying; its encoded difficulty character is unchanged, so an
existing game ID names the same board. Validation SHALL require the size to be at
least 3 and at most 9, the difficulty to be known, and — when validating for
generation — at least one clue type enabled. A game ID SHALL encode the size,
difficulty and enabled clue types and round-trip through decode, where an empty
encoded clue-type set means all clue types are enabled.

The objective SHALL be to fill the grid with digits from 1 to the grid size so that no
digit repeats in any row or column and every clue is satisfied.

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same size, difficulty and enabled clue types are recovered

#### Scenario: The renamed top tier keeps its difficulty character

- **WHEN** params at the top tier are encoded to a game ID
- **THEN** the difficulty character is the one the tier had under its former
  name, so an ID written before the rename still names the same board

#### Scenario: Every preset produces a uniquely solvable board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose filled solution is unique and satisfies every
  clue

### Requirement: Mathrax ports the Latin-square solver and generator faithfully

Mathrax SHALL solve using the shared Latin-square solver framework, contributing its
own clue deductions: for each cell it SHALL intersect its candidate digits with those
permitted by each adjacent clue given the opposite cell's candidates, across the Easy,
Normal, Tricky and `Unreasonable` difficulty levels. The generator SHALL produce a full
Latin square, derive a candidate clue at every interior intersection, and then remove
given digits and clues in a randomised order while the puzzle remains **uniquely**
solvable at the target difficulty. Generation from a given seed SHALL be reproducible.

Uniqueness is required at *every* difficulty, including the guess-and-verify
`Unreasonable` tier. This is a deliberate divergence from upstream, which tests its
solver's verdict for bare truthiness and so accepts an *ambiguous* verdict as grounds
to keep removing — leaving that whole tier with puzzles that have several solutions
(measured: 30 of 30 sampled boards, and the recorded C descriptions for it are blank
grids). A board with no unique answer cannot be mistake-checked, so Check & Save would
silently pass anything played on it.

#### Scenario: The solver solves a generated board

- **WHEN** a generated board is solved
- **THEN** the returned grid is the board's unique Latin-square solution and satisfies
  every clue

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

#### Scenario: Even the guess-and-verify tier yields a unique solution

- **WHEN** a board is generated at the `Unreasonable` difficulty
- **THEN** it has exactly one solution, and it cannot be solved without the
  guess-and-verify step

### Requirement: Mathrax offers only the difficulties a size can support

Mathrax SHALL refuse to *generate* a size-3 board at Normal or at the top tier;
`validateParams` SHALL reject those combinations when asked for a full
(generation-capable) parameter set, while continuing to accept them otherwise so a
saved game or a game ID carrying its own description still loads. The refusal
message SHALL name those tiers from the game's tier list rather than spelling them
in prose, so it cannot survive a rename while the menu moves on.

A 3×3 grid has only four intersections, which is not enough structure to separate
those tiers from their neighbours: no board needing Normal, and none needing the
top tier, was found in 3,000 candidates each. Size 3 *Tricky* is unaffected, and
every tier at size 4 and above is reachable at ordinary cost.

#### Scenario: An unsupported size and tier are refused

- **WHEN** a full parameter set requesting size 3 at Normal or the top tier is
  validated
- **THEN** it is rejected with a message naming the size
- **AND** the message names those tiers exactly as the difficulty menu does
- **AND** the same parameters validate successfully when a description is supplied
