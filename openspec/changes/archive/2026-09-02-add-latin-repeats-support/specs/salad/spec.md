# salad Specification Delta — add-latin-repeats-support

## ADDED Requirements

### Requirement: Salad reasons about the empty square directly

Salad's solver SHALL express the empty square as a shared-cube symbol carrying a
per-line multiplicity, rather than translating between holes and candidates at
the game's edge. The translation layer that stood in for that support SHALL be
removed.

The empty-square deductions SHALL be the shared cube's own — positional
elimination with the symbol's multiplicity, the line strike once a line holds
all its empties, multiplicity-aware set elimination — rather than a hand-written
sync-and-count layer, and the Number Ball quality gate SHALL ask its question
("do the holes fall out with no number entered?") of that cube.

The rewrite SHALL be deductively equivalent to upstream's translation layer on
every board the frozen C reference records, and the byte-match differential
SHALL be **kept** as the proof: because generation is solver-gated at every clue
removal, a description that still matches byte for byte means the solver's
verdict on every intermediate board is unchanged. (The plan was to retire the
differential and re-found assurance on properties; the finding was that the
oracle survives, and a surviving oracle is stronger than any property written
to replace it.)

#### Scenario: The empty square is reasoned about directly

- **WHEN** the solver deduces a placement that turns on where empty squares can
  and cannot go
- **THEN** that deduction is expressed over the shared cube's repeatable symbol,
  with no translation step at the game boundary

#### Scenario: A generated board is uniquely solvable at its stated tier

- **WHEN** a board is generated at any tier
- **THEN** the solver finds exactly one solution, and finds it at that tier and
  not at the tier below

#### Scenario: The frozen C descriptions still match byte for byte

- **WHEN** the byte-match differential replays every frozen C fixture against
  upstream's loose tier gate
- **THEN** every description is reproduced exactly, and the recorded solver
  verdicts hold

## MODIFIED Requirements

### Requirement: Salad ports the solver as a shared Latin-square consumer

Salad SHALL provide a solver built on the shared `engine/latin.ts` framework, adding
its own deduction — in ABC End View mode — the border-clue deduction. The "some
squares empty" rule SHALL be realised by declaring the empty square to the shared
cube as its repeated symbol (`nums + 1`, appearing `order − nums` times per line),
so that the cube's own positional, numeric and set eliminations reason about
empty squares directly; a cross SHALL be that symbol placed and a ball that symbol
struck, and the board's marker array SHALL be read back off the solved cube.

The solver SHALL provide two difficulties, Normal and Extreme, and both SHALL be
solvable by pure deduction without guessing. The generator SHALL use the solver to
keep every board uniquely solvable: it SHALL generate a full Latin square, then
remove clues in a randomised order, keeping a removal only while the puzzle stays
uniquely solvable at the target difficulty. Generation from a given seed SHALL be
reproducible.

#### Scenario: The solver deduces the unique solution without guessing

- **WHEN** a generated board is solved at its difficulty
- **THEN** the solver reaches the unique completion using only its deductive
  techniques, never backtracking search

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description
