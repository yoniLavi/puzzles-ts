# Change: Add a scene-graph reconciler and pilot Flip-on-scene

## Why

The scene-graph direction was approved as a design in
`scaffold-scene-graph-game-contract` (archived alongside this
change). The motivation, in short: Flip's port shipped broken
three times because the imperative `redraw` + manual per-tile
cache shape made "invalidate the cache at the right moment"
fragile, and the right moment is hard to specify when the
frontend's `ResizeController` calls `size()` on every layout
perturbation. The scene-graph contract eliminates the manual
cache: the game returns a pure scene description per frame, the
framework owns the diff and the canvas writes.

This change lands the actual code: scene primitives, the
reconciler, midend dispatch, and **Flip rewritten to `scene()`** as
the pilot that proves the contract. Galaxies is *not* the pilot —
Flip is, because Flip is the game whose rendering iterations
motivated this whole design, it already has owner-accepted
visual + behavioural parity, and so it gives the strongest
possible baseline to validate against. Galaxies follows in its
own change, scene-graph-native from the start.

## What Changes

- **NEW `SceneNode` types** in `src/native/engine/scene.ts`:
  filled rectangle, line, polygon, circle, text, and a `group`
  with optional clip and transform that contains child nodes.
  Every node carries a game-chosen stable `id` so the reconciler
  can match across frames. The set covers exactly what Flip's
  current `redraw` emits (no blitters); future games that need
  more primitives extend the union.
- **NEW reconciler** in `src/native/engine/reconciler.ts`:
  given (previous scene, new scene, `GameDrawing`), walks the
  scenes in tandem matching by `id` and emits the minimum draw
  operations needed to bring the canvas from previous to new.
  Equal subtrees (deep-compared structurally) emit zero ops;
  changed subtrees clip+repaint within the changed node's bounds.
- **MODIFIED `Game` interface**: adds an optional
  `scene(s, ui, animTime, flashTime, prev?, dir?): SceneNode[]`
  method alongside `redraw`. Backward compatible — existing
  ported games (just Flip today) keep working unchanged until
  migrated.
- **MODIFIED `Midend.redraw`**: when the registered game defines
  `scene`, the midend invokes it, hands the returned scene plus
  the previous frame's scene to the reconciler, and the
  reconciler emits the draw ops. When the game defines only
  `redraw`, the midend's behaviour is unchanged. When a game
  defines both (mid-migration), the midend uses `scene`.
- **Flip rewritten to `scene()`**: `src/native/games/flip/index.ts`
  loses `redraw`, `setTileSize`, `newDrawState` (drawstate is now
  empty/unused for Flip), and the per-tile `Int16Array` cache;
  gains `scene()` that returns the board as a list of grouped
  per-tile scenes. Behavioural tests in `flip.test.ts` that
  asserted against the imperative path are rewritten to assert
  against the recorded draw-op stream produced by the reconciler
  driving `scene()` — the *externally observable* test contract
  (what was painted) stays. Visual parity must be owner-confirmed
  against the current Flip baseline before this change ships.
- **NEW reconciler tests** in
  `src/native/engine/reconciler.test.ts`: synthetic scenes
  driving the reconciler directly, asserting that (a) an empty
  → non-empty diff emits the full scene, (b) an unchanged scene
  emits zero draw ops, (c) a changed node emits ops within that
  node's clip only, (d) a removed-then-readded node round-trips.

## Impact

- Affected specs: `ts-engine` — three new ADDED requirements
  (`Game.scene`, the reconciler, midend dispatch). Existing
  `redraw`-shaped requirements are untouched; they continue to
  govern games that haven't migrated.
- Affected code: `src/native/engine/` (new `scene.ts`,
  `reconciler.ts`, midend wiring), `src/native/games/flip/`
  (rewrite to `scene`, drop draw-state/setTileSize/redraw),
  Flip's tests (assert against draw-op recording, not the old
  imperative path), TS midend tests if any reference the
  redraw-only path explicitly.
- Risk: contract design churn — once a second game adopts
  `scene`, refactoring the node union is expensive. Mitigation:
  Flip's rewrite *is* the design-validation step; design churn
  here is cheaper than later. Visual parity must be
  owner-confirmed (per the parity-gated-registration doctrine)
  before this change ships.
- Risk: performance — every frame allocates a fresh scene tree
  (~25 nodes for a 5×5 Flip board). At 60 Hz that's ~1500
  objects/sec, negligible. Larger games would need measurement;
  Flip is not a stress case. The reconciler's design admits
  later optimisations (object pooling, typed-array encoding) if
  measurement ever shows a problem.
- Risk: the placeholder `scene`-capability requirement in
  `scaffold-scene-graph-game-contract` and this change's
  concrete requirements could overlap if both spec deltas land.
  Resolution: scaffold is archived with `--skip-specs`
  (design-only archive per its task 3.2); only this change's
  spec delta lands.
