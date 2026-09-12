# loopy Specification

## Purpose
Loopy (Slitherlink), the puzzle of drawing one closed loop along grid edges so
that each numbered face has that many of its edges on the loop, on the square
grid and many other tilings. This capability specifies its port to the TS
engine, with the graded solver, recovery from a degenerate patch of an aperiodic
tiling, and full play from the keyboard alone.

## Requirements

### Requirement: Loopy game implements the Game interface

The engine SHALL provide `src/games/loopy/` implementing the `Game`
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

Two upstream behaviors SHALL be reproduced rather than corrected, because the
generator is solver-gated and correcting either changes which puzzles are
generated:

- the identical-lines face deduction SHALL report "no progress" even when it
  changes the board;
- the parity deduction SHALL preserve upstream's truncating-remainder arithmetic
  rather than normalizing it to a non-negative residue.

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

### Requirement: Loopy is playable from the keyboard alone

Loopy SHALL accept keyboard input that can select any edge and set it to any of
its three states, so that a player with no pointer can play a board to
completion. This holds for **every** tiling Loopy offers, including the aperiodic
ones.

The cursor SHALL be a **dot**. A plain arrow SHALL **walk** it one dot along
the edge that best continues in the arrow's direction — the nearest in angle,
and only within 90° of the arrow, so an arrow never moves the cursor against
itself — and the edge just walked SHALL become the chosen edge. Ties SHALL break
in opposite rotational senses for opposite arrows (Up and Right clockwise,
Down and Left counter-clockwise), which is what makes every edge of the
triangular grid walkable: an edge tied at one end is the mirror tie for the
opposite arrow at the other end, resolved the other way.

A walk can only choose the edge it walked, so a Shift+arrow SHALL **aim**
without moving: the first press chooses the dot's nearest edge in that
direction and a repeat of the same arrow the next one round, wrapping, so every
incident edge is reachable in at most `degree` presses. Coverage SHALL be
proven mechanically over every preset, in two halves: the walk alone SHALL
reach every edge of every preset except Penrose kite/dart, whose degree-5 dots
leave a small residue that no tie-break reaches, and walk plus aim SHALL reach
every edge of that one, with the residue pinned so it cannot grow.

Enter and Space SHALL be the left and right pointer buttons on the chosen edge,
and the erase key the middle one; the keyboard has all three and needs no
three-state cycle, which remains a touch affordance. A select SHALL NOT move
the cursor — it is already at the far end of the edge it walked — so a loop is
traced with one arrow and one Enter per edge, and walking back over a drawn
edge and pressing Enter undraws it. A pointer press SHALL hide the cursor;
Escape SHALL hide it too.

The keyboard SHALL reach an edge through the same code path a click uses, so that
the auto-follow preference — which extends a click along a forced path of edges —
applies identically to a keyboard selection. A parallel path would be a second
input model, and the two would drift.

The cursor SHALL be drawn from grid geometry rather than from a lattice, since
Loopy's renderer has no lattice to draw from on an irregular tiling: a disc
under the cursor's dot and a halo under its chosen edge, both in the
collection's cursor color, each painted *beneath* the mark it highlights so the
edge's own state stays legible.

The cursor SHALL be held under `ui.cursor`, the collection's one name for it,
in a Loopy-specific shape (dot, chosen edge, the arrow that chose it, visible)
rather than the engine's grid-cell shape: its position is a dot index, not a
cell, and an arrow press chooses an edge rather than moving the cursor. This is
the collection's first cursor that is not a cell, and the cross-game cursor
guard — which finds cursors structurally by the grid-cell shape — does not see
it; `loopy-keyboard.test.ts` guards it instead.

#### Scenario: A keyboard-only player completes a board

- **WHEN** a player uses only the keyboard, on any of Loopy's tilings
- **THEN** every edge is reachable, each can be set to line, cross or unknown,
  and the board can be brought to a solved state

#### Scenario: Every edge is walkable, or aimable where the walk cannot reach

- **WHEN** the walk rule is applied from every dot of every preset's grid
- **THEN** every edge of every preset except Penrose kite/dart is the edge some
  arrow walks from one of its endpoints, every dot is reachable by walking
  from the cursor's start, no walk moves against its arrow — and on Penrose
  kite/dart the unwalkable edges number at most nine and each is aimable from
  an endpoint, with `degree` aim presses of one arrow visiting each incident
  edge exactly once

#### Scenario: Auto-follow applies to a keyboard selection

- **WHEN** the auto-follow preference is on and an edge is set from the keyboard
- **THEN** the forced path is extended exactly as it would be for a click on that
  edge, and the move produced is identical to the click's

#### Scenario: Enter marks the edge behind you and stays put

- **WHEN** an arrow walks the cursor along an edge and Enter is pressed
- **THEN** that edge becomes a line and the cursor stays on the dot it reached,
  and walking back over the edge and pressing Enter again clears it

#### Scenario: Loopy leaves the keyboard-exemption list

- **WHEN** the collection-wide keyboard-reachability guard runs
- **THEN** Loopy is not on the exemption list, and a keyboard-only sequence
  changes its board

### Requirement: Loopy pointer and keyboard input, and rendering

Loopy SHALL be played with mouse, stylus, touch or keyboard. A pointer reaches
an edge by nearest-edge hit testing; the keyboard reaches one through the
cursor described in "Loopy is playable from the keyboard alone"; both then set
it through the same code. A click SHALL set an edge to an absolute state rather
than toggling relative to an unknown one, so that replaying a move is
idempotent.

With a mouse, each button SHALL cycle between its own line state and unknown.
With a stylus, each button SHALL cycle through all three states, so that a single
tap can reach every state without a second button.

Loopy SHALL provide an auto-follow preference (off / grid-only / grid-and-state)
which extends a click along a forced path of edges, and a preference for drawing
excluded lines faintly.

Rendering SHALL draw edges in a fixed color order so that mistaken edges paint
over all others, SHALL place clue text at each face's incenter, SHALL highlight
the edges of every closed loop but the largest when more than one exists, and
SHALL flash on completion. Clue text positions depend on tile size and SHALL be
recomputed when it changes.

#### Scenario: A click sets the edge nearest the pointer

- **WHEN** the board is clicked near an edge
- **THEN** that edge changes to the state the button and its current state
  determine

#### Scenario: A keyboard select sets the chosen edge

- **WHEN** Enter, Space or the erase key is pressed with an edge chosen
- **THEN** that edge changes exactly as a left, right or middle click on it would

#### Scenario: Completing a single loop wins

- **WHEN** the drawn lines form exactly one closed loop with no stray paths and
  every clue is satisfied
- **THEN** the game is reported solved and flashes

#### Scenario: Clue positions survive a resize

- **WHEN** the drawing surface is resized after the board has been drawn
- **THEN** clue text is drawn at the correct position for the new tile size
