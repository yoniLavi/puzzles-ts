# loopy Specification Delta — add-loopy-keyboard-control

`ADDED` rather than `MODIFIED` on purpose. `audit-input-mode-parity` archives
first and rewrites "Loopy input and rendering" to record the absence as an open
defect, so a `MODIFIED` block written now would be faithful to text that is about
to change — the one hazard the tool cannot see (`AGENTS.md`, "a delta can be
faithful to the wrong original"). When this change is implemented, re-read the
live requirement, then decide whether to fold this in or leave it standing
alongside.

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
