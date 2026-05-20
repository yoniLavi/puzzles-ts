# ts-engine spec delta

This delta firms up the scene-graph contract whose direction was
approved in `scaffold-scene-graph-game-contract` (archived
design-only, with `--skip-specs`, so its placeholder requirement
does not land). Three new ADDED requirements: the `Game.scene`
shape, the reconciler's contract, and how the midend selects
between `scene` and `redraw`. The existing `redraw`-shaped
requirements are untouched; games may continue to implement
`redraw` until a future change deprecates it.

## ADDED Requirements

### Requirement: Games MAY describe their canvas via a scene-graph function

The `Game` interface SHALL support an optional method
`scene(s: State, ui: Ui, animTime: number, flashTime: number,
prev?: State, dir?: number): SceneNode[]` returning a list of
scene nodes that describe the canvas for the current frame, in
draw order.

A `SceneNode` SHALL be a discriminated union with at least these
variants:

- `rect` — filled rectangle with `x`, `y`, `w`, `h`, `fill`
  (palette index).
- `line` — `from`, `to`, `colour`, optional `thickness`.
- `polygon` — `points: Point[]`, `fill`, `outline`.
- `circle` — `centre`, `radius`, `fill`, `outline`.
- `text` — `origin`, `text`, `options` (the existing
  `DrawTextOptions`), `colour`.
- `group` — `children: SceneNode[]`, optional `clip: Rect`,
  optional `transform: { dx: number; dy: number }`.

Every node SHALL carry a stable `id: string` chosen by the game,
unique among its siblings. The reconciler uses `id` to match
nodes between frames.

A game that defines `scene` SHALL NOT emit canvas writes
directly; all writes SHALL be expressed as scene nodes returned
from `scene`. The framework owns the writes.

#### Scenario: A game defines scene and returns a list of nodes

- **WHEN** a registered TS game defines `scene` and the midend
  invokes it
- **THEN** the method returns a `SceneNode[]` describing the
  current frame
- **AND** every node in the tree carries a stable string `id`

#### Scenario: A game defining scene emits no direct canvas writes

- **WHEN** a `scene`-defining game produces a frame
- **THEN** the only canvas writes recorded are those the
  framework's reconciler emits
- **AND** no draw operation originates from the game itself

### Requirement: The scene-graph reconciler emits the minimum draw ops needed

The engine SHALL provide a `reconcile(prev: SceneNode[] | null,
next: SceneNode[], dr: GameDrawing): void` function that diffs
two scene trees and emits draw operations on `dr` to bring the
canvas from `prev` to `next`.

The reconciler SHALL:

- Match nodes between `prev` and `next` by `id` within their
  containing list (top-level or `group.children`).
- Short-circuit when `prev === next` (referential equality):
  zero draw ops for that subtree.
- Otherwise structurally deep-equal-compare matched nodes: zero
  draw ops when equal.
- When a matched node differs: clip to the node's bounds
  (explicit `clip` for `group`; computed bounding box otherwise)
  and emit the new subtree's draw ops within that clip.
- When `next` contains a node with no `id`-matched counterpart
  in `prev` (added): emit the full subtree's draw ops.
- When `prev` contains a node with no counterpart in `next`
  (removed): the surrounding context's repaint (which the
  reconciler already emits because *its* subtree differs) is
  responsible for overwriting the removed node's pixels; the
  reconciler SHALL NOT emit a separate "erase" op. (Games whose
  removed-node bbox extends beyond their parent's clip SHALL
  declare an explicit `clip` covering the worst-case bbox.)
- Emit no `startDraw` or `endDraw` — those framing operations
  remain the midend's responsibility.

When `prev` is `null`, the reconciler SHALL emit the full
`next` tree (every node is treated as added).

#### Scenario: An unchanged scene emits zero draw ops

- **WHEN** `reconcile` is called with two structurally-equal
  scene trees
- **THEN** no draw operations are emitted on `dr`
- **AND** the canvas is unchanged

#### Scenario: A changed node emits ops clipped to its bounds

- **WHEN** `reconcile` is called with two scenes where exactly
  one node's contents differ
- **THEN** `dr` receives a `clip` to that node's bounds, the
  new node's draw ops, and the matching `unclip`
- **AND** sibling nodes' regions of the canvas are not
  overwritten

#### Scenario: An empty-to-non-empty diff paints the full scene

- **WHEN** `reconcile` is called with `prev = null` and a
  non-empty `next`
- **THEN** every node in `next` is drawn from scratch
- **AND** no clip narrower than each node's own bounds is used

#### Scenario: Referential equality short-circuits a subtree

- **WHEN** `reconcile` is called and a node in `next` is the
  same object reference as its `id`-matched counterpart in
  `prev`
- **THEN** no draw ops are emitted for that subtree (it is
  treated as unchanged without deep comparison)

### Requirement: The midend prefers scene over redraw when both are defined

`Midend.redraw(dr)` SHALL, between `dr.startDraw()` and
`dr.endDraw()`, select the rendering path as follows:

- If the registered game defines `scene` and not `redraw`:
  invoke `game.scene(...)` to obtain the next frame's tree,
  pass the previous frame's tree (or `null` on the first
  frame after `canvasCleared`/`forceRedraw`/initial load) and
  the new tree to `reconcile`, and store the new tree as the
  previous-frame tree.
- If the registered game defines `redraw` and not `scene`:
  invoke `game.redraw(...)` exactly as today.
- If the game defines both: use `scene`. The `redraw`
  implementation MAY remain in source (e.g. during a port's
  transition) but the midend SHALL NOT call it.

`Midend.canvasCleared()` SHALL discard the previous-frame scene
tree in addition to discarding the per-game drawstate it
already discards. The next call to `Midend.redraw(dr)` SHALL
therefore reconcile against `prev = null`, painting the entire
new scene.

`Midend.forceRedraw(dr)` SHALL discard the previous-frame scene
tree (the same effect as `canvasCleared`) and immediately
invoke `redraw(dr)`, repainting the entire new scene.

#### Scenario: A scene-defining game runs through the reconciler

- **WHEN** a registered game defines `scene` and `Midend.redraw`
  is called
- **THEN** the midend invokes `game.scene`, passes its output
  along with the previous frame's scene to `reconcile`, and
  caches the new scene as previous-for-next-frame
- **AND** `game.redraw` is not invoked

#### Scenario: A redraw-only game is unchanged

- **WHEN** a registered game defines `redraw` and not `scene`
- **THEN** `Midend.redraw` invokes `game.redraw` exactly as it
  does for current ports
- **AND** the reconciler is not invoked

#### Scenario: A game defining both prefers scene

- **WHEN** a registered game defines both `scene` and `redraw`
- **THEN** the midend invokes `scene` and the reconciler
- **AND** `redraw` is not invoked

#### Scenario: canvasCleared invalidates the previous-frame scene

- **WHEN** `Midend.canvasCleared()` is called
- **THEN** the next `Midend.redraw(dr)` reconciles against
  `prev = null`
- **AND** the entire new scene is painted, equivalent to a
  cold start for that drawstate

#### Scenario: forceRedraw repaints the entire scene

- **WHEN** `Midend.forceRedraw(dr)` is called (e.g. on a
  palette or font replacement)
- **THEN** the previous-frame scene is discarded and the
  midend immediately calls `redraw(dr)`
- **AND** the entire scene is repainted in the new palette/font

### Requirement: Flip ports to scene as the pilot

The game `flip` SHALL implement `Game.scene` and SHALL NOT
implement `Game.redraw`. The implementation SHALL emit a board
top-level `SceneNode[]` containing the background rect, the
grid lines, and one `group` per tile (id `"tile-x,y"`, explicit
clip equal to the tile's interior rect, children describing the
tile's content). Per-tile content SHALL be referentially stable
when the tile's visible state is unchanged — i.e. the same
JavaScript object reference is returned across frames for
unchanged tiles — so the reconciler's referential-equality
fast-path applies.

Flip's `FlipDrawState`, `newDrawState`, `setTileSize`, and
per-tile `Int16Array` cache SHALL be removed. The midend's
existing tile-size plumbing (set via `Midend.size`) SHALL be
what `scene` reads to compute geometry.

Flip's behavioural tests SHALL be updated to assert against the
recording `GameDrawing` op stream produced by the
reconciler-driven path, not against the imperative path's per-
tile cache state. The visual-and-interaction parity bar from the
parity-gated-registration doctrine SHALL hold: this change does
not ship until the owner has played Flip-on-`scene` and
confirmed parity with the pre-change Flip.

#### Scenario: Flip emits a scene with stable tile identity

- **WHEN** `flipGame.scene` is invoked for a w×h board
- **THEN** the returned scene contains exactly one `group`
  node per tile, with `id` of the form `"tile-x,y"` (or
  equivalent stable form), each carrying an explicit `clip`
  rect equal to the tile's interior
- **AND** the board background and grid lines are present as
  separate top-level nodes

#### Scenario: An unchanged tile short-circuits via referential equality

- **WHEN** Flip's `scene` is invoked twice in a row with no
  change to a given tile's visible state (grid value, cursor
  position, flash frame, animation phase all unchanged)
- **THEN** the tile's `group` node is the same object
  reference in both scenes
- **AND** the reconciler emits zero draw ops for that tile

#### Scenario: Flip has no imperative redraw

- **WHEN** the project compiles
- **THEN** `flipGame.redraw`, `flipGame.setTileSize`,
  `flipGame.newDrawState`, and `FlipDrawState` are absent
- **AND** the midend dispatches Flip through the `scene` path
