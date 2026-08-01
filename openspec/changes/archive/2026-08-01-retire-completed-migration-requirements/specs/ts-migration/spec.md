# ts-migration Specification Delta — retire-completed-migration-requirements

## REMOVED Requirements

### Requirement: Per-game hybrid; C deleted per game

**Reason**: The per-game hybrid was the migration's *mechanism*: each game served
either by its C/WASM implementation or its TS port, independently, with the empty
registry as the fallback and the CMake `TS_PORTED` marker as the catalog seam. It
reached its terminal state when the last game shipped, and `retire-c-engine`
removed every part it names — the C, the wasm build, `TS_PORTED`, and the
fallback branch in the worker. Its scenarios ("the game continues to run on
C/WASM", "its C source is NOT deleted") cannot fire again.

**Migration**: The mechanism is retired; the **bar it enforced is not**, and is
restated below as a requirement in its own right. That separation is the point of
this delta — the bar was the durable part, and was only ever expressed in terms
of the C fallback by accident of when it was written.

## ADDED Requirements

### Requirement: Game work is accepted by exercising it, not by a green suite

Acceptance of work on a game SHALL require the owner to exercise the actual
behaviour — rendering, animation, and input, not merely internal state
transitions. This covers a new game, a rendering or input change, an animation,
and a hint. A passing automated suite alone SHALL NOT be treated as done.

This is the durable half of the retired "per-game hybrid" requirement, stated
separately because it is a rule about **verification**, not about the C build it
was originally written around. It was bought expensively: Flip's port shipped
with a fully green suite and did not render at all, then took three further
iterations on the rendering pipeline, each surfacing a distinct real defect. A
suite that asserts only state transitions is entirely compatible with a game that
draws nothing.

A shortfall found this way SHALL NOT be dismissed as "cosmetic" or "out of
scope", nor deferred without explicit owner agreement. Under the hybrid this was
enforceable by withholding registration, with the C still there to serve the
game. There is no such fallback now, which makes the discipline more important
rather than less — this bar is the only thing between a broken game and a player.

#### Scenario: A green suite is not sufficient

- **WHEN** a game's automated tests pass but the owner has not exercised its
  rendering, animation and input
- **THEN** the work is not accepted, and the change is not archived

#### Scenario: A parity shortfall is not deferred silently

- **WHEN** exercising a game surfaces a rendering, animation or input shortfall
- **THEN** it is fixed, or deferred only with explicit owner agreement, and never
  reclassified as out of scope to avoid fixing it
