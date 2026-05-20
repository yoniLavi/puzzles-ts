# Tasks

This change is **design-only**. Implementation is deferred to
follow-up changes. No code lands here.

## 1. Design review

- [ ] 1.1 Owner reads `proposal.md` and `design.md`. Agrees the
  scene-graph direction is what we want, or asks for revisions.
- [ ] 1.2 Resolve the open questions in `design.md` enough to
  scaffold the implementation change. (Not all need answers up
  front — some can land with the reconciler itself.)
- [ ] 1.3 Decide which game pilots the scene-graph contract. Most
  likely Galaxies (next on the migration order, complex enough to
  benefit). Alternative: a smaller game first to de-risk.

## 2. Open the implementation change (separate openspec change)

- [ ] 2.1 Once 1.x are resolved, scaffold
  `add-scene-graph-reconciler` (or similar) with a `ts-engine`
  spec delta adding the `Game.scene()` capability.
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
