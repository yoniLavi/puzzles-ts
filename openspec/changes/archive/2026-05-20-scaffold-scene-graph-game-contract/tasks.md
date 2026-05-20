# Tasks

This change is **design-only**. Implementation is deferred to
follow-up changes. No code lands here.

## 1. Design review

- [x] 1.1 Owner reads `proposal.md` and `design.md`. Agrees the
  scene-graph direction is what we want, or asks for revisions.
  **Approved 2026-05-20.**
- [x] 1.2 Resolve the open questions in `design.md` enough to
  scaffold the implementation change. **Resolved:** all three
  open questions (return-by-value vs builder, memoisation policy,
  cursor-overlay z-ordering) are deferred to the implementation
  change `add-scene-graph-reconciler`, where the reconciler and
  pilot game make them concrete decisions. None blocks scaffolding.
- [x] 1.3 Decide which game pilots the scene-graph contract.
  **Decided: Flip-rewrite, not Galaxies-as-pilot.** Rationale:
  Flip is the game whose rendering iterations *motivated* this
  proposal — rewriting it on `scene()` validates the contract
  against an owner-accepted visual + behavioural baseline before
  Galaxies bets on it. Keeps the scene-graph implementation
  change single-purpose (contract validation, not new-game
  delivery) and lets a future Galaxies change be scoped to
  porting Galaxies. Galaxies is then the *second* scene-graph
  game, in its own change.

## 2. Open the implementation change (separate openspec change)

- [x] 2.1 Once 1.x are resolved, scaffold
  `add-scene-graph-reconciler` (or similar) with a `ts-engine`
  spec delta adding the `Game.scene()` capability.
  **Scaffolded 2026-05-20** at
  `openspec/changes/add-scene-graph-reconciler/` (proposal,
  design, tasks, ts-engine delta; `openspec validate --strict`
  passes). Delta is fully ADDED (three orthogonal requirements:
  `Game.scene`, reconciler, midend dispatch); this change's
  placeholder requirement is intentionally superseded and
  should not land — archive this change with `--skip-specs`.
- [ ] 2.2 That change implements: the `SceneNode` types, the
  reconciler (canvas writer + diff), the midend wiring (call
  `scene()` if defined else `redraw()`), and the pilot game's
  migration. Owner-acceptance on the pilot.

## 3. This change is "done" when

- [ ] 3.1 Direction is approved (or rejected with clear rationale).
- [ ] 3.2 If approved, the implementation change is scaffolded and
  this change is archived as design-only.
- [ ] 3.3 If rejected, this change is archived with the rejection
  rationale captured so the question doesn't get reopened
  blindly. The fallback is to keep iterating on the imperative
  `redraw` shape — which works, just has the cache-invalidation
  fragility documented in `proposal.md`'s Why.
