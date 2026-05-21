# Change: Scaffold a scene-graph `Game.scene()` contract (long-term)

> **Status: WITHDRAWN 2026-05-21.** This design and its
> implementation follow-up (`add-scene-graph-reconciler`) were tried
> and backed out. The full rationale lives in
> `openspec/postmortems/2026-05-21-scene-graph-withdrawal.md`: owner
> acceptance surfaced a visible animation perf regression on the
> Flip-rewrite pilot, and the broader question — does the pivot pay
> back inside the migration window? — concluded no. The doctrine
> fixes from `fix-flip-canvas-reshape` (engine emits no pixels,
> side-effect-free `Midend.size`, `canvasCleared` as the only
> cache-stale signal) carry the cache-fragility weight on their own.
> The experimental implementation is preserved on
> `origin/withdrawn/scene-graph-reconciler`. This proposal is
> retained in `openspec/changes/` as the design history for future
> reference; the direction is **not** scheduled to be revisited
> unless a real game creates concrete cross-game-rendering pressure.

## Why

The presentation layer for puzzle pixels is imperative — every game
implements `redraw(dr, ds, prev, s, dir, ui, animTime, flashTime)`
and pushes draw operations into `GameDrawing` directly. Each game
also hand-rolls a per-tile diff cache (`ds.tiles[i]` in Flip;
similar in upstream) to avoid full repaints on every animation
frame. This is faithful to upstream's `drawing_api` but has bitten
us repeatedly during the Flip port:

- Bug-1 (black canvas on reshape) — the per-tile cache silently
  suppressed a needed repaint after the canvas was cleared, because
  the game's per-tile-cache invalidation hook (`setTileSize`) only
  fired when the tile size actually *changed*.
- Bug-2 (everything flickers) — the engine tried to centralise a
  background-fill "first_draw" pattern from upstream, but our
  frontend's `ResizeController` fires `size()` on every layout
  perturbation, so the centralised invalidation flashed during
  unrelated frames.

Both bugs are symptoms of the same problem: invalidating a manually
maintained per-tile cache at the right moment is fragile, and the
"right moment" is hard to specify when the frontend's resize signals
are noisier than upstream assumed.

The owner asked: "could we eventually move to a fully reactive UI
with no imperative components?" Yes. The shape this would take is a
**scene-graph `Game.scene()` contract**: the game becomes a pure
function of state → scene description; the framework owns the diff,
the canvas writes, and the cache lifecycle. No per-game `ds.tiles[]`,
no "did I remember to invalidate when X happened" bugs.

This change is **design-only**. It records the long-term direction
so future ports can be designed in this shape and existing ports
can migrate when their game-specific work touches their redraw.

## What Changes

- **NEW `ts-engine` requirement** (proposed, deferred until at
  least one game implements it): an additional `Game.scene(s, ui,
  animTime, flashTime, prev): SceneNode[]` capability, where the
  game returns an immutable scene description. The engine's
  reconciler diffs scene-vs-previous-scene and emits only the
  necessary draw ops. Games may implement *either* `redraw` (the
  imperative path that exists today) or `scene` (the new
  declarative path); the midend selects whichever is defined.
- **Design.md captures**: the primitive set (tile / rect / line /
  polygon / circle / text / group), how the reconciler keys nodes
  for stable identity, the animation-tween model (frame-by-frame
  scene functions vs. interpolated nodes), how blitters fit (or
  are replaced), performance budget for the worst-case grid
  (50×50 @ 60 Hz), and the per-game migration path.
- **No code in this change.** Implementation is at least two
  follow-up changes: (a) the reconciler + the scene primitives;
  (b) at least one game ported to `scene()` to validate the
  contract. Realistically Galaxies, since it's next on the
  migration order and its redraw is complex enough that
  scene-graph pays off immediately.

## Impact

- Affected specs (proposed): `ts-engine` (new requirement). No spec
  delta in this change — that's part of (a).
- Affected code: none in this change.
- Risk: design churn. Better to absorb that in pure design work
  than after implementation.
- Owner sign-off: this proposal needs to be reviewed and approved
  *as a direction* before (a) is opened. Once direction is
  approved, (a) writes the spec delta + code + reconciler tests.
