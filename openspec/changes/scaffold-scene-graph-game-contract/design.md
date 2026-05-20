# Design: scene-graph `Game.scene()` contract

This is a long-form design sketch. No implementation in this change;
follow-up changes do the work in two stages.

## The shape

```ts
interface Game<...> {
  // Today (imperative — stays for backward compatibility):
  redraw?(dr, ds, prev, s, dir, ui, animTime, flashTime): void;

  // New (declarative — pure function of state to scene description):
  scene?(s: State, ui: Ui, animTime: number, flashTime: number, prev?: State, dir?: number): Scene;
}

// A Scene is a list of nodes, each with a stable id, drawn in order.
type Scene = SceneNode[];

type SceneNode =
  | { kind: "rect"; id: string; x: number; y: number; w: number; h: number; fill: number; }
  | { kind: "line"; id: string; from: Point; to: Point; colour: number; thickness?: number; }
  | { kind: "polygon"; id: string; points: Point[]; fill: number; outline: number; }
  | { kind: "circle"; id: string; centre: Point; radius: number; fill: number; outline: number; }
  | { kind: "text"; id: string; origin: Point; text: string; options: DrawTextOptions; colour: number; }
  | { kind: "group"; id: string; clip?: Rect; transform?: { dx: number; dy: number }; children: SceneNode[]; };
```

`id` is a string the game picks for **stable identity** of a node
across frames. Examples: `"tile-3,4"`, `"hint-outline-3,4"`,
`"grid-h-12"`. The reconciler uses ids to match old vs. new nodes.

Where the game today writes:

```ts
if (ds.tiles[i] !== vv) {
  drawTile(dr, ds, s, x, y, v, vv === 255, anim);
  ds.tiles[i] = vv;
}
```

…it would instead emit:

```ts
{ kind: "group", id: `tile-${x},${y}`, clip: tileRect, children: tileNodes(s, x, y, ...) }
```

…with no manual cache and no `ds`. The reconciler diffs the new
group against the previous frame's group with the same id, and:

- If the entire serialised group is byte-equal, skip — no canvas
  writes for that tile this frame.
- Otherwise, draw the new contents inside the group's clip (with
  the old contents cleared to the parent group's bg, or to palette
  index 0 at the root level).

## Why this kills the bugs that hit Flip

- **Bug-1 (black canvas on reshape) wouldn't have happened.** The
  reconciler tracks "I have NO previous scene for this canvas" as
  its initial state. After `canvasCleared`, previous scene is
  discarded; the next reconcile sees every node as new and paints
  them all, including the bg root rect. There's nothing the game
  needs to remember to invalidate.
- **Bug-2 (everything flickers) wouldn't have happened.** Without
  a manual per-tile cache, there's no "wipe cache on size()" to
  get wrong. The reconciler decides on every frame what changed by
  comparing scenes; if nothing changed, no canvas writes; if
  something changed, only that node's bounds are touched.

## Animation

The current model passes `animTime`, `flashTime` to `redraw` and the
game interpolates inside. Scene-graph can keep the same shape:
`scene(s, ui, animTime, ...)` is called per frame; the game returns
the right scene for that animTime. The reconciler still diffs and
emits minimal writes.

Optional later refinement: animatable nodes (`{ kind: "tween", from:
node, to: node, t: 0..1 }`) where the reconciler handles the
interpolation. Defer until at least two games actually need it.

## Blitters

Upstream's `blitter_save` / `blitter_load` (save a canvas region,
restore it later) doesn't fit a scene-graph model. Two options:

1. **Replace with z-ordered nodes**: a "saved region" becomes a node
   high in z-order that the reconciler positions; restoring it is
   removing the node. For most upstream uses (cursor overlay,
   drag-preview) this works.
2. **Keep blitters as an escape hatch**: games that genuinely need
   them can keep using `redraw`. The opt-in nature of `scene` makes
   this OK.

For Flip (no blitters): N/A. For Loopy / Mines (which use blitters
in C): we'd evaluate per-port.

## Migration path

1. **Land the reconciler + primitives** (own openspec change). At
   least one game (Galaxies, likely) migrates as part of that
   change to prove the contract.
2. **Subsequent ports may implement `scene` instead of `redraw`.**
   Backward compatibility: the midend supports both. Games that
   don't define `scene` use `redraw`.
3. **Eventually**: imperative `redraw` is deprecated, then removed.
   But not before every shipped port has migrated. The user said
   "no imperative components" — that's the *destination*, not a
   precondition.

## Performance notes (informed guesswork, not validated)

- The reconciler does a single linear sweep through the scene list,
  comparing each node to its predecessor by id. Worst case
  O(nodes). For Flip's 5×5 = 25 tiles, this is negligible. For
  Untangle's hundreds of edges per frame, still fine if
  comparisons are shallow.
- The expensive part is canvas writes — and we already skip those
  for unchanged nodes (the manual cache today does the same).
- Scene-list allocation per frame is the cost added by the new
  shape. For a 50×50 grid that's 2500 objects per frame at 60 Hz
  → 150k objects per second. That's borderline; we'd want to
  measure before committing. Optimisations available if it
  bites: reuse scene-node objects across frames, or use a flat
  typed-array encoding for the common cases.

We won't *know* until we measure. The migration plan keeps the
imperative path as a fallback if scene-graph turns out too slow
for a specific game.

## What this is NOT

- Not React. The game returns a scene; there's no JSX, no hooks,
  no component lifecycle.
- Not SVG. The reconciler still writes to the canvas 2D context.
  SVG might be a future option for some games, but not what this
  proposal is about.
- Not a virtual DOM with a generic reconciler library. A small
  in-repo reconciler specific to our scene-node shape is enough.
  ~200 lines.

## Open questions

- Is the scene returned by value or built into a passed-in
  builder? (Value is simpler; builder lets us avoid intermediate
  allocations.)
- Does the reconciler memoise unchanged subtrees (referential
  equality), or always deep-compare? Memoisation favours pure
  state-derived scenes; deep compare is simpler but slower.
- How does the cursor (UI state that overlays the board)
  interact with the per-tile groups? Probably its own
  z-ordered node.

These get answered in the implementation change, not here.
