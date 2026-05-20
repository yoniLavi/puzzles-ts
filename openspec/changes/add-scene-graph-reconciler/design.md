# Design: scene-graph reconciler + Flip pilot

## Context

`scaffold-scene-graph-game-contract` (design-only, approved
2026-05-20) established the direction: games describe their
canvas as a pure scene tree per frame, the framework reconciles
and writes. This change is the implementation. The three open
questions from the scaffold's `design.md` get concrete answers
here; the spec delta is fully ADDED so the scaffold's
placeholder requirement can be discarded on its design-only
archive.

## Goals / Non-Goals

**Goals**

- Land a working reconciler that handles every primitive Flip's
  current `redraw` emits (no blitters needed).
- Rewrite Flip to `scene()`, deleting its `redraw`,
  `setTileSize`, `newDrawState`, and per-tile `Int16Array` cache.
- Keep Flip's behavioural test coverage intact: tests assert
  against the recorded draw-op stream the reconciler emits, so
  the externally observable contract is unchanged.
- Owner-confirmed visual + interaction parity on Flip-on-scene
  before this change ships (parity-gated registration).
- Establish the pattern so Galaxies (next port) starts
  scene-graph-native.

**Non-Goals**

- Migrating other ported games. Flip is the only port today
  beyond random/leaves; Galaxies hasn't landed yet.
- Blitter support. Flip doesn't use blitters; Loopy and Mines
  do, but neither is ported yet. The blitter question is
  deferred to whichever change ports a blitter-using game.
- Removing the `redraw` shape from the engine. The interface
  keeps both methods optional; any future port may pick either.
  Deprecation is a separate conversation, after multiple games
  have shipped on `scene`.
- Performance optimisations beyond what fits naturally
  (referential equality fast-path for unchanged groups). Object
  pooling, typed-array node encoding, etc. are deferred until
  measurement on a real game shows they're needed.

## Decisions

### D1: Scene returned by value, not built into a passed-in builder

Open question in scaffold: value vs. builder. **Decision: value.**

A `scene(s, ui, animTime, flashTime, prev?, dir?): SceneNode[]`
returns an array (top-level z-order). Simpler call signature,
games can compose sub-scenes by returning fragments from helper
functions, and the allocation cost (~25 nodes/frame for Flip) is
negligible. If profiling later shows allocation churn matters,
the builder shape can be introduced as an alternative — but YAGNI.

### D2: Reconciler always deep-compares; no memoisation hint required

Open question in scaffold: deep-compare vs. memoise. **Decision:
always deep-compare**, but with a referential-equality fast-path
at every node (`if (prev === next) skip` short-circuits an entire
subtree if the game returned the same object reference).

Rationale: games that compute scene from state can naturally
memoise per-state — Flip's tile children for tile `(x, y)` depend
only on `(s.grid[i], ui.cx, ui.cy, ui.cursorVisible, flashTime,
animTime)`; a per-tile memo by those keys gives referential
equality cheaply. Games that don't bother still get correctness
from deep-compare. No engine-level memoisation table needed.

Deep-compare is a structural recursive equality on nodes:
same `kind`, same `id`, same primitive fields, recursive on
children. Implementation is ~30 lines; we measure later if it
ever shows up.

### D3: Cursor overlay is its own scene node, not a per-tile child

Open question in scaffold: how cursor interacts with per-tile
groups. **Decision: top-level overlay node**, drawn after the
board, with `id: "cursor"`. When `ui.cursorVisible` is false the
cursor scene returns no overlay node; the reconciler diffs that
to "remove the node" and emits the underlying tile's repaint to
cover the cursor's pixels.

Why not per-tile child: putting the cursor inside the active
tile's group makes the cursor's appearance change cause that
tile's diff to trigger every cursor move, which is fine for one
tile but tangles tile identity with UI state. A separate overlay
keeps tile groups purely state-derived.

For Flip specifically: cursor today is rendered as a colour
shift on the active tile (`COL_CURSOR` instead of `COL_DIAG`).
The scene-version keeps that — the active tile renders with the
cursor colour when `ui.cursorVisible && ui.cx === x && ui.cy ===
y`. So the "cursor as its own node" doesn't actually apply to
Flip, but the principle is documented for future games whose
cursor is a separate overlay (e.g. Galaxies' dot/cell hint
cursor).

### D4: Reconciler emits clip-restricted overpaints; no canvas-level erase

When a node's content changes, the reconciler clips to the
node's bounds (computed from the node's geometry; for `group`
the union of children's bounds or the explicit `clip` rect if
set) and emits the new node's draw ops into that clip. The old
content is overwritten by the new content — no separate "clear"
op. This matches the existing `Drawing.drawRect`-as-fill
convention and avoids double-paints.

Trade-off: nodes whose new content has a smaller bounding box
than the old content would leave stale pixels outside the new
bbox. Mitigation: nodes that *shrink* declare an explicit `clip`
rect covering the worst-case bbox (the game already knows the
tile size, etc.). For Flip every tile is a fixed-size group with
explicit clip, so this trade-off never bites in practice.

### D5: Animation stays per-frame; no built-in tweening

The scaffold mentioned an optional `{ kind: "tween", from, to,
t }` later. **Decision: not in this change.** Flip's animation
is a 0..1 progress through a polygon shape — it's easier to
compute the right scene per frame than to express it as
interpolation between two scenes. The scene primitive
`polygon` with current-frame-computed coordinates is enough.

The midend timer keeps doing exactly what it does today (drives
repaints at `requestAnimationFrame` cadence while animation is
in flight); the reconciler is animation-blind, just diffing
whatever `scene()` returns this frame against last frame.

### D6: Midend selects `scene` over `redraw` when both are defined

Per scaffold's spec sketch. The midend's `redraw(dr)` looks
roughly like:

```ts
redraw(dr) {
  dr.startDraw();
  if (game.scene) {
    const next = game.scene(state, ui, animTime, flashTime, prev, dir);
    reconcile(prev: lastScene, next, dr);
    lastScene = next;
  } else {
    game.redraw!(dr, ds, prev, state, dir, ui, animTime, flashTime);
  }
  dr.endDraw();
}
```

`canvasCleared()` discards `lastScene` (sets it to empty) so the
next reconcile sees every node as new — the equivalent of
`!ds.started` for the imperative path. `forceRedraw(dr)` does
the same and runs `redraw(dr)`. The existing canvas-clear /
palette-replace contract from
`ts-engine`'s "midend repaints + drives animation" requirement
keeps holding.

### D7: Flip's tests assert against recorded draw ops, not internal state

Today `flip.test.ts` exercises `flipGame.redraw(...)` directly
and asserts on call counts to a recording `GameDrawing`. The
rewrite has tests drive `Midend.redraw(dr)` (or the
reconciler directly with two synthetic scenes) and assert
against the same recording. The contract — "this input → these
draw ops" — is preserved; only the path through the engine
changes.

Specifically:
- "draws the grid once, then per-tile cache suppresses redundant
  redraws" → "drives `scene()` twice with same state, second
  redraw emits zero `drawRect`/`drawLine` ops".
- "tile reshape with same tile size triggers full repaint after
  canvasCleared" → "midend.canvasCleared() discards lastScene,
  next redraw emits the full board".
- "flash overlay doesn't fire on every animated move" — the bug
  the b1b0dd6 fix addressed — kept verbatim; depends on midend
  timer, not on the redraw path.

### D8: Differential check follows Flip's pattern

Flip already has `src/native/games/flip/flip-differential.test.ts`
(frozen CROSSES grid vs C reference) and `scripts/diff-flip.test.ts`
(advisory live diff). These run against the game's *state*, not
its rendering, so they're unaffected by the redraw→scene switch
and continue to gate generator correctness.

The new validation surface in this change is the
**reconciler's draw-op output** vs Flip's pre-change draw-op
output for the same state. Approach: capture Flip's current
recording-`GameDrawing` op stream for a fixed sequence (load
known board, click 3 tiles, undo once, redo once); after the
rewrite, the reconciler-driven op stream for the same sequence
must match the same per-op-set semantics (order may differ;
content must be equivalent).

If that diff is too strict (because the reconciler emits ops in
a different order, e.g. all draws then all updates vs.
interleaved), relax to per-tile bounding-box ops match. The
goal is to catch *missing* or *spurious* paints, not order
churn.

## Risks / Trade-offs

- **R1: Contract churn after Galaxies hits a primitive Flip
  doesn't exercise.** Mitigation: keep the primitive union open
  to extension; adding a new node kind is additive. The
  reconciler's per-kind dispatch is a switch with exhaustiveness
  checking, so missing handlers are caught at compile time.
- **R2: Per-frame scene allocation showing up in profiles.**
  Mitigation: D2's referential-equality fast-path lets games
  memoise where it matters. Flip's per-tile memo is ~10 lines.
  If the engine itself ever needs to pool nodes, that's a
  follow-up change.
- **R3: A bug in the reconciler causes a silent stale-pixel
  class.** Mitigation: reconciler unit tests cover the four
  scenarios in the spec delta; Flip-rewrite owner-acceptance
  catches anything the unit tests miss. Plus the
  parity-gated-registration doctrine: Flip stays at parity or
  this change doesn't ship.
- **R4: Visual parity drift between the old imperative Flip and
  scene-Flip that nobody notices.** Mitigation: owner does a
  side-by-side acceptance check (toggle between this branch and
  `main`, play through three boards) before merge.

## Migration Plan

This change is the migration for Flip itself. Galaxies (next
port) starts scene-graph-native. Any future port may choose
`scene` or `redraw`. There is no scheduled deprecation of
`redraw`.

## Open Questions

None blocking. The three from the scaffold are resolved (D1, D2,
D3). Open items for *later* changes:

- When does `redraw` get deprecated, and what's the trigger?
  (Probably: when every shipped port uses `scene`. Not before.)
- Do we ever need built-in tween nodes (D5)? Decide after the
  third game ships on `scene`.
- Blitter handling for Loopy/Mines if they're ever ported.
  Probably "those games keep `redraw`" but defer the decision.
