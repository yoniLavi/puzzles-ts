# loopy Specification Delta — audit-input-mode-parity

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

It is not merely an unbound key. Loopy's input is per-**edge** across eighteen
tilings, several of them aperiodic, so "move the cursor to the next edge" has no
canonical meaning and needs an interaction designed. That design is scoped by
`add-loopy-keyboard-control`; until it lands, Loopy carries its reason on
`input-parity.test.ts`'s exemption list, and the help page says how the game *is*
played.

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
