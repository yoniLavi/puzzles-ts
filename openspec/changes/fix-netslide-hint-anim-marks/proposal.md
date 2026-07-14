# Fix the Netslide hint marks during the slide animation

## Why

Owner-reported (2026-07-14): the hint's two marks sit correctly on the still board,
and then **both jump a cell the moment the slide starts**, snapping back when it
ends. Two separate causes, which the fix has to pull apart — the marks mark
different kinds of thing:

1. **The tile mark marks a *tile*, and the tile is moving.** A step's marks index
   the board the step was computed against, and while the hinted slide animates that
   is the board we have just left: the midend advances the plan when the animation
   *ends* (`settleHint`), so the displayed step is still the one being played and its
   `tile` field still names the cell the tile set off from. Marking that cell
   highlighted whatever tile had *slid into* it — a different piece, drawn at the
   animation's offset.

2. **The destination mark marks a *cell*, and cells do not move.** It was drawn
   inside `drawTile`, whose whole job is to draw a tile *where the tile currently
   is* — so when the destination cell lay on the moving line (exactly the case in the
   owner's screenshot: source and destination both in the slid column), the outline
   slid along with it.

## What Changes

- `redraw` resolves **which cell of the board being drawn holds the hinted tile**: it
  is `landing` while that step's own slide is animating, and `tile` otherwise (a
  continuation leg the midend already advanced to was computed against this board).
  The mark then rides the tile for free, since a tile on the moving line is drawn
  shifted.
- The destination/landing outlines move out of `drawTile` into `drawHintTargets`,
  drawn **after every tile, at the cell's own unshifted position** — which also stops
  a tile sliding across the cell from painting over the outline. The outline bits stay
  in the cache word: that is what repaints the tile *under* a stale outline when the
  hint moves on.

## Impact

- Specs: `netslide` — the hint-render requirement gains the two animation rules.
- Code: `src/native/games/netslide/render.ts`; tests in `netslide-hint.test.ts`
  (a mid-slide frame, asserting each mark's drawn position); one render snapshot
  re-baselined (pure paint-order change — same rects, same coordinates, drawn last).
- Docs: `docs/porting/hint-authoring.md` — the tile-vs-cell mark rule, which is
  cross-game (every animated game with a hint overlay has it).
