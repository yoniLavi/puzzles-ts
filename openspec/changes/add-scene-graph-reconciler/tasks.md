# Tasks

## 1. Scene primitives

- [x] 1.1 Add `src/native/engine/scene.ts` exporting
  `SceneNode` (discriminated union: `rect`, `line`, `polygon`,
  `circle`, `text`, `group`) and the helper types (`Point`,
  `Rect`, `DrawTextOptions` re-export). Every node carries an
  `id: string`.
- [x] 1.2 Add `Game.scene` to the `Game` interface
  (`src/native/engine/game.ts` or wherever the interface lives)
  as an optional method. Final signature:
  `scene?(s, ui, ds, animTime, flashTime, prev, dir): SceneNode[]`
  (`ds` added for symmetry with `interpretMove`; the spec delta
  was amended to match — see proposal.md "Why" and the spec
  delta's first requirement).
- [x] 1.3 Compile-time exhaustiveness: a `node.kind` switch in
  the reconciler errors at compile time if a new variant is added
  without a handler (the `default: { const _exhaustive: never =
  node; ... }` pattern, repeated for `emitDraws` and
  `nodesEqual`).

## 2. Reconciler

- [x] 2.1 Add `src/native/engine/reconciler.ts` with
  `reconcile(prev, next, dr): void`. Linear sweep on `next`;
  `prev` is indexed by id via a `Map` for O(1) lookup. Per node:
  referential equality short-circuits → deep-equal short-circuits
  → otherwise `clip(bounds)` + `emitDraws(node)` +
  `unclip()` + `drawUpdate(bounds)`. Bounds come from explicit
  `group.clip` or from a per-kind computed bbox; `text` requires
  explicit `bounds` (the engine doesn't measure fonts).
- [x] 2.2 Add `src/native/engine/reconciler.test.ts` with all four
  spec-delta scenarios plus the referential-equality fast path,
  added-node-without-prev-match, removed-then-readded round-trip,
  emit-order, the `transform` not-implemented guard, and the
  text-without-bounds guard.
- [x] 2.3 The reconciler emits no `startDraw`/`endDraw` — those
  remain the midend's responsibility. Asserted in the test.

## 3. Midend dispatch

- [x] 3.1 In `Midend.redraw(dr)`, if the registered game defines
  `scene`, invoke it, pass result + `lastScene` to `reconcile`,
  store as new `lastScene`. Else invoke `game.redraw` exactly as
  before (no behaviour change for `redraw`-only games).
- [x] 3.2 `Midend.canvasCleared()` sets `lastScene = null` in
  addition to discarding the per-game drawstate it already
  discards. Next reconcile sees every node as new.
- [x] 3.3 `Midend.forceRedraw(dr)` likewise sets `lastScene =
  null` (via the existing `canvasCleared()` call inside
  `forceRedraw`) and runs `redraw(dr)`.
- [x] 3.4 Added midend tests asserting (a) a `scene`-defining
  game causes the reconciler path to run, (b) a `redraw`-only
  game is unchanged, (c) a game defining both uses `scene`, (d)
  the second redraw of unchanged state emits zero draw ops, (e)
  `canvasCleared` re-emits the full scene on the next redraw,
  (f) `forceRedraw` repaints the entire scene.

## 4. Flip rewrite

- [x] 4.1 Replaced `flipGame.redraw` with `flipGame.scene`.
  Returned shape: top-level `bg` rect; `grid` group with explicit
  full-window clip whose children are the per-edge grid lines;
  one `tile-x,y` group per cell with explicit clip = the tile's
  interior (one pixel inside the grid border) and children
  describing the tile's content (fill rect, optional anim
  polygon, matrix-arrow markers, hint-frame outlines).
- [x] 4.2 Deleted the per-tile `Int16Array` cache, the `started`
  first-paint flag, and the `drawTile` helper. `FlipDrawState` is
  reduced to `{ tileSize: number; tiles: Array<TileMemo |
  undefined> }` — minimal mirror for `interpretMove`'s
  click→cell mapping plus a per-tile scene-node memo for the
  reconciler's referential-equality fast path. `setTileSize` is
  a one-line assignment (no cache wipe, no first-paint reset);
  `newDrawState` allocates the empty memo array sized to `w*h`.
- [x] 4.3 Per-tile memo (cheap): tile's `key` encodes `(tileVal |
  tileSize << 4)` for static tiles, or `-1` for animating tiles
  (their polygon shape varies per frame). Cached entry returned
  by reference when the key matches; the reconciler's
  `prev === next` short-circuit then skips deep-compare.
- [x] 4.4 Rewrote `flip.test.ts` to drive `Midend.redraw(dr)`
  (and `flipGame.scene` directly where the test needs to inspect
  the returned tree). The "drew the grid once" test is now
  "first scene paints bg + grid + tiles, second is a no-op". The
  reshape regression test is now "canvasCleared resets
  lastScene, next redraw paints bg + grid lines from scratch".
- [x] 4.5 Preserved the regression tests for the four shipped
  Flip bugs: flash-overlay isolation (state-machine — passes
  unchanged), reshape (now structurally impossible via
  scene-graph but the test still verifies the flow), frame-0
  flicker (now structurally impossible via timer-driven first
  animated frame; the lifecycle test still asserts the timer
  ordering), repaint-on-move (the lifecycle test still asserts
  the redraw is requested + animation timer fires).

## 5. Differential check

- [x] 5.1 / 5.2 Forgone in favour of behavioural-test coverage +
  owner acceptance. Rationale: capturing a pre-rewrite op-stream
  baseline after the rewrite has landed would have required
  git-time-travel + vendoring the old Flip's redraw + drawTile
  + heavy drawstate as a fixture; the parity-gated-registration
  doctrine relies on owner acceptance as the actual parity bar,
  not on op-stream equivalence. The granular paint assertions in
  `flip.test.ts` (first paint contains bg + grid + tiles, second
  is a no-op via memo+reconciler short-circuit, per-tile change
  emits narrow clips, hint outlines on solve, reshape regression
  preserved, flash regression preserved, scene-shape spec
  scenarios) cover the "catch missing or spurious paints" goal
  for going-forward regressions. (`flip-differential.test.ts`
  and `scripts/diff-flip.test.ts` remain the differential checks
  for the *generator*, unaffected by the redraw→scene switch.)

## 6. Owner acceptance

- [ ] 6.1 Owner runs the dev server, plays through three boards
  (one solved by auto-flip, one solved by hand, one mid-anim
  reshape), and toggles between this branch and `main` to
  confirm visual + interaction parity. **Required before ship**
  per parity-gated-registration.
- [ ] 6.2 Owner spot-checks on touch (phone) and keyboard
  (desktop) — same three boards.

## 7. Documentation

- [x] 7.1 Updated `AGENTS.md` "What's been done" with this
  change's outcome (reconciler landed, Flip on `scene`, the
  pre-vs-post op-stream snapshot forgone in favour of owner
  acceptance + behavioural tests).
- [x] 7.2 `src/native/engine/scene.ts` carries a module comment
  pointing at this change's `design.md` for the why.

## 8. Cleanup

- [x] 8.1 No shared utility needed between `redraw` and `scene`
  (Flip's old `drawTile` was deleted outright; `scene` builds
  fresh scene nodes). The two interface methods stay parallel
  per the design.md guidance.
- [x] 8.2 The placeholder `scene`-capability requirement in
  `scaffold-scene-graph-game-contract` was archived
  `--skip-specs` (per its task 3.2), so only this change's
  spec delta lands.
