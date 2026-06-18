# Untangle spec delta

## ADDED Requirements

### Requirement: Untangle provides a move hint with animation

The `untangle` game SHALL implement `hint(state, aux?)` returning a plan-carrying
hint that suggests vertex moves. Untangle is not a deductive puzzle, so — by
explicit, owner-approved divergence from the Palisade hint quality bar — these
hints carry **no explanatory narration** (an empty `explanation`); the visual
highlight and the resulting move animation are the entire hint. `hint` SHALL refuse
(a `{ ok: false }` result) when the board is already solved.

When the generator's solution is available (`aux` present), `hint` SHALL derive its
plan from that known solution: it SHALL take the dihedral-symmetry image of the
solution closest to the current positions, **rescale it with a uniform scale to
fill the play box** (preserving planarity, so the result is both crossing-free and
well-spaced rather than clustered toward the centre), and emit a plan that places
vertices one at a time, choosing at each step the still-unplaced vertex whose move
to its solved position yields the fewest resulting crossings. Applying the whole
plan SHALL leave the board untangled.

When no solution is available (`aux` absent), `hint` SHALL fall back to a local
heuristic: from the current positions, repeatedly select — among the vertices on a
currently-crossed edge — the single vertex move that strictly reduces the number of
edge-crossing pairs, offering each candidate the centroid of its graph-neighbours
plus outward-pushed variants and preferring, among equally-untangling targets, the
one that most reduces a pairwise clustering score so the layout spreads rather than
collapsing to the centre. The fallback SHALL refuse when no single move reduces the
crossings.

Each returned `HintStep` SHALL carry a legal `executeMove` move and a highlight
identifying the vertex and its suggested destination. `redraw` SHALL render the
displayed step by drawing a hint-coloured line from the hinted vertex to its
suggested destination and a hint-coloured marker at the destination. Because
Untangle already animates vertex moves and the midend stretches a hint-executed
move to the uniform hint-step duration, executing a hint step SHALL animate the
vertex sliding to its destination; auto-hint SHALL thus progressively untangle the
board.

#### Scenario: Hint walks a generated board to a crossing-free, spacious layout

- **WHEN** `hint` is called with the generator's `aux` on an unsolved board
- **THEN** it returns `{ ok: true }` with a non-empty list of steps
- **AND** each step's move is a legal `executeMove`
- **AND** applying every step in order leaves the board with no crossings and the
  vertices spread across most of the play box (not clustered in the centre)

#### Scenario: Hint falls back to the heuristic without a solution

- **WHEN** `hint` is called with no `aux` on an unsolved board that has a
  crossing-reducing single-vertex move
- **THEN** it returns `{ ok: true }` and applying the steps never increases, and
  at least once decreases, the number of crossings

#### Scenario: Hint refuses on a solved board

- **WHEN** `hint` is called on a board with no crossings
- **THEN** it returns `{ ok: false }` with a message

#### Scenario: Displayed hint is rendered

- **WHEN** a hint step is on display
- **THEN** `redraw` draws a hint-coloured line to, and a hint-coloured marker at,
  the suggested destination of the hinted vertex
