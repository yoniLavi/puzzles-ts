## ADDED Requirements

### Requirement: Galaxies offers a deduction-based hint in mark vocabulary

Galaxies SHALL implement the engine's `hint()` hook as a recorded projection
of its own solver: the same difficulty-graded deduction chain that generates
and solves boards runs with a recorder, and each recorded firing becomes one
narrated hint journey meeting the collection's hint quality bar (explain
*why* the association is forced — the blocked symmetric partner, the only
dot whose symmetry can reach the tile — never merely *what* to do).

A journey's first step SHALL emit the tile's association **pencil mark**
(the deduction recorded in pencil, as a careful player would); the moves the
same firing forces outright (the committed association, its 180° partner,
implied edges) SHALL follow as `continuesPrevious` legs of that one journey.
Evidence SHALL be highlighted as an area in the hint colour legend, dots
SHALL be named by properties the player can see, and equivalent moves SHALL
share a colour.

The hint SHALL couple to mistake checking: a request on a board with any
flagged mistake (tile, wall, or mark) refuses with the banner and lights the
mistakes instead. A stored plan SHALL survive the player working ahead: a
step whose tile the player has meanwhile associated is refreshed away and
the plan advances. On a board whose next deduction requires the
Unreasonable recursion, the hint SHALL narrate honestly what the proof
tries and where it contradicts — it SHALL NOT fabricate a local reason and
SHALL NOT decline to hint. Galaxies SHALL be enrolled in the cross-game
hint guards (`testing/hint-games.ts`).

#### Scenario: A forced association is taught, pencil first

- **WHEN** the player requests a hint on a board where a deduction forces a
  tile's dot
- **THEN** one journey is shown whose narration states the forcing reason,
  whose first step marks the tile in pencil, and whose continuation legs
  commit the association and its symmetric partner
- **AND** the evidence area and the action share the hint legend's colours

#### Scenario: Refusal on a mistaken board

- **WHEN** a hint is requested while any tile, wall, or mark contradicts
  the unique solution
- **THEN** the hint refuses with the banner and the mistake overlay lights
  the offenders

#### Scenario: The plan survives the player committing ahead

- **WHEN** a hint journey is displayed and the player directly commits the
  association it was leading to
- **THEN** the resolved step is dropped without being shown as stale and
  the plan advances (recomputing only if it drains)

#### Scenario: An Unreasonable board is narrated honestly

- **WHEN** the next deduction exists only through the recursion rung
- **THEN** the hint narrates the tried association and the contradiction it
  reaches, marking the tried cell — no fabricated local reason, no refusal
