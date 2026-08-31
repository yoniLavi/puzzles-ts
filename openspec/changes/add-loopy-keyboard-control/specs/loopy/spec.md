# loopy Specification Delta — add-loopy-keyboard-control

Two deltas. The **ADDED** requirement is the control scheme this change will
build. The **MODIFIED** one corrects a *reason* in the existing requirement that
turned out to be wrong — and it is written now, rather than deferred, because
`audit-input-mode-parity` has archived, so the live text is stable and this
block is faithful to the original actually in the spec (`AGENTS.md`, "a delta can
be faithful to the wrong original"; the sentence lives in "Loopy input and
rendering", grepped and confirmed).

## ADDED Requirements

### Requirement: Loopy is playable from the keyboard alone

Loopy SHALL accept keyboard input that can select any edge and set it to any of
its three states, so that a player with no pointer can play a board to
completion. This holds for **every** tiling Loopy offers, including the aperiodic
ones.

The keyboard SHALL reach an edge through the same code path a click uses, so that
the auto-follow preference — which extends a click along a forced path of edges —
applies identically to a keyboard selection. A parallel path would be a second
input model, and the two would drift.

The cursor SHALL be drawn from grid geometry rather than from a lattice, since
Loopy's renderer has no lattice to draw from on an irregular tiling.

#### Scenario: A keyboard-only player completes a board

- **WHEN** a player uses only the keyboard, on any of Loopy's tilings
- **THEN** every edge is reachable, each can be set to line, cross or unknown,
  and the board can be brought to a solved state

#### Scenario: Auto-follow applies to a keyboard selection

- **WHEN** the auto-follow preference is on and an edge is set from the keyboard
- **THEN** the forced path is extended exactly as it would be for a click on that
  edge

#### Scenario: Loopy leaves the keyboard-exemption list

- **WHEN** the collection-wide keyboard-reachability guard runs
- **THEN** Loopy is not on the exemption list, and a keyboard-only sequence
  changes its board

## MODIFIED Requirements

### Requirement: Loopy input and rendering

Loopy SHALL be played with mouse, stylus or touch only — nearest-edge hit
testing is the entire input path. A click SHALL set an edge to an absolute state
rather than toggling relative to an unknown one, so that replaying a move is
idempotent.

**Loopy has no keyboard, and that is an open defect rather than a design.** The
collection-wide bar is that every input is reachable in every mode
(`audit-input-mode-parity`), and Loopy is the one game of fifty-seven that fails
it: it responds to no cursor key, no select, and no erase or cancel key, so a
player with no pointer cannot make a single move. It is recorded as a defect and
not an exemption because nobody chose it — the port inherited the absence from
upstream, whose `loopy.c` contains no `CURSOR_` reference at all.

It is not merely an unbound key: Loopy's input is per-**edge**, so an edge has
no row and no column to arrow between, and the number of edges meeting at a
vertex is not fixed. That needs an interaction designed, and the design is in
`add-loopy-keyboard-control`. Until it lands, Loopy carries its reason on
`input-parity.test.ts`'s exemption list, and the help page says how the game *is*
played.

*This paragraph previously named the **aperiodic** tilings as the difficulty.
Measuring dot degree across all 23 presets showed that to be exactly backwards:
around three quarters of the vertices on Hats and Spectres have degree 2, which
is the most forgiving case there is, while the **triangular** grid puts six edges
at one vertex against four arrow keys. A reason nobody measured sent the
difficulty to the wrong tiling — and it is the tiling an implementer would then
under-test.*

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

#### Scenario: A keyboard-only player cannot yet play

- **WHEN** any cursor, select or erase key is delivered to Loopy
- **THEN** nothing happens, and Loopy is on the keyboard-reachability exemption
  list with this reason recorded rather than passing unnoticed

#### Scenario: Completing a single loop wins

- **WHEN** the drawn lines form exactly one closed loop with no stray paths and
  every clue is satisfied
- **THEN** the game is reported solved and flashes

#### Scenario: Clue positions survive a resize

- **WHEN** the drawing surface is resized after the board has been drawn
- **THEN** clue text is drawn at the correct position for the new tile size
