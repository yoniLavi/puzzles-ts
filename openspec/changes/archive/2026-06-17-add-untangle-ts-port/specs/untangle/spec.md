## ADDED Requirements

### Requirement: Untangle game implements the Game interface

The engine SHALL provide a registered `untangle` game implementing
`Game<UntangleParams, UntangleState, UntangleMove, UntangleUi, UntangleDrawState>`:
a planar graph of `n` vertices joined by edges, drawn tangled, solved when the
player has dragged the vertices so that no two edges cross. Params SHALL be
`{ n }` (vertex count), encoded as the integer; the five upstream presets (6, 10,
15, 20, 25) SHALL be offered with default `n = 10`. `validateParams` SHALL reject
`n < 4` and an unreasonably large `n`. The game SHALL report `wantsStatusbar`
faithfully to upstream, `isTimed = false`, `canSolve = true`, and
`canFormatAsText = false` (the upstream text format exists only in the excluded
editor build). It SHALL NOT provide a `hint` hook (no deductive solver exists) and
SHALL NOT provide a `findMistakes` hook (crossed edges are the built-in mistake
feedback).

#### Scenario: Params round-trip

- **WHEN** params `{ n: 10 }` are encoded and decoded
- **THEN** the round-trip yields `{ n: 10 }`, and the five presets (6/10/15/20/25)
  are offered

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` receives `{ n: 3 }` (too few) or an unreasonably large
  `n`
- **THEN** it returns a non-null reason

### Requirement: Generation yields a planar graph drawn tangled

`newDesc` SHALL build a graph that is planar by construction — points scattered on
a grid, edges added greedily lowest-degree-vertex-first and accepted only when they
cross no existing point and no existing edge, with every vertex degree capped at 4 —
then lay the vertices on a circle in a shuffled order **re-rolled until at least one
non-adjacent edge pair crosses**, so the puzzle never starts solved. The desc SHALL
encode the **edges only** (sorted zero-based `a-b` pairs, `a < b`), carrying no
vertex coordinates. The solved layout SHALL be returned as the optional `aux`.

#### Scenario: A generated board is planar, degree-capped, and starts tangled

- **WHEN** a new game is created from any preset
- **THEN** the graph has a crossing-free embedding (it was built planar), every
  vertex has degree ≤ 4, and the initial circle layout has at least one pair of
  crossing edges (not already solved)
- **AND** generation terminates for every preset

#### Scenario: The desc encodes edges only

- **WHEN** a generated desc is decoded
- **THEN** it yields the edge set with no coordinate information, and `validateDesc`
  accepts every `a-b` with `0 ≤ a, b < n` and `a ≠ b` and rejects out-of-range or
  self-loop pairs

### Requirement: Crossing detection is exact and drives solved status

The game SHALL determine whether two edges cross using an exact integer
segment-intersection test over the rational vertex coordinates (no floating-point
epsilon), treating collinear overlap and an endpoint lying on the other segment as
crossings, and considering only **non-adjacent** edge pairs (edges sharing a vertex
do not count). `status` SHALL report `"solved"` exactly when no edge pair crosses.
The crossing set SHALL be recomputed on every state transition and exposed to
`redraw` so crossed edges can be highlighted.

#### Scenario: A board with no crossings is solved

- **WHEN** the vertices are positioned so that no two non-adjacent edges cross
- **THEN** `status` returns `"solved"`

#### Scenario: Adjacent edges meeting at a vertex are not a crossing

- **WHEN** two edges share an endpoint
- **THEN** they are never counted as crossing each other

### Requirement: Vertices are dragged by pointer or keyboard

`interpretMove` SHALL let the player move one vertex at a time: a pointer press near
a vertex begins a drag, motion previews the vertex following the pointer
(`UI_UPDATE`, no history entry), and release commits a move placing that vertex at
its position. The drag target SHALL be **clamped to the playable area** (the vertex
blob kept inside the play-area border): dragging past the edge previews the vertex
pinned at the nearest in-bounds position and a release commits it there. (This is a
deliberate divergence from upstream's drag-off-to-cancel affordance — the owner
chose clamp-and-commit. It also subsumes integer rounding of fractional pointer
input.) Keyboard control SHALL select the nearest vertex in the pressed direction,
begin/end a drag with the select key, nudge a held vertex with the arrows, and cycle
the selection. `executeMove` SHALL apply the placement(s), recompute crossings, and
throw on a malformed move (including a non-integer coordinate — the `RationalPoint`
integer invariant the exact crossing test depends on). The move SHALL be
structured-clone-safe (default serialise/deserialise). The editor-only edge
add/delete moves SHALL NOT be mapped.

#### Scenario: A drag moves one vertex and updates crossings

- **WHEN** the player drags a vertex to a new position and releases in-bounds
- **THEN** a move is committed that repositions only that vertex, the crossing set
  is recomputed, and the displayed crossed-edge highlighting updates

#### Scenario: A drag released outside the play area clamps and commits

- **WHEN** the player drags a vertex past the play-area edge and releases
- **THEN** the vertex is committed at the nearest position inside the play-area
  border (it does not reset to its prior position)

#### Scenario: A saved game reloads to the same layout via the move log

- **WHEN** a game with dragged vertices is serialised and reloaded
- **THEN** the reconstructed positions exactly match (the layout is restored by
  replaying the move log — Untangle requires no `supersede_desc` mechanism)

### Requirement: Solve untangles via the recorded solution layout

When `aux` (the solved layout) is available, `solve` SHALL return a single move
repositioning every vertex to a crossing-free embedding, choosing among the eight
dihedral symmetries of the solved layout the one closest to the current positions
(shortest solve animation). When `aux` is unavailable (a loaded game), `solve` SHALL
report that the solution is not known. The solve SHALL animate and SHALL be marked
as solved-with-help.

#### Scenario: Solve from a fresh game lands crossing-free

- **WHEN** the player invokes Solve on a freshly generated game
- **THEN** every vertex moves to a position where no edges cross, the move is marked
  solved-with-help, and it animates

#### Scenario: Solve is unavailable on a loaded game

- **WHEN** the player invokes Solve on a game restored from a save (no `aux`)
- **THEN** the game reports that the solution is not known

### Requirement: Rendering frames the play area and colours roles distinctly

`redraw` SHALL draw a visible border around the playable area so the drop zone is
unambiguous (distinguishing it from any surrounding dead space). It SHALL draw edges
as lines — **red** for an edge involved in a crossing (when the show-crossed-edges
preference is on), black otherwise — and vertices as blobs (or index numbers, per
the vertex-style preference) in a fixed z-order so the dragged vertex sits on top.
The colours SHALL keep the "danger" colour (red) reserved for crossings: a vertex
adjacent to the one being dragged SHALL be highlighted in a distinct **non-red**
colour (light blue), the dragged vertex white, and the keyboard-cursor vertex grey.

#### Scenario: Crossed edges and dragged-vertex neighbours are visually distinct

- **WHEN** the player drags a vertex that has neighbours while crossings exist
- **THEN** crossed edges render red, the dragged vertex renders white, and its
  neighbour vertices render light blue (not red), so neighbours are not mistaken
  for a crossing/error indication
