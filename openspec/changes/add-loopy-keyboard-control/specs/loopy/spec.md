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

The cursor SHALL be a **dot**, and an arrow key SHALL choose one of that dot's
incident edges: the edges are ranked by angular distance from the arrow's
direction, the first press chooses the nearest, and a repeat of the same arrow
advances to the next in that order, wrapping. The repeat is what makes coverage
provable rather than argued per tiling — plain angular-nearest strands an edge
on the triangular grid from *both* its endpoints, because six edges at 60°
against four arrows at 90° tie — so every edge SHALL be reachable from either
endpoint by pressing one arrow at most `degree` times, and that SHALL be proven
mechanically over every preset rather than assumed.

Enter and Space SHALL be the left and right pointer buttons on the chosen edge,
and the erase key the middle one; the keyboard has all three and needs no
three-state cycle, which remains a touch affordance. Drawing a line SHALL carry
the cursor along it to the far dot, one dot per press, so a loop is traced with
one Enter per edge, and the drawn edge SHALL stay chosen so the same key again
undraws it. A modified arrow (Shift) SHALL travel one dot in that direction
without touching the board. A pointer press SHALL hide the cursor; Escape SHALL
hide it too.

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

#### Scenario: Every edge is reachable within degree presses, on every preset

- **WHEN** the arrow rule is walked from every dot of every preset's grid
- **THEN** pressing one arrow `degree` times chooses each incident edge exactly
  once and the next press wraps, and no dot on any tiling has more than six
  edges

#### Scenario: Auto-follow applies to a keyboard selection

- **WHEN** the auto-follow preference is on and an edge is set from the keyboard
- **THEN** the forced path is extended exactly as it would be for a click on that
  edge, and the move produced is identical to the click's

#### Scenario: Drawing a line advances the cursor

- **WHEN** Enter sets the chosen edge to a line
- **THEN** the cursor moves to that edge's far dot with the edge still chosen,
  and a second Enter clears the edge without moving the cursor

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
