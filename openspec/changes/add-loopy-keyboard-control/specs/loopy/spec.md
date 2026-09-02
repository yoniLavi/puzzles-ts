# loopy Specification Delta — add-loopy-keyboard-control

Three deltas. The first **ADDED** requirement is the control scheme. The
**REMOVED** one is the existing input requirement, which recorded the keyboard's
absence as an open defect pointing at this change — its "mouse, stylus or touch
only" opening and its "cannot yet play" scenario describe a state that no longer
holds, and `openspec` (correctly) refuses a MODIFIED delta that drops a scenario,
so the requirement is retired and re-founded under a new name as the second
**ADDED** one, with every surviving sentence and scenario reproduced unchanged.
(The sentence being retired was grepped in the live spec and lives in "Loopy
input and rendering" — `AGENTS.md`, "a delta can be faithful to the wrong
original".)

## ADDED Requirements

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
collection's cursor colour, each painted *beneath* the mark it highlights so the
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

Rendering SHALL draw edges in a fixed colour order so that mistaken edges paint
over all others, SHALL place clue text at each face's incentre, SHALL highlight
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

## REMOVED Requirements

### Requirement: Loopy input and rendering

**Reason**: It recorded the keyboard's absence as an open defect — "Loopy SHALL
be played with mouse, stylus or touch only", a paragraph naming this change as
the fix, and the scenario "A keyboard-only player cannot yet play" — and that
state no longer holds. A MODIFIED delta cannot drop a scenario, so the
requirement is retired whole.
**Migration**: Every surviving sentence and scenario (absolute-set moves, the
mouse and stylus cycles, the auto-follow and faint-line preferences, the
rendering rules, and the three scenarios that still hold) is reproduced
unchanged in "Loopy pointer and keyboard input, and rendering" in this change;
the keyboard itself is specified in "Loopy is playable from the keyboard alone".
