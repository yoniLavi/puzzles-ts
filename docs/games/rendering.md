# Rendering

How a game paints: the redraw contract and its doctrine, the per-tile cache,
overlays, drag previews and blitters, animation and flash, and the color
palette. This is one file of the [`docs/games/`](./README.md) set; input
(gesture semantics) is [`input.md`](./input.md), hint painting is
[`hints.md`](./hints.md), and the in-process render test harness is
[`testing.md`](./testing.md).

Authoritative specs:
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) (the `GameDrawing`
contract; the repaint/animation requirement, which also owns the
no-pixels/`canvasCleared` doctrine) ·
[`repo-layout`](../../openspec/specs/repo-layout/spec.md) (in-process render
verification). Exemplar to read end-to-end:
[`galaxies/render.ts`](../../src/games/galaxies/render.ts).

## The rendering doctrine

**The engine paints no pixels of its own.** Every visible pixel comes from a
game's `redraw`; each game fills its own background in its `!ds.started`
branch. **`Midend.size` is side-effect-free**, and **`canvasCleared()` is the
only cache-stale signal** — the worker adapter calls it when the canvas
backing store is genuinely recreated, and nothing else may invalidate a draw
state. The midend repaints on every transition and drives the
animation/flash timer; a game never schedules its own frames.

These four sentences are the survivors of Flip's three-iteration rendering
story (`AGENTS.md`, "First game port"): mirroring `midend.c`'s
`first_draw`/recreate-drawstate-in-`size()` too literally caused
ResizeController-driven cache wipes, and an unconditionally-accumulated
`flashTime` fired the solve celebration on every animated move. The owning
requirement is `ts-engine` § "The midend repaints on every transition and
drives animation" — link it, don't restate it.

**Full-vs-incremental redraw is the game's own policy.** The engine imposes
neither; upstream didn't either. In practice every game with per-cell state
uses the tile cache below, because a full repaint per frame is visibly slow on
large boards and the cache is what makes overlays correct.

## The tile cache and the diff key

This is the most-cited discipline in the tree. The shape: the draw state
holds one packed word per tile of *what the canvas currently shows*; each
frame computes what the tile *should* show, repaints only on mismatch, and
records what it painted.

**Pack the key into an `Int32Array`, never a `BigInt64Array`.** `BigInt` is
hot-path-expensive and idiomatically wrong here. When the bits run out, do not
widen — move the overflow into an overlay sidecar (below) or a second parallel
array. Exemplars: [`galaxies/render.ts`](../../src/games/galaxies/render.ts),
[`range/render.ts`](../../src/games/range/render.ts).

**When the candidate set alone exceeds ~26 bits, keep two parallel cache
arrays rather than packing digit and pencil bitmap into one word.** Keen packs
`digit | pencil << 16` because its order ≤ 9 leaves room; Solo's order can
reach 31, so a 5-bit digit plus an order-wide pencil mask overflows a single
`Int32`. The answer is a per-cell pair — a `tiles` word and a `pencil` word
compared together (a `1<<n` mark for `n` up to 31 still fits, sign bit and
all). Exemplar: [`solo/render.ts`](../../src/games/solo/render.ts)
(`SoloDrawState.tiles` + `.pencil` + `.wrong`).

### Overlay sidecars

**Every overlay that doesn't live in the tile value MUST be in the diff key —
or it silently fails to repaint.** A mistake/hint/highlight overlay is applied
*on top of* a cell, so it usually isn't part of the packed tile value. If it
isn't *also* compared in the cache-miss branch, it repaints only when the
cell's tile coincidentally changed that frame — and Check & Save (or a hint)
runs a frame *after* the move that drew the cell, so the overlay **never
shows**. Towers shipped exactly this: `ds.wrong` was passed to `drawTile` but
left out of the diff condition, and Check & Save highlighted nothing.

**Never hand-write the two-array dance.**
[`overlay-sidecar.ts`](../../src/engine/overlay-sidecar.ts)
(`OverlaySidecar`) owns repack/stale/commit for *any* overlay. Give each
overlay its own instance on the draw state, then per frame: pack it once, use
`ds.<overlay>.stale(i)` as a clause of the cache-miss test, hand
`ds.<overlay>.packed[i]` to the cell painter, `ds.<overlay>.commit(i)` after
drawing. Three pack entry points, by the shape of what you have:

| You have | Call | Exemplar |
| --- | --- | --- |
| A hint step's `highlights` (`area`/`targets`/`marks`) | `pack(step?.highlights, indexFn, markBitsFn)` | the candidate-family renders, e.g. [`towers/render.ts`](../../src/games/towers/render.ts) |
| A `findMistakes` cell list | `packCells(mistakes, indexFn)` | `towers/render.ts` `ds.wrong` |
| An overlay with its own topology | `clear()` + `add(i, bits)` | [`galaxies/render.ts`](../../src/games/galaxies/render.ts) `ds.wrongEdges` — one wrong wall is a *shared* edge, so it lights a different bit in each of the two tiles it separates |

### Moving a cue out of the key's channel is how the key loses it

**A cache key names inputs, so changing how a cue is *rendered* can silently
drop it from the key.** Crossing's clue panel has its own cache
(`ds.numberState`) beside the tile cache, and "held" was originally a color
class — `colorClass` returned `3`, the key was `colorClass(l)`, and held was
covered for free. Turning held from a color into a **box** moved it out of that
channel: the class return was deleted and `heldOf` was passed to the painter as
a separate predicate, so nothing in the key mentioned it. Picking a clue up then
painted the box exactly once, on a cold draw state, and never again — nor erased
it. Every test missed it because they all build a draw state per frame.

Two things generalize. **When a cue stops being expressed as something the key
already reads, it needs its own term in the key** — and the diff is small enough
to look innocent, because the paint is plainly still there. And **the stale
comment is what hid it**: `CLASS_COLOR` kept an unreachable entry labeled
`3 held`, which reads as though held were still a class. A key's comment is a
claim about coverage; when you take a class out, take its label out in the same
edit. Exemplar: [`crossing/render.ts`](../../src/games/crossing/render.ts)
(`panelState`).

**The test has to reuse a draw state.** A frame-per-draw-state test meets a cold
cache every time and cannot observe a missing key term at all — § "Prove the
overlay repaints" below is the same discipline aimed at the tile cache.

### A packed diff key runs out of bits, and dead flags are where the next one comes from

**A game that packs every overlay into one `Int32Array` word has 31 usable bits
and no warning when they are gone** — bit 31 is the array's sign. Slide reached
exactly full: eleven flags, two eight-bit shape fields, four gate borders. The
next overlay cannot simply be `<< 27`.

Before widening, **audit the flags for one that is written and never read**.
Slide's `BG_NORMAL` was set on every non-target square and tested nowhere,
because `drawTile` asks `val & BG_TARGET` and takes the floor as the `else` — a
bit spent saying nothing, and the bit the keyboard cursor now uses. This is the
Method section's "what would have to break for this to matter?" aimed at a
bitfield, and it is worth one grep before any restructuring: a flag that appears
exactly twice (its definition and one `val |=`) is dead.

When there genuinely is no dead flag, **widen the key rather than squeezing** —
it is a repaint cache, not a wire format, so nothing outside the renderer
constrains its type. Do it as a deliberate step and say so in a comment, because
the failure mode of getting it wrong is silence.

### Prove the overlay repaints

**A cold-frame test proves nothing about an overlay.** On frame 1 every cell
misses the cache anyway, so an overlay missing from the diff key still paints.
The **hint** overlay is guarded cross-game by
[`hint-overlay.test.ts`](../../src/engine/hint-overlay.test.ts) (warm the
drawstate, display a hint, assert the same drawstate emits paint ops) — every
game in [`testing/hint-games.ts`](../../src/engine/testing/hint-games.ts) is
covered automatically. The **mistake** overlay still needs a per-game
paint-twice test (a mistaken board can't be built generically): paint, run
`findMistakes()`, redraw the *same* drawstate, and assert the highlight
appears on the **second** paint — ideally also that a third frame without the
overlay erases it. Exemplars: `towers.test.ts` ("highlights a mistake even
when the cell was already drawn"), `galaxies.test.ts` ("recolors a flagged
wall on a board that was already drawn").

**Assert the settled frame paints nothing, first.** The overlay frame's op
count only means something against a frame that emitted zero — otherwise a game
that repaints unconditionally (Loopy repaints its whole canvas every frame)
passes the test while proving nothing about its cache. Warm, redraw once more,
assert *that* frame is empty, and only then turn the overlay on.

**The bug is only expressible where the overlay is handed to the painter
*beside* the key.** A game that folds its overlay bit into the packed tile value
— `if (mistakeSet.has(i)) f |= DS_MISTAKE` — cannot omit it from the diff test,
because the key *is* the diff test. The class lives in the sidecar games and in
hand-packed side channels (Galaxies' wall mask), which is where the stale clause
has to be. Measured 2026-09-09 across all 57 games
(`openspec/postmortems/2026-09-09-tile-loop-inversion-withdrawal.md`): all 38
whose `redraw` takes a `mistakes` parameter route it correctly, so the class has
no live instance today — but it shipped twice before, and a new game reaching
for a sidecar is reaching for the one shape that can still get it wrong.

## Drag previews and blitters

### A simulated-release preview lives in `moves.ts`

**A drag game whose `redraw` previews the in-progress drag by simulating the
release move must keep move application in a separate module.** Upstream
`game_redraw` for such a game (Signpost; Untangle earlier) draws the state
that *would* result — so `render.ts` needs `executeMove` plus the
release-move helper, and if those live in `index.ts`, `render ↔ index` is an
import cycle. Split them into a small `moves.ts` both import. Exemplar:
[`signpost/moves.ts`](../../src/games/signpost/moves.ts).

### `changedState` cancels a dangling drag

**A drag preview names a piece on the board, and the board can change while
the pointer is still down** — an undo from the rail or the keyboard mid-drag.
Upstream's `game_redraw` `assert`s the simulated move succeeds, so that
sequence is a thrown error in a naive port. Cancel the drag in `changedState`
(a bare `UI_UPDATE` never reaches that hook, so the live gesture is unharmed)
and make the preview fall back to the plain board rather than throwing.
**Tell:** a `redraw` that calls the game's own move helper on `ui` state and
can't handle "no". Exemplar:
[`slide/index.ts`](../../src/games/slide/index.ts) (`changedState`).

**A keyboard arm is the same bug with a longer window.** A pointer drag ends
on the release; a gesture armed by Enter and fired by a later arrow can sit
armed across any number of presses, so it meets far more state changes. Pegs'
`curJumping` remembered a *peg*, checked the direction at fire time and took
that peg on trust — an undo left it aimed at a hole, and `executeMove` rejected
the player's keypress with a thrown error. The population was read in full:
Bridges, Map, Rect, Sixteen, Spokes and Tracks all arm across presses and all
are safe, each for one of the two reasons in
[`engine/game.ts`](../../src/engine/game.ts) (`changedState`'s doc) — what they
remember is fixed geometry, or the fire re-derives it. **So the question is
never "is this a drag?" but "can a state change make what I am holding
false?"** Exemplar: [`pegs/index.ts`](../../src/games/pegs/index.ts)
(`changedState`), with the repro in `pegs-midend.test.ts`.

### A pointer-following overlay must erase everything it painted

**An overlay drawn outside the per-tile cache owns its own cleanup, in
full — and partial invalidation is the smear bug.** Galaxies' original
drag arrow was drawn at raw pixel positions after the tile loop and
invalidated only the single tile under the pointer: every other tile the
arrow spanned kept a stale frame, the mirror arrow's tiles were never
invalidated at all, and ink that landed outside the board could *never*
be erased (the border repaints only on first-draw). The result read as
"continuous rendering" but was accumulated garbage — owner-reported with
a screenshot, 2026-08-08. Before drawing anything pointer-positioned
outside the cache, ask what erases it, tile by tile, including off-board
pixels; the safe default is to **snap the preview into cells** so the
cache's own repaint is the eraser (see the aim-style drag in
[input](./input.md) § "Other drag shapes"). Exemplar:
[`galaxies/render.ts`](../../src/games/galaxies/render.ts) (the
`overlay` sidecar; the closing comment of `redraw` records the trap).

**The same file had a second one, and its color was hiding it.** Galaxies'
half-grid keyboard cursor — the mark on a vertex or an edge, as opposed to the
tile-center cursor that was already a key bit — was drawn after the tile loop
with a bare `drawRect` and left a mark at *every* vertex and edge it visited.
Nobody had reported it in the two years the port has existed, because the
cursor was painted in a near-invisible tint of the board; fixing the color is
what exposed it. Two things generalize. **Sweep for the whole class when you
find one instance** — grep the file for paint outside the cell loop, not just
the overlay you were sent to fix. And **"I can't see it" and "it is broken"
are frequently the same report**: a low-contrast affordance is also an
unreviewed one, so its rendering bugs accumulate undisturbed.

**Folding a half-grid overlay in is the same trick the dots already use.** A
mark on a vertex or an edge straddles up to four tiles, which sounds like it
needs a blitter and does not: give each tile a bit per subcell position of its
own 3×3 block and let each paint its clipped share, exactly as a game already
does for dots that sit on tile corners. Galaxies packs the drag preview plane,
the cursor position and the drag's candidate rings into one `OverlaySidecar`
word for this reason.

### A transient affordance needs an authored color

**A color derived from the board cannot be prominent against the board — in
either scheme.** Galaxies' cursor was `[min(r × 1.4, 1), g × 0.8, b × 0.8]` of
the background, a faithful port of upstream's idiom, which on this app's
`#d5d5d5` board is `#ffaaaa`: a pale pink, one pixel wide. And because it is
*computed* rather than authored, dark mode adapts it by calculation, so it
comes out a faint tint there too — the failure mode `hand-author-dark-palette`
recorded for Light Up, arrived at from the other direction. The drag preview
had inherited it, and the owner reported both as unreadable in both schemes.

Reach into [`color/palette.ts`](../../src/engine/color/palette.ts) for a
*meaning* instead — `CURSOR` for the keyboard cursor (green, because most
boards are grays and blacks and whites), `DRAG_ADD` for "let go and this is
laid". Those are authored per scheme. Keep board-relative derivation for what
it is good at: fills, grids and shades that are *supposed* to sit close to the
board.

### A cursor is usually a cache key, not a blitter

**A C *cursor* blitter usually shouldn't become a TS blitter.** Upstream
often blitter-saves the pixels under the keyboard cursor so it can draw it
anywhere without dirtying the cell cache. When the cursor sits inside a cell
(or a sub-cell slot), the simpler faithful translation is to fold the cursor
position into that cell's packed key and draw the cursor marks in the cell
repaint — the old cell repaints when the cursor leaves (its key changed), no
save/restore needed, and the recording double sees real ops instead of
blitter no-ops. Reserve actual blitters for sprites that cross cell
boundaries mid-drag (Pegs' and Signpost's drag sprites). Exemplar:
[`subsets/render.ts`](../../src/games/subsets/render.ts) (upstream's
`draw_rect_corners` blitter cursor as a `cursor-slot` field of the cell key).

**The exception: a cell repaint that deliberately doesn't clear the whole
cell.** Folding the cursor into the key only erases it because the repaint
paints over where it was. Spokes' repaint clears a plus-shape, leaving its
corner squares for a second pass that owns the diagonal through the
four-cell meeting point — and the cursor's diagonal offsets land in exactly
those corners. There the blitter is right, and costs nothing testable: the
recording double no-ops only `blitterSave`/`blitterLoad`, so the cursor's own
draw ops are still asserted. Check what your cell repaint actually clears
before applying the default. Exemplar:
[`spokes/render.ts`](../../src/games/spokes/render.ts) (the corner protocol
is in its module header).

## A press preview must not look like a commit

**If a transient press/preview overlay is visually indistinguishable from a
committed state, a press that doesn't commit reads as a glitch.** Mines'
mouse-down chord highlight was drawn identically to an opened cell — faithful
to upstream — so a plain left-click on an unsatisfied number flashed a false
"uncover" that reverted on release, read by the owner as "uncovered blocks
re-covered". The fix decouples preview from intent: a left press keeps the
chord semantics but drops the preview, while the deliberate chord gesture
(middle / Shift+left) keeps it. Make the preview distinct, or suppress it on
the gesture that usually won't commit. Exemplar:
[`mines/render.ts`](../../src/games/mines/render.ts) (design D11 in the Mines
change).

## When two games share a mechanic, they share its look too

**A renderer is shareable when the thing it draws is a shared *mechanic*, and
not when it merely resembles another renderer.** Those read the same and are
not: the second is true of almost any grid game here.

The worked example is [`engine/border-grid-render.ts`](../../src/engine/border-grid-render.ts),
which Palisade and Separate both draw through. What moved is the mechanic's own
look — the error model over its two DSFs, the half-grid cursor whose *movement*
`border-grid.ts` already owned, the four edge rects keyed off its border bits,
and the tile skeleton around them. What stayed is each game's clue layer:
Palisade's digit and hint marks, Separate's letter and region shading. The
shared code takes each game's palette indices and a `drawContent` callback and
never asks which game it is drawing.

Three things that generalize:

- **A callback is the honest shape when order is the point.** Content goes under
  the edges, and the clip / unclip / `drawUpdate` bookkeeping wraps all of it.
  Exporting three steps instead would put that bookkeeping back in both games,
  which is exactly what drifts.
- **The diff key is part of the shared contract.** Both games pack their tile
  flags into one `Int32Array` cache; unifying the *bit layout* was free only
  because those flags are draw state — rebuilt by `newDrawState`, never in a
  desc or a save. Check that before unifying a cache key, and reserve the game's
  own bits above a named floor so the two can grow apart without colliding.
- **The proof is a byte-clean snapshot, not a green suite.** A pure extraction
  must leave every draw call, argument and order identical, and tier 2.5 records
  exactly that — 225 and 237 ops here, unchanged. If a snapshot needs `-u`,
  pixels moved and the extraction is wrong.

### Sharing a *primitive* is a different, smaller move

`border-grid-render.ts` shares a mechanic's whole look. `engine/draw.ts` shares
single shapes — the recessed frame, the raised tile bevel, the thick error
frame, the corner brackets — and three of those were promoted only after six,
seven and eight games had each written the vertex arithmetic out. **A shape any
other game also draws belongs there**, and unlike a mechanic it needs no
callback and no shared cache key: it takes a rect and colors and draws.

Three things learned promoting the last two
(`unify-the-raised-tile-bevel`, `promote-the-thick-rect-outline`):

- **Check whether the *dimensions* were drifting too, not only the shape.** The
  six raised-tile games had four thickness formulas, so one idiom read 1px in
  Fifteen and 3px in Mines at the same tile size. `raisedBevelWidth` ships
  beside `drawRaisedBevel` for that reason. Splitting the extraction (no pixels
  move) from the sizing fix (pixels move) into two commits is what makes the
  second one reviewable.
- **A byte-clean snapshot is only evidence if something is watching.** Deleting
  a whole side of the error frame, with the helper wired into eight games,
  failed **one** test in the collection. Break the helper deliberately and see
  what goes red before you believe an unchanged snapshot.
- **The games may disagree on something the survey didn't measure.** Here it was
  *vertex order inside the polygon* — three orders across six games. Winding is
  invisible in the painted frame but a snapshot records the points array, so
  "changes no draw call" was achievable for only the largest group; the rest
  moved to the commit where a moved recording was already expected.

## Bespoke board geometry, draw side

Some games store an odd-shaped board in a padded rectangle and shear it on
draw (Bricks' hexagon: each row offset rightward by half a tile per row). The
state/coordinate half — the bounds mask, the neighbor table, the inverse
pointer transform — is logic and lives with
[`mechanics.md`](./mechanics.md) § "Bespoke geometry". On the draw side:

- **Force the tile size even** (`ts & ~1`) in *both* `computeSize` and
  `setTileSize`, so half-tile shears are exact.
- **The shear/origin/bevel choices are display** — match the look, keep the
  code clean; they were never in byte-parity scope.
- **An SVG dump is the fastest shear check**: `toSvg` a `renderScenario`
  frame and rasterize it (see [`testing.md`](./testing.md)); a wrong offset
  shows instantly as a staircase, where at 1× a missing hairline is easy to
  miss.

**Render asks; move code decides.** Any rule the input and the display both
need is one function, called by both — coordinates are only the obvious case.
Crossing colored each clue by which run a click would send it to, with the
rule written twice (a helper for the click, an inline loop in `redraw`); they
agreed until the rule got a tie-break, and then the list said "down" while
the click put it across. Delete the copy: `redraw` now asks `runForNumber`.
**Tell:** a predicate in `redraw` that answers what a *move* would do.
Exemplars: [`bricks/render.ts`](../../src/games/bricks/render.ts) +
[`bricks/index.ts`](../../src/games/bricks/index.ts) (shared `offsets`),
[`crossing/state.ts`](../../src/games/crossing/state.ts) (`runForNumber`).

## Special paint shapes

### A clue-ring erase must not wipe the grid

**Games with a margin of clues repaint one clue tile at a time — and on one
edge, the grid's outermost border line lands on the clue tile's first
pixel.** A tidy symmetric erase wipes it. That is why upstream's four
per-side erase rects look gratuitously inconsistent (Salad's right-clue erase
is inset where the other three sides aren't): **the asymmetry is
load-bearing; do not fold the four sides into one uniform rect.** Salad
shipped exactly that tidy-up and lost the right-hand border of every clued
row — visible only on the edge, only for clued rows, reading as an
anti-aliasing artifact. Pin the *invariant* ("no clue-tile erase overlaps the
grid's outline box"), not the pixel offset, so a different fix still passes.
Exemplar: `salad-render.test.ts` ("does not let a border clue's erase wipe
the grid's outline").

### Negative-space grids

**Some games draw their grid lines as negative space — don't "add" the lines
you can't find.** Rome's `game_redraw` contains no line-drawing at all: the
first frame floods the canvas with the border color, and every square paints
its own background rect inset by one pixel everywhere, and further on each
side that meets a different region. What survives the fills *is* the grid. A
port that "helpfully" strokes the boundaries will double-draw; the *inset* is
the thing to assert in a tier-2.5 test (compare a square whose neighbor
shares its region against one whose doesn't and expect a wider rect), not a
line op that does not exist. Exemplar:
[`rome/render.ts`](../../src/games/rome/render.ts) + `rome-render.test.ts`
("insets a square's fill on each side that meets a different region").

### Display state in a narrow type

**A display-only value stored in the wrong type is a bug you may just fix.**
Byte-parity rules were about the generator/solver/codec; on the drawing path,
deliberate visual improvements are the point of the fork. Crossing's C
declared `bool flash` and assigned a nine-phase frame index to it, collapsing
its completion animation to a static color shift — the fix is one type, and
a tier-2.5 test that two flash phases paint differently pins it (a snapshot
alone won't tell you the animation is *moving*). Seismic widens the tell to
plain data: its C assigned a 9-bit pencil mask to a `char`, so a penciled 9
was truncated away and never drawn. **Tell:** a frame counter, phase index or
animation step stored in a `bool`/`char`; any bitmask copied into a narrower
local before use. When the exposing input is one the generator never produces
(no generated Seismic board has a nine-cell region), hand-build the board
through the game's own codec for the regression test — which also proves the
input is reachable in play. Exemplar:
[`seismic/render.ts`](../../src/games/seismic/render.ts) + `seismic.test.ts`
("draws every pencil mark, including a 9").

## Animation and flash

**The contract:** `animLength(a, b, dir, ui)` and `flashLength(a, b, dir,
ui)` return durations; the midend runs the timer and calls `redraw` with
`animTime`/`flashTime`; the game interpolates. A non-animated transition
paints once; animation frames — including the first — are driven by the
timer (`ts-engine` § "The midend repaints on every transition and drives
animation").

**Most win flashes are one shared line.**
[`flash.ts`](../../src/engine/flash.ts) (`winFlash`) encodes the convention
— flash exactly `flashTime` when a **player move** brings the board into a
solved state. Every game's state spells the two flags `completed` and `cheated`
(`ts-engine` § "One completion vocabulary across games"), so `winFlash` reads
them as a contract, and **a differently-spelled flag is not a reason to write
your own `flashLength`** — it is not a difference a player can see.

**What is suppressed is the Solve *command*, not a cheated *board*.** Solve is
exactly the move where `cheated` flips false→true. A player who uses Solve,
unmarks some cells and then finishes by hand has won, and gets the celebration;
the cheat record lives in the status bar and the midend's "solved with help".
That rule came from Palisade, which had it right first and reported the bug;
`winFlash` adopted it rather than the reverse.

Reaching that case needs `completed` **recomputed** each move rather than
latched once. Almost every game latches it today, so for them this behaves
exactly as the older, stricter condition did; Palisade and Separate recompute.
Un-latching the rest changes `status()`, and with it the end-of-game dialog and
the clock, so it is per-game work rather than a sweep.

Call it:

```ts
flashLength: (a, b) => winFlash(a, b, FLASH_TIME),
```

A **genuinely bespoke flash condition** does keep its own `flashLength`, and
`flash.ts` lists every survivor with its reason so the list cannot quietly grow.
The four shapes that qualify:

- **more than one flashing outcome** — Samegame (won *and* stuck), Flood (won
  *and* lost), Inertia (died *and* collected the last gem), Blackbox (a reveal,
  which is not a win);
- **a duration that is not the shared one** — Ascent, Net and Netslide scale
  theirs by the board so the animation sweeps it;
- **a condition that is not "became solved"** — Mosaic reads its own clue
  counters, Map takes its duration off the `Ui`, Pegs and Sokoban have no cheat
  flag to test;
- **`completed` is not a flag** — Fifteen, Sixteen, Twiddle and Slide hold the
  move count they were solved at, frozen so the status bar stops counting.

Dominosa is the near-miss worth knowing: its *condition* is the convention, so
it calls `winFlash` and then does its one extra thing (clearing the hovered-pair
highlight) with the answer, rather than restating the condition to get there.

**Flash isolation is a midend concern the games inherited the hard way**:
Flip's solve celebration once fired on every animated move because the midend
accumulated `flashTime` unconditionally. If a flash overlay appears where it
shouldn't, suspect the *armed/settled* state machine before the game's
condition — and keep a flash-overlay-isolation test (Flip has one).

## Sizing

`computeSize(params, tileSize)` is the pure size function;
`setTileSize(ds, tileSize)` tells the draw state the chosen size so
`interpretMove` coordinate mapping and `redraw` agree; `preferredTileSize` is
the baseline (default 32). The midend creates the draw state and applies
`setTileSize` in one step (`Midend.freshDrawState`), and calls `setTileSize`
again whenever a new tile size is picked; `Midend.size` is informational and
side-effect-free (see the doctrine above). Because those two are paired, a
game's `redraw`/`interpretMove` is handed a draw state that is both non-null and
sized — so no `if (!ds) return;` and no `ds?.tilesize ?? PREFERRED_TILE_SIZE`
(see [mechanics](./mechanics.md) § "interpretMove and UI_UPDATE").

*Compressed history:* the retired web build defined `NARROW_BORDERS`, so C
games with an `#ifdef NARROW_BORDERS` variant (Slant's slim border; Bricks'
`BORDER = 0`) were ported in the *narrow* variant — parity was with what the
browser actually showed, not the desktop default. If a border constant looks
surprisingly small, that is why. Exemplar:
[`slant/render.ts`](../../src/games/slant/render.ts).

## The palette: three layers, meaning first

**A game contains no color value. Not one.** Every color a game shows is a
reference into the collection's color system, or a call to a shared function
from it. Three layers, three import paths, and which one you reach for is the
decision:

- [`engine/color/palette.ts`](../../src/engine/color/palette.ts) — **the
  meanings**, and your default: `ERROR`, `ERROR_TEXT`, `ERROR_WASH`,
  `HINT_ACTION`, `HINT_EVIDENCE`, `HINT_EVIDENCE_WASH`,
  `HINT_BLACKREF`/`HINT_WHITEREF`, `CURSOR`, `HELD`, `DRAG_ADD`/`DRAG_REMOVE`,
  `FLASH`, `UNDECIDED`, `GRID_MID`, `GRID_DARK`, `PENCIL_BODY`, `INK`, `PAPER`,
  plus the background-derived functions (`pencilColor`, `playerEntryColor`,
  `highlightWash`, `lineMaybeColor`, `lineNoColor`, `clueDoneColor`,
  `wallColor`, `correctRegionColor`). Each is a *reference* to a named
  color, so restyling red restyles every meaning built on red.

  Three of these are worth naming by the mistake they replace. **The
  cursor** is `CURSOR` when it is a *mark* (a ring, outline, line or disc);
  a cursor that *fills a cell under the cell's content* is `highlightWash`,
  the "you are here" wash Solo's family draws with; and when the board has
  spent green, the collection's second choice is `PURPLE`, so a purple cursor
  reads as "the cursor, on a board that uses green" rather than as a new
  color — the doc on `CURSOR` says why. **"This clue is
  done"** is `clueDoneColor` for retired *text* and `correctRegionColor` for
  a completed *fill* — five games once encoded it five ways, from `INK` (Loopy,
  which made the distinction invisible) to a bespoke `bg × 0.85`. **The solved
  flash** is `FLASH` wherever a board flashes to a fill or line color; a bevel
  wave, a state swap or a color cycle is an animation, not a color, and keeps
  its own mechanism.
- [`engine/color/colors.ts`](../../src/engine/color/colors.ts) — **the
  palette itself**: twelve names, most at three intensities (base, `_WASH`,
  `_BOLD`), plus the distinguishability sets (`TEN`, `TEN_NAMES`,
  `EIGHT_FILLS`, `FOUR_FILLS`).
- [`engine/color/palette-games.ts`](../../src/engine/color/palette-games.ts)
  — colors a game defines **relative to its own board**, prefixed with its
  id (`slantGrid`, `undeadGhost`). Functions, not values.

Write `out[COL_ERROR] = ERROR;`. Tokens deliberately drop the `COL_` prefix
(which in this codebase means "a palette **index**"), so a game's own index
constants keep matching its C enum and the namespaces never collide.

**Reach for a meaning first. Reach past it to a named color only where the
*name* is load-bearing to the player** — a member of a set whose job is to be
told apart (`TEN`), or a color the game says out loud (Flood's hint reads
"Fill with orange"; `TEN_NAMES` is re-exported alongside `TEN` so word and
color cannot drift). If you write `out[COL_CURSOR] = GREEN` where `CURSOR`
would do, the next scheme has to rediscover that this green was a cursor.

**The escape hatch is real but narrow, and it is where sprawl grows back.** A
game whose board has *spent* the default may pick a different named color
(Spokes' cursor is `PURPLE` because green is a held hub and blue a ruled-out
spoke). **Say why, at the assignment, in one line** — on the assignment line
or the line above it, which is where
[`palette-departures.test.ts`](../../src/engine/color/palette-departures.test.ts)
looks: for every slot whose name says cursor, held, drag or hint, it requires
the role or a comment, and fails on a bare departure. Before
`consolidate-colour-palette` there were 190 named colors and seventeen
cursors; the seventeen read as seventeen decisions and were one decision plus
collisions. If nothing in the palette fits, that is an exception recorded in
`palette-games.ts` under your game's prefix, with why no meaning and no named
color serves — there is currently **one** in the collection (Unruly's tile
colors, which are bevel *bases* where near-black/near-white is headroom).
Aim to add none.

**Pick the replacement against the span of what it lands on, not against one
material — and remember the span inverts.** A cursor is clamped to the whole
grid, so it sits on every material the board has. Slide's run from the key block
and wall at the dark end to the floor and exit at the light end, which rules out
every mid-tone: teal, pink and orange all disappear against something, and
yellow vanishes into the floor outright. That argues for an *end* of the range —
except that in dark mode the ladder flips, and the wall and key block become the
**lightest** things on the board. There is no flat color at the dark end of
both schemes, which is why the tie-break is **chroma**: red against a neutral
gray wall reads at equal lightness, where a second gray would not, and red
against the blue key block is opposite in hue rather than adjacent to it.
Purple was tried first and read as a smudge on that block for exactly that
reason. This is `hand-author-dark-palette` F1's "'brightest' is scheme-relative"
seen from the other side: it applies to *darkest* too, and to any argument that
picks a color by where it sits in one scheme's ordering.

### A relative color is a named function

**A color defined relative to something is a named function in
`palette-games.ts`** — never open-coded `bg[0] * 0.9` in the game, which is
the same color decision written as arithmetic somewhere no scheme can reach.
The derived form matters more than it looks:
[`puzzle/components/view.ts`](../../src/puzzle/components/view.ts) hands the
engine **pure white** as the background in dark mode (so `background × 0.9`
derivations keep working; `resolvePalette` shifts it to a light gray before
any game sees it) and adapts the returned palette itself — so a
color that must stay legible against the board has to be a *function of the
background*, and an absolute color should be a *named* one (a named color
authors both schemes; a derivation handed pure white authors neither).

Two arithmetic traps, both of which cost a diff: `scale(c, 2/3)` is **not**
`(c * 2) / 3`, and `scale(c, 1/1.5)` is **not** `c / 1.5` — neither ratio is
representable, so pre-computing it rounds once more. Use
[`fraction(c, 2, 3)` and `divide(c, 1.5)`](../../src/engine/color/color-token.ts),
which keep upstream's *operation*.

### Black pieces stay black

**If the color means "this piece is black/white", use `BLACK`/`WHITE` from
`colors.ts`, not `INK`/`PAPER`.** Same color; the difference only shows in
dark mode — which is exactly why it gets missed. `INK` is maximum contrast
against the surface, so it inverts; a piece's black is the piece's identity,
so it is preserved (an inverted peg tells the player it is the other color).
A game that wants its black *lifted* rather than preserved (Light Up's wall,
invisible if left pure black) says so in
[`augmentation.ts`](../../src/puzzle/augmentation.ts), which wins over the
token.

### Assign the color, never a copy

**Every named color authors both schemes; a derivation authors neither.**
The dark value rides on the array as an own property, so `[...BLACK]` is the
right color with its scheme decision silently removed — and no test can
catch that in general. Consequence for `augmentation.ts`: a
`paletteOverrides` entry aimed at an index that now carries an *authored*
dark value is no longer correcting a calculation, it is fighting a decision;
four such entries were retired when the palette was authored — check yours is
not the fifth.

### Keep the C's color-enum indices

**Mirror the C color-enum indices when the game has dark-mode overrides.**
`augmentation.ts` may carry `paletteOverrides` keyed by **color index**
(Unruly preserves its tiles + bevels under dark mode); a port that reindexes
silently mis-targets them. Keep `colors()` index-for-index with the upstream
enum. Exemplar: [`unruly/render.ts`](../../src/games/unruly/render.ts).

### Every board is one tone

**The background your `colors()` receives is already the board.** The
midend's
[`resolvePalette`](../../src/engine/color/color-mkhighlight.ts) shifts the
host background off pure white and pure black (`mkhighlightBackground`) once,
before any game sees it, so every game paints the same board tone whether
its C called `game_mkhighlight` or took `frontend_default_colour` raw.
Assign `out[COL_BACKGROUND] = defaultBackground` and call `mkhighlight` only
when you want the bevel trio — it re-derives the identical background, the
shift being exactly idempotent. Before this, the collection was split 22/30
along that C distinction, invisibly in light mode and loudly in dark, where
Loopy's board resolved to `#161616` and Palisade's to `#3c3c3c` and every
raw-background game's white flash landed on its own board.
`board-background.test.ts` holds every registered game to one board.

### Highlights from a fixed base

**Highlight/lowlight from a fixed base color needs `mkhighlightSpecific`,
not `mkhighlight`.**
[`mkhighlight(bg)`](../../src/engine/color/color-mkhighlight.ts) derives
its trio from the frontend background and never extrapolates the base;
`mkhighlightSpecific(base)` extrapolates a near-extreme base toward the
opposite extreme, exactly as the C's `game_mkhighlight_specific`. Reach for
it whenever a tile color isn't the host background (Unruly's near-white and
dark-gray tiles).

### Make determined state legible

**Where upstream leaves known cells looking like undecided ones, give each
determined state its own fill** — deliberate divergence; display was never in
parity scope. Range paints a known-white cell pure white (via a dedicated
color derived from `color-mkhighlight.ts`, which shifts the background off
pure white precisely so a pure-white cell stays distinguishable), leaving
only undecided cells gray. Exemplar:
[`range/render.ts`](../../src/games/range/render.ts).

### A cue that equals the background is a bug

**A "highlight" upstream draws as pure white may be invisible here — check
both schemes.** Spokes' satisfied-hub fill read as nothing in light mode and
as *literally the background* in dark mode, because `view.ts` handed the game
pure white there (the engine now shifts it first — see "Every board is one
tone" — but a pure-white cue is still only a sixth of the range above the
board). A cue that has to be seen must be a clear step **away**
from the background (`defaultBackground × 0.85` is enough; grays survive the
dark-mode adaptation because it inverts lightness about the real background).
When a game's own color nearly equals its background, fix it, don't preserve
it. Pair the cue with a `GamePref` when it is a solving aid rather than game
state (Bridges' `auto-mark-complete` and Spokes' `mark-satisfied` are the
same control). Exemplars:
[`spokes/render.ts`](../../src/games/spokes/render.ts),
[`bridges/render.ts`](../../src/games/bridges/render.ts).

### Completed regions share one color

**Shade a completed-and-correct region with
[`correctRegionColor(background)`](../../src/engine/color/palette.ts), not
an invented hue** — so "done and correct" reads the same across every game
and is tuned in one place (a green invented for Separate/Palisade was the
inconsistency this rule exists to prevent). Compute local validity per
wall-bounded component, OR an `F_CORRECT` bit into the packed cache key (it
must be in the diff key so it paints *and clears* as regions complete/break),
and prioritize it below flash/hint fills. Exemplars:
[`separate/render.ts`](../../src/games/separate/render.ts),
[`palisade/render.ts`](../../src/games/palisade/render.ts).

### Dark mode is the app's concern

**Don't make a color derivation luminance-aware in the game.** `colors()`
never sees a dark background: `view.ts` passes pure white precisely because
puzzles multiply the background down, then adapts the whole returned palette
in OKLCH — a token's authored dark value first, calculation otherwise, with
per-puzzle overrides from `augmentation.ts` on top. A luminance test in a
game is dead code, and a second adaptation fights the layer that owns the
concern. Derive exactly as upstream does, and when the derived dark value is
wrong (Loopy's undecided edge inverted to near-invisible), **author the dark
value on the shared role** with `token(light, dark)` rather than patching the
game — that fixed Loopy, Palisade and Separate at once and retired the three
identical `{ n: 0.6 }` overrides they carried. Exemplar:
[`loopy/render.ts`](../../src/games/loopy/render.ts), and
`lineMaybeColor` in [`palette.ts`](../../src/engine/color/palette.ts).

### What enforces the palette rules

[`palette-source.test.ts`](../../src/engine/color/palette-source.test.ts)
reads your game's source and fails on a color literal, on channel-indexing
the background, on importing the color combinators, and on importing another
game's token (a genuinely-not-a-color three-number array is declared in its
`NOT_COLORS` with a reason — it has two entries and should stay about that
size). [`colors.test.ts`](../../src/engine/color/colors.test.ts) measures
every must-stay-distinguishable set in both schemes;
`palette.test.ts` checks no meaning has quietly become a color of its own
(meanings are references, checked by identity).
