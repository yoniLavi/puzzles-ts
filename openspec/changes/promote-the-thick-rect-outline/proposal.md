# promote-the-thick-rect-outline

**Readiness: ready.** `re-express-the-collection`'s batch B4, and the part of it
that survived reading.

## The finding

**Eight games hand-rolled the same drawing primitive** — a rectangle outline
`thickness` pixels wide, drawn as four filled rects. It is upstream's
`*_draw_err_rectangle`, and here it is the "this is wrong" frame:

| Form | Games |
| --- | --- |
| `thick = ts/10`, inset by `ts/20` | bricks, crossing, unruly |
| `thick = ts/7`, inset by `ts/20` | clusters, sticks |
| `thick = max(1, ts/16)`, flush to a span | magnets, tents |
| thickness passed in, flush | pattern (already a private helper) |

`engine/draw.ts` already carries the precedent, in as many words:
`drawRectCorners` was *"promoted from seven byte-identical private copies … when
Crossing would have been the eighth."* This is the same shape at eight.

**What stays with the game** is the two things it actually chooses — how thick
the frame is, and whether it is inset from the cell. Those are style, and they
differ for reasons a reader can defend. The four `drawRect` calls are not.

## What B4 declined, and why

The batch was measured at eight clone pairs across the render layer. Most were
declined by `border-grid.ts`'s test — *would a change here have to happen in
both games at once?*

- **clusters ~ sticks, the cursor frame** (four rects, `t = ts/12`): declined
  for now. It is the same primitive, but the two draw it in a third emission
  order and it is genuinely a *cursor* mark rather than an error mark; folding
  it in would mean deciding that the cursor frame and the error frame are one
  thing, which is a design question, not a duplication.
- **clusters ~ sticks, the paint-while-traversing arm** (13 lines in
  `index.ts`): declined. `pointer.ts`'s own doc comment already rules on this —
  *"What a game does while the cursor moves is its own verb and stays in the
  game: Tents paints as it traverses, Boats drags a fill along with it."*
- **inertia ~ sokoban, undead ~ unequal, map ~ tents, group ~ towers,
  bricks ~ unruly, keen ~ towers**: declined. These are the shape
  `border-grid.ts` warns about explicitly — *"a loop over `w*h` that reads a
  flag and draws a line resembles its counterpart in any grid game in this
  collection; unifying that would couple two renderers with no reason to move
  together."*

So B4 takes one pair-cluster of eight and declines six. That is the expected
ratio for this batch and was predicted in `survey.md`.

## What the promotion exposed

Wiring the helper into all eight and then **deleting a whole side of the frame
failed exactly one test in the collection** — Crossing's. Seven of the eight
draw their error or mistake frame in a path no snapshot reaches: Tents' and
Magnets' render-scenario snapshots contain **zero** mistake ops.

That is why the helper ships with its own test at its own level, asserting the
painted ring by pixel coverage rather than by op order. A primitive eight games
share should not depend on one game's frame happening to be observed.

## Impact

- Affected specs: none.
- Affected code: `engine/draw.ts` (+ its test), eight games' `render.ts`. Net
  **−32 lines** in the games.
- **Player-invisible.** Every call site passes the identical rect and thickness
  its inline code computed — verified algebraically per game. Three games
  (magnets, pattern, tents) emitted their four rects in a different order and
  now use the shared order; all four rects are one color, so the composited
  frame cannot change, and no snapshot moved.
