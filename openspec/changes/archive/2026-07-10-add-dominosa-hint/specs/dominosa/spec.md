# dominosa Specification

## ADDED Requirements

### Requirement: Dominosa provides an explained deductive hint

The `dominosa` game SHALL implement `Game.hint(state)`, returning a narrated
plan computed from the player's current board by running the ported deductive
solver one firing at a time (seeded from the placed dominoes). Each step SHALL
carry a forced move and an explanation of *why* it is forced (the Palisade
quality bar):

- a **placement** step when a domino has exactly one remaining spot (the move
  places that domino), or when a square can pair with only one domino;
- a **barrier** step when a deductive technique proves a spot cannot hold a
  domino (the move draws that barrier edge), narrated by the technique
  (duplicate-forcing, must-overlap, odd-region parity, set analysis, forcing
  chain). Barriers ruled out by one firing SHALL group into one
  `continuesPrevious` journey, and a barrier the player has already drawn SHALL
  be skipped for display while still advancing the deduction.

`hint()` SHALL refuse (`{ ok: false, error }`, lighting the `findMistakes`
overlay) when the board is already solved, contains a mistake, or is an
Ambiguous (not uniquely solvable) board with no forced deduction to teach. The
recorder SHALL be gated so the generator's `runSolver` path — and thus the
byte-match differential — is unchanged.

#### Scenario: A hint refuses on a solved board

- **WHEN** `hint` is called on a completed board
- **THEN** it returns `{ ok: false }` with a non-empty message

#### Scenario: A placement hint names the forced domino and explains why

- **WHEN** a domino has exactly one remaining spot on the current board
- **THEN** the next hint step's move places that domino and its explanation
  states, in the necessity voice, that it is the only spot left

#### Scenario: The plan solves the board from any mid-game position

- **WHEN** a non-mistaken, non-Ambiguous board is advanced by applying one
  freshly-recomputed hint step at a time
- **THEN** every step makes progress and the board reaches solved

### Requirement: Dominosa renders the hint distinctly

The renderer SHALL draw the current hint step's forced cells (a placement's two
squares, or a barrier's two squares and its edge) in `COL_HINT`, and the
deduction's evidence squares in `COL_HINT_CELL`, with the hint-overlay palette
entries appended past the upstream colour enum and every hint bit included in
the render diff key so the overlay paints and clears correctly.

#### Scenario: A placement hint highlights the target domino cells

- **WHEN** a placement hint step is displayed
- **THEN** the two cells of the forced domino render in `COL_HINT`
</content>
