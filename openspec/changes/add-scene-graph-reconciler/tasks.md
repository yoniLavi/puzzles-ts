# Tasks

## 1. Scene primitives

- [ ] 1.1 Add `src/native/engine/scene.ts` exporting
  `SceneNode` (discriminated union: `rect`, `line`, `polygon`,
  `circle`, `text`, `group`) and the helper types (`Point`,
  `Rect`, `DrawTextOptions` re-export). Every node carries an
  `id: string`.
- [ ] 1.2 Add `Game.scene` to the `Game` interface
  (`src/native/engine/game.ts` or wherever the interface lives)
  as an optional method:
  `scene?(s, ui, animTime, flashTime, prev?, dir?): SceneNode[]`.
- [ ] 1.3 Compile-time exhaustiveness: a `node.kind` switch in
  the reconciler must error if a new variant is added without a
  handler. Use `never` checks.

## 2. Reconciler

- [ ] 2.1 Add `src/native/engine/reconciler.ts` with
  `reconcile(prev: SceneNode[] | null, next: SceneNode[], dr:
  GameDrawing): void`. The implementation walks both lists by
  id (linear sweep on next, look up matching prev by id in a
  Map), and for each next node:
  - If no prev counterpart (added): emit full draw ops for the
    subtree.
  - If `prev === next` (referential equality): skip.
  - If deep-equal: skip.
  - Otherwise: clip to the node's bounds (explicit `clip` on
    `group`, else computed bbox), emit the new node's draw ops
    inside that clip.
- [ ] 2.2 Add `src/native/engine/reconciler.test.ts` with the
  four scenarios in the spec delta plus referential-equality
  fast-path.
- [ ] 2.3 The reconciler emits no `startDraw`/`endDraw` — those
  remain the midend's responsibility, framing the whole frame.

## 3. Midend dispatch

- [ ] 3.1 In `Midend.redraw(dr)`, if the registered game defines
  `scene`, invoke it, pass result + `lastScene` to `reconcile`,
  store as new `lastScene`. Else invoke `game.redraw` exactly as
  today.
- [ ] 3.2 `Midend.canvasCleared()` sets `lastScene = null` (in
  addition to discarding the per-game drawstate it discards
  today). Next reconcile sees every node as new.
- [ ] 3.3 `Midend.forceRedraw(dr)` likewise sets `lastScene =
  null` and runs `redraw(dr)`.
- [ ] 3.4 Update / add midend tests asserting (a) a
  `scene`-defining game causes the reconciler path to run, (b)
  a `redraw`-only game is unchanged, (c) a game defining both
  uses `scene`, (d) `canvasCleared` re-emits the full scene on
  next redraw.

## 4. Flip rewrite

- [ ] 4.1 Replace `flipGame.redraw` with `flipGame.scene`.
  Output: a flat `SceneNode[]` containing the bg rect, every
  grid line, and a `group` per tile (id `"tile-x,y"`, explicit
  clip = the tile's rect, children = the tile's draw content).
  Tile content (matrix arrows, polygon during anim, hint frame,
  cursor-coloured fill) becomes `rect`/`line`/`polygon`
  children of the group.
- [ ] 4.2 Delete `flipGame.setTileSize`, `flipGame.newDrawState`,
  the `FlipDrawState` type, and the
  `Int16Array` per-tile cache. Tile size comes from the existing
  `Midend.size()` plumbing; `scene()` reads it from a local
  computed from `s.w/s.h` plus the size passed in via a new
  small drawstate (`{ tileSize: number }`) or the midend's
  bookkeeping — final shape decided during implementation.
- [ ] 4.3 Per-tile memo (cheap): compute each tile's children
  via a helper keyed on `(grid[i], cursor-on-this-tile,
  flashFrame, animating)`; cache the prior frame's children
  per tile and return the same array reference if the key is
  unchanged. This gives the reconciler referential-equality
  early exit on unchanged tiles.
- [ ] 4.4 Rewrite `flip.test.ts` to drive `Midend.redraw(dr)`
  (or `reconcile` directly with two scenes) and assert against
  the recording `GameDrawing` op stream. The contract under
  test stays the same — what was painted — only the path
  changes.
- [ ] 4.5 Preserve the regression tests for the four shipped
  Flip bugs (b1b0dd6 flash-overlay isolation; b49bfdb / 9823acd
  reshape; b7dc206 frame-0 flicker; 5c5eba4 repaint-on-move).
  They depend on midend timer behaviour, not the redraw path,
  so they translate directly.

## 5. Differential check

- [ ] 5.1 Capture Flip's pre-rewrite recording-`GameDrawing` op
  stream for a fixed sequence (load known board, click 3 tiles
  per a deterministic order, undo once, redo once). Save under
  `src/native/games/flip/__fixtures__/flip-render-baseline.json`
  or similar.
- [ ] 5.2 Post-rewrite, the reconciler-driven op stream for the
  same sequence asserts equivalent content per tile bounding box
  (order may differ; the *paints* must match). If equivalence
  proves too lenient or too strict in practice, adjust scope —
  the goal is catching missing/spurious paints, not order
  churn.

## 6. Owner acceptance

- [ ] 6.1 Owner runs the dev server, plays through three boards
  (one solved by auto-flip, one solved by hand, one mid-anim
  reshape), and toggles between this branch and `main` to
  confirm visual + interaction parity. **Required before ship**
  per parity-gated-registration. A non-rendering, "tests pass"
  declaration is not parity.
- [ ] 6.2 Owner spot-checks on touch (phone) and keyboard
  (desktop) — same three boards.

## 7. Documentation

- [ ] 7.1 Update `AGENTS.md` "What's been done" with this change's
  outcome (reconciler landed, Flip on `scene`, Galaxies starts
  scene-graph-native).
- [ ] 7.2 Add a short `src/native/engine/scene.ts` module
  comment pointing at this change's `design.md` for the why
  (one-line link, not duplicate prose).

## 8. Cleanup

- [ ] 8.1 If `Game.redraw` and `Game.scene` end up needing a
  shared utility (e.g. computing tile clip bounds), extract.
  Otherwise leave them parallel — no premature abstraction.
- [ ] 8.2 Delete the placeholder `scene`-capability requirement
  added in `scaffold-scene-graph-game-contract` from any active
  state (this happens automatically when that change is
  archived with `--skip-specs`).
