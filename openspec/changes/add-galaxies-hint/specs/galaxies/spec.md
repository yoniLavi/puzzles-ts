## ADDED Requirements

### Requirement: Galaxies offers a deduction-based hint in association vocabulary

Galaxies SHALL implement the engine's `hint()` hook as a recorded
projection of its own solver: the same difficulty-graded deduction chain
that generates and solves boards runs with a recorder, and each recorded
firing becomes one narrated hint journey meeting the collection's hint
quality bar (explain *why* the association is forced — the blocked
symmetric partner, the only dot whose symmetry can reach the tile —
never merely *what* to do).

A step's action SHALL be a move the game already has: the committed
association, or the wall that a settled pair of neighbours forces. A
firing that claims a cell SHALL claim its 180° partner in the **same
step** — the game commits the pair atomically, so a separate leg for the
partner would be a move that changes nothing — and the narration SHALL
state the symmetry as the reason they travel together. Because
associations alone never complete a board (only walls do), the plan
SHALL carry the deduction through to the walls it justifies, and SHALL
reach a solved board from any position it is asked from.

Evidence SHALL be highlighted as an area in the hint colour legend, dots
SHALL be named by properties the player can see, rule-outs SHALL be
shown as evidence highlights rather than demanded of the player, and
equivalent moves SHALL share a colour. The hint's action colour SHALL be
distinct from the association drag's, which marks the same objects — a
dot and a cell — while the player follows a hint.

The hint SHALL couple to mistake checking: a request on a board with any
flagged mistake (tile or wall) refuses with the banner and lights the
mistakes instead. A stored plan SHALL survive the player working ahead:
a step whose tile the player has meanwhile associated is refreshed away
and the plan advances. On a board whose next deduction requires the
Unreasonable recursion, the hint SHALL narrate honestly what the proof
tries and where it contradicts — it SHALL NOT fabricate a local reason
and SHALL NOT decline to hint. Galaxies SHALL be enrolled in the
cross-game hint guards (`testing/hint-games.ts`).

#### Scenario: A forced association is taught as one step

- **WHEN** the player requests a hint on a board where a deduction forces
  a tile's dot
- **THEN** one step is shown whose narration states the forcing reason
  and whose single move associates both the tile and its 180° partner
- **AND** the evidence area and the action are drawn in the hint legend's
  two colours, neither of them the drag preview's

#### Scenario: The plan finishes the board, not just the notation

- **WHEN** hints are followed one at a time from a fresh board
- **THEN** the plan draws the walls its associations justify and reaches a
  solved board

#### Scenario: Refusal on a mistaken board

- **WHEN** a hint is requested while any tile or wall contradicts the
  unique solution
- **THEN** the hint refuses with the banner and the mistake overlay
  lights the offenders

#### Scenario: The plan survives the player committing ahead

- **WHEN** a hint journey is displayed and the player directly commits
  the association it was leading to
- **THEN** the resolved step is dropped without being shown as stale and
  the plan advances (recomputing only if it drains)

#### Scenario: An Unreasonable board is narrated honestly

- **WHEN** the next deduction exists only through the recursion rung
- **THEN** the hint narrates the tried association and the contradiction
  it reaches, highlighting the tried cell — no fabricated local reason,
  no refusal
