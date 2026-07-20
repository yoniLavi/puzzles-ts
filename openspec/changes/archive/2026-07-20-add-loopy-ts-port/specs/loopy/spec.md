# loopy Specification Delta — add-loopy-ts-port

## ADDED Requirements

### Requirement: Loopy game implements the Game interface

The engine SHALL provide `src/native/games/loopy/` implementing the `Game`
interface for Loopy, registered so the puzzle is served by the TypeScript
engine.

Loopy SHALL support all **18** grid types over its own grid ordering, which is
distinct from `grid.ts`'s `GRIDGEN_LIST` ordering and is **frozen into saved
game IDs**. Both orderings SHALL survive, with an explicit mapping between them;
entries MAY be appended to Loopy's ordering but SHALL NOT be reordered or
inserted, because the index is the wire format.

Per-grid-type **minimum** sizes (both dimensions at least `amin`; at least one
dimension at least `omin`) SHALL be enforced by Loopy, not by the geometry
layer, which deliberately implements only maximum-size guards.

Loopy SHALL declare that it uses the stylus modifier, because its input handling
genuinely distinguishes stylus from mouse (see the input requirement).

#### Scenario: Every grid type produces a playable board

- **WHEN** a new game is generated for any of the 18 grid types at a legal size
  and any difficulty
- **THEN** a board is produced whose clues admit exactly one solution at that
  difficulty

#### Scenario: A game ID round-trips through Loopy's own grid ordering

- **WHEN** a game ID naming a grid type is encoded and decoded
- **THEN** the same grid type is selected, by Loopy's ordering rather than the
  geometry module's

### Requirement: Loopy descriptions use the upstream run-length encoding

A Loopy description SHALL encode one entry per face in face order: a clue as a
digit `0`–`9` or a letter `A`–`Z` for values 10 and above, and a run of 1–26
unclued faces as a single letter `a`–`z`. Runs longer than 26 SHALL be split.
Where the grid type carries its own description, the game description SHALL be
the grid description, a separator, and the clue string.

Validation SHALL reject a description whose entry count does not equal the
grid's face count, distinguishing "too short" from "too long", and SHALL reject
unknown characters. Validation SHALL NOT be required to detect a description
that is syntactically valid but geometrically impossible or unsolvable.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded
- **THEN** the resulting clues are identical, and re-encoding yields the same
  description

#### Scenario: A description of the wrong length is rejected

- **WHEN** a description carrying more or fewer entries than the grid has faces
  is validated
- **THEN** it is rejected with a message distinguishing which

### Requirement: Loopy ports the graded solver faithfully

Loopy SHALL provide a solver with four difficulty tiers — Easy, Normal, Tricky,
Hard — implemented as deduction rungs run to a fixpoint. The solver SHALL NOT
backtrack or guess at any tier; Tricky SHALL NOT be a separate rung but SHALL
unlock additional inferences within the dline rung.

The dline machinery SHALL index a pair of edges adjacent around a common dot
consistently whether that pair is reached from the dot or from the face, and
this consistency SHALL be verified for every grid type, because a mismatch
weakens the solver silently rather than failing.

Two upstream behaviours SHALL be reproduced rather than corrected, because the
generator is solver-gated and correcting either changes which puzzles are
generated:

- the identical-lines face deduction SHALL report "no progress" even when it
  changes the board;
- the parity deduction SHALL preserve upstream's truncating-remainder arithmetic
  rather than normalising it to a non-negative residue.

Both SHALL carry comments recording why they are not defects to be fixed.

#### Scenario: The solver grades a board at the intended difficulty

- **WHEN** a board generated at a given difficulty is solved
- **THEN** it is solvable at that difficulty and not at the tier below

#### Scenario: The dline index is consistent from both directions

- **WHEN** a dline is addressed via its dot and via its face, for any face and
  corner of any grid type
- **THEN** both address the same pair of edges

### Requirement: Loopy generation recovers from a degenerate grid patch

Loopy SHALL recover from a degenerate grid patch: where building a grid from a
generated description fails because the patch contains no landlocked dots, it
SHALL discard that description, generate a fresh one, and retry, within a
bounded number of attempts. It SHALL NOT raise the per-type minimum sizes to
avoid the condition, because the condition depends on the random draw rather
than on the size.

Retrying SHALL be deterministic, so that a given seed always produces the same
board and shared game IDs remain reproducible. Exhausting the bound SHALL raise
an error rather than return a fallback board.

#### Scenario: A degenerate patch yields a playable board rather than an error

- **WHEN** a grid type, size and seed that produce a degenerate patch on the
  first attempt are used to generate a game
- **THEN** a valid board is produced

#### Scenario: Generation remains reproducible across retries

- **WHEN** the same seed is used twice for a case that requires a retry
- **THEN** both runs produce the same board

### Requirement: Loopy input and rendering

Loopy SHALL be played with mouse or stylus clicks only — it has no keyboard
input and no drag — so nearest-edge hit testing is the entire input path. A
click SHALL set an edge to an absolute state rather than toggling relative to an
unknown one, so that replaying a move is idempotent.

With a mouse, each button SHALL cycle between its own line state and unknown.
With a stylus, each button SHALL cycle through all three states, so that a single
tap can reach every state without a second button.

Loopy SHALL provide an auto-follow preference (off / grid-only / grid-and-state)
which extends a click along a forced path of edges, and a preference for drawing
excluded lines faintly.

Rendering SHALL draw edges in a fixed colour order so that mistaken edges paint
over all others, SHALL place clue text at each face's incentre, SHALL highlight
the edges of every closed loop but the largest when more than one exists, and
SHALL flash on completion. Clue text positions depend on tile size and SHALL be
recomputed when it changes.

#### Scenario: A click sets the edge nearest the pointer

- **WHEN** the board is clicked near an edge
- **THEN** that edge changes to the state the button and its current state
  determine

#### Scenario: Completing a single loop wins

- **WHEN** the drawn lines form exactly one closed loop with no stray paths and
  every clue is satisfied
- **THEN** the game is reported solved and flashes

#### Scenario: Clue positions survive a resize

- **WHEN** the drawing surface is resized after the board has been drawn
- **THEN** clue text is drawn at the correct position for the new tile size
