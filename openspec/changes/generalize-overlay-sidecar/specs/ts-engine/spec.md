# ts-engine

## MODIFIED Requirements

### Requirement: Hint mechanics are engine-owned and cross-game guarded

A game's hint SHALL contain only what is genuinely that game's: **what it can prove, what
it marks on the board, and what it says**. The *mechanics* a hint needs — how a plan is
carried and advanced, how a mark survives a move animation, how an overlay reaches the
render cache, how a plan stays stable across recompute, how a step is narrated in the
shared vocabulary — SHALL be provided by the engine or by a shared hint library, and SHALL
NOT be re-derived per game.

The overlay clause is overlay-general, not hint-specific: **any** per-cell overlay a game
paints on top of its tiles (the hint overlay, the mistake overlay) SHALL reach the render
cache through the shared overlay sidecar (`engine/overlay-sidecar.ts`) rather than a
per-game re-derivation of the repack/stale/commit dance, except where a game's overlay
genuinely does not fit the per-cell shape (recorded as a no-go with its reason).

This requirement states the **invariant**, not an API: which seams are extracted, and in
what shape, is decided by the audit this change carries (`design.md`), and a seam that
fails those criteria SHALL be recorded as a deliberate no-go rather than forced.

Two rules make it enforceable rather than aspirational:

- **A hint defect class that has occurred in two or more games SHALL be closed
  structurally or by a cross-game guard** — a test every hinting game is enrolled in (as
  `hint-resume.test.ts` already guards plan convergence) — and SHALL NOT be left to a rule
  in a document that each new port must remember. Documented rules are how the same defect
  reaches a second game.
- **A shared hint mechanism SHALL NOT cost a game any of its narration.** The exemplar
  hints — Palisade's deduction bar, Inertia's stable subgoal, Towers' recorded
  eliminations, Filling's grouped multi-square step — are the acceptance test: if a shared
  abstraction cannot express one of them without loss, the abstraction is wrong, not the
  hint. The hint is the product; the framework serves it.

#### Scenario: A recurring hint defect is closed for every game at once

- **WHEN** a hint defect is found that has already occurred in another game — a mark that
  does not track its moving piece, an overlay absent from the render cache's diff key, a
  plan that loops across recomputes
- **THEN** it is fixed in the shared mechanism and guarded by a test every hinting game is
  enrolled in, rather than fixed only in the game that reported it

#### Scenario: A new hinting game inherits the mechanics

- **WHEN** a newly ported game adds a hint
- **THEN** it implements its deductions, its marks and its narration, and inherits plan
  lifecycle, mark-vs-animation placement, overlay cache invalidation and the narration
  vocabulary from the engine — it does not re-derive them

#### Scenario: An extraction that would flatten a hint is rejected

- **WHEN** a proposed shared abstraction cannot express an exemplar game's hint without
  losing part of what that hint says
- **THEN** the abstraction is rejected or reshaped, and the rejection is recorded with its
  reason

#### Scenario: A mistake overlay reaches the cache the same way the hint overlay does

- **WHEN** a game paints a per-cell mistake overlay (the `findMistakes` highlight) over
  tiles whose values are otherwise unchanged
- **THEN** the overlay is carried by the shared overlay sidecar — packed per frame,
  stale-compared in the cache-miss test, committed after draw — so a Check & Save on an
  already-drawn board repaints the flagged cells
