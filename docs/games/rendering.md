# Rendering

How a game paints: the redraw contract and its doctrine, the per-tile cache,
overlays, drag previews and blitters, animation and flash, and the colour
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
when the cell was already drawn"), `galaxies.test.ts` ("recolours a flagged
wall on a board that was already drawn").

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
the pointer is still down** — an undo from the toolbar or keyboard mid-drag.
Upstream's `game_redraw` `assert`s the simulated move succeeds, so that
sequence is a thrown error in a naive port. Cancel the drag in `changedState`
(a bare `UI_UPDATE` never reaches that hook, so the live gesture is unharmed)
and make the preview fall back to the plain board rather than throwing.
**Tell:** a `redraw` that calls the game's own move helper on `ui` state and
can't handle "no". Exemplar:
[`slide/index.ts`](../../src/games/slide/index.ts) (`changedState`).

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

**The same file had a second one, and its colour was hiding it.** Galaxies'
half-grid keyboard cursor — the mark on a vertex or an edge, as opposed to the
tile-centre cursor that was already a key bit — was drawn after the tile loop
with a bare `drawRect` and left a mark at *every* vertex and edge it visited.
Nobody had reported it in the two years the port has existed, because the
cursor was painted in a near-invisible tint of the board; fixing the colour is
what exposed it. Two things generalise. **Sweep for the whole class when you
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

### A transient affordance needs an authored colour

**A colour derived from the board cannot be prominent against the board — in
either scheme.** Galaxies' cursor was `[min(r × 1.4, 1), g × 0.8, b × 0.8]` of
the background, a faithful port of upstream's idiom, which on this app's
`#d5d5d5` board is `#ffaaaa`: a pale pink, one pixel wide. And because it is
*computed* rather than authored, dark mode adapts it by calculation, so it
comes out a faint tint there too — the failure mode `hand-author-dark-palette`
recorded for Light Up, arrived at from the other direction. The drag preview
had inherited it, and the owner reported both as unreadable in both schemes.

Reach into [`colour/palette.ts`](../../src/engine/colour/palette.ts) for a
*meaning* instead — `CURSOR` for the keyboard cursor (green, because most
boards are greys and blacks and whites), `DRAG_ADD` for "let go and this is
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

## Bespoke board geometry, draw side

Some games store an odd-shaped board in a padded rectangle and shear it on
draw (Bricks' hexagon: each row offset rightward by half a tile per row). The
state/coordinate half — the bounds mask, the neighbour table, the inverse
pointer transform — is logic and lives with
[`mechanics.md`](./mechanics.md) § "Bespoke geometry". On the draw side:

- **Force the tile size even** (`ts & ~1`) in *both* `computeSize` and
  `setTileSize`, so half-tile shears are exact.
- **The shear/origin/bevel choices are display** — match the look, keep the
  code clean; they were never in byte-parity scope.
- **An SVG dump is the fastest shear check**: `toSvg` a `renderScenario`
  frame and rasterise it (see [`testing.md`](./testing.md)); a wrong offset
  shows instantly as a staircase, where at 1× a missing hairline is easy to
  miss.

**Render asks; move code decides.** Any rule the input and the display both
need is one function, called by both — coordinates are only the obvious case.
Crossing coloured each clue by which run a click would send it to, with the
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
anti-aliasing artefact. Pin the *invariant* ("no clue-tile erase overlaps the
grid's outline box"), not the pixel offset, so a different fix still passes.
Exemplar: `salad-render.test.ts` ("does not let a border clue's erase wipe
the grid's outline").

### Negative-space grids

**Some games draw their grid lines as negative space — don't "add" the lines
you can't find.** Rome's `game_redraw` contains no line-drawing at all: the
first frame floods the canvas with the border colour, and every square paints
its own background rect inset by one pixel everywhere, and further on each
side that meets a different region. What survives the fills *is* the grid. A
port that "helpfully" strokes the boundaries will double-draw; the *inset* is
the thing to assert in a tier-2.5 test (compare a square whose neighbour
shares its region against one whose doesn't and expect a wider rect), not a
line op that does not exist. Exemplar:
[`rome/render.ts`](../../src/games/rome/render.ts) + `rome-render.test.ts`
("insets a square's fill on each side that meets a different region").

### Display state in a narrow type

**A display-only value stored in the wrong type is a bug you may just fix.**
Byte-parity rules were about the generator/solver/codec; on the drawing path,
deliberate visual improvements are the point of the fork. Crossing's C
declared `bool flash` and assigned a nine-phase frame index to it, collapsing
its completion animation to a static colour shift — the fix is one type, and
a tier-2.5 test that two flash phases paint differently pins it (a snapshot
alone won't tell you the animation is *moving*). Seismic widens the tell to
plain data: its C assigned a 9-bit pencil mask to a `char`, so a pencilled 9
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
— flash exactly `flashTime` on a fresh, un-cheated unsolved→solved
transition — for every game whose state carries structural
`completed`/`cheated` flags.

**"Differently-named flags" is not a reason to keep your own `flashLength`,
and this guide used to say it was.** Measured 2026-08-26: of the 45 games with
a hand-written `flashLength`, **eight write `winFlash`'s condition verbatim**
and about six more write the same logic against a differently-spelled flag —
`usedSolve`, `hasCheated`, `wasSolved`, `solved` — for concepts every game
shares. That is one vocabulary spelled five ways, and the helper was built to
work *around* the drift rather than the drift being fixed. Neither the name nor
the copy is a design choice; see `docs/framework-rdd/README.md`, "The order of
work". Scoped by `unify-cross-game-vocabulary`.

A **genuinely bespoke flash condition** does keep its own `flashLength`, and
these are the real ones: more than one flashing outcome (Samegame flashes on
"impossible" too, Flood on won *and* lost), a duration that is not `FLASH_TIME`
(Ascent scales it by board size, Pegs uses two frames), or a condition that is
not "became solved" at all (Mosaic, Palisade, Flip's solve celebration).

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

**A game contains no colour value. Not one.** Every colour a game shows is a
reference into the collection's colour system, or a call to a shared function
from it. Three layers, three import paths, and which one you reach for is the
decision:

- [`engine/colour/palette.ts`](../../src/engine/colour/palette.ts) — **the
  meanings**, and your default: `ERROR`, `HINT_ACTION`, `HINT_FILL`,
  `HINT_EVIDENCE`, `CURSOR`, `HELD`, `DRAG_ADD`/`DRAG_REMOVE`, `UNDECIDED`,
  `GRID_MID`, `GRID_DARK`, `PENCIL_BODY`, `INK`, `PAPER`, plus the
  background-derived functions (`pencilColour`, `playerEntryColour`,
  `highlightWash`, `lineMaybeColour`, `lineNoColour`, `clueDoneColour`,
  `wallColour`, `correctRegionColour`). Each is a *reference* to a named
  colour, so restyling red restyles every meaning built on red.
- [`engine/colour/colours.ts`](../../src/engine/colour/colours.ts) — **the
  palette itself**: twelve names, most at three intensities (base, `_WASH`,
  `_BOLD`), plus the distinguishability sets (`TEN`, `TEN_NAMES`,
  `EIGHT_FILLS`, `FOUR_FILLS`).
- [`engine/colour/palette-games.ts`](../../src/engine/colour/palette-games.ts)
  — colours a game defines **relative to its own board**, prefixed with its
  id (`slantGrid`, `undeadGhost`). Functions, not values.

Write `out[COL_ERROR] = ERROR;`. Tokens deliberately drop the `COL_` prefix
(which in this codebase means "a palette **index**"), so a game's own index
constants keep matching its C enum and the namespaces never collide.

**Reach for a meaning first. Reach past it to a named colour only where the
*name* is load-bearing to the player** — a member of a set whose job is to be
told apart (`TEN`), or a colour the game says out loud (Flood's hint reads
"Fill with orange"; `TEN_NAMES` is re-exported alongside `TEN` so word and
colour cannot drift). If you write `out[COL_CURSOR] = GREEN` where `CURSOR`
would do, the next scheme has to rediscover that this green was a cursor.

**The escape hatch is real but narrow, and it is where sprawl grows back.** A
game whose board has *spent* the default may pick a different named colour
(Spokes' cursor is `PURPLE` because green is a held hub and blue a ruled-out
spoke). **Say why, at the assignment, in one line.** Before
`consolidate-colour-palette` there were 190 named colours and seventeen
cursors; the seventeen read as seventeen decisions and were one decision plus
collisions. If nothing in the palette fits, that is an exception recorded in
`palette-games.ts` under your game's prefix, with why no meaning and no named
colour serves — there is currently **one** in the collection (Unruly's tile
colours, which are bevel *bases* where near-black/near-white is headroom).
Aim to add none.

**Pick the replacement against the span of what it lands on, not against one
material — and remember the span inverts.** A cursor is clamped to the whole
grid, so it sits on every material the board has. Slide's run from the key block
and wall at the dark end to the floor and exit at the light end, which rules out
every mid-tone: teal, pink and orange all disappear against something, and
yellow vanishes into the floor outright. That argues for an *end* of the range —
except that in dark mode the ladder flips, and the wall and key block become the
**lightest** things on the board. There is no flat colour at the dark end of
both schemes, which is why the tie-break is **chroma**: red against a neutral
grey wall reads at equal lightness, where a second grey would not, and red
against the blue key block is opposite in hue rather than adjacent to it.
Purple was tried first and read as a smudge on that block for exactly that
reason. This is `hand-author-dark-palette` F1's "'brightest' is scheme-relative"
seen from the other side: it applies to *darkest* too, and to any argument that
picks a colour by where it sits in one scheme's ordering.

### A relative colour is a named function

**A colour defined relative to something is a named function in
`palette-games.ts`** — never open-coded `bg[0] * 0.9` in the game, which is
the same colour decision written as arithmetic somewhere no scheme can reach.
The derived form matters more than it looks:
[`puzzle/components/view.ts`](../../src/puzzle/components/view.ts) hands a
game **pure white** as its background in dark mode (so `background × 0.9`
derivations keep working) and adapts the returned palette itself — so a
colour that must stay legible against the board has to be a *function of the
background*, and an absolute colour should be a *named* one (a named colour
authors both schemes; a derivation handed pure white authors neither).

Two arithmetic traps, both of which cost a diff: `scale(c, 2/3)` is **not**
`(c * 2) / 3`, and `scale(c, 1/1.5)` is **not** `c / 1.5` — neither ratio is
representable, so pre-computing it rounds once more. Use
[`fraction(c, 2, 3)` and `divide(c, 1.5)`](../../src/engine/colour/colour-token.ts),
which keep upstream's *operation*.

### Black pieces stay black

**If the colour means "this piece is black/white", use `BLACK`/`WHITE` from
`colours.ts`, not `INK`/`PAPER`.** Same colour; the difference only shows in
dark mode — which is exactly why it gets missed. `INK` is maximum contrast
against the surface, so it inverts; a piece's black is the piece's identity,
so it is preserved (an inverted peg tells the player it is the other colour).
A game that wants its black *lifted* rather than preserved (Light Up's wall,
invisible if left pure black) says so in
[`augmentation.ts`](../../src/puzzle/augmentation.ts), which wins over the
token.

### Assign the colour, never a copy

**Every named colour authors both schemes; a derivation authors neither.**
The dark value rides on the array as an own property, so `[...BLACK]` is the
right colour with its scheme decision silently removed — and no test can
catch that in general. Consequence for `augmentation.ts`: a
`paletteOverrides` entry aimed at an index that now carries an *authored*
dark value is no longer correcting a calculation, it is fighting a decision;
four such entries were retired when the palette was authored — check yours is
not the fifth.

### Keep the C's colour-enum indices

**Mirror the C colour-enum indices when the game has dark-mode overrides.**
`augmentation.ts` may carry `paletteOverrides` keyed by **colour index**
(Unruly preserves its tiles + bevels under dark mode); a port that reindexes
silently mis-targets them. Keep `colours()` index-for-index with the upstream
enum. Exemplar: [`unruly/render.ts`](../../src/games/unruly/render.ts).

### Highlights from a fixed base

**Highlight/lowlight from a fixed base colour needs `mkhighlightSpecific`,
not `mkhighlight`.**
[`mkhighlight(bg)`](../../src/engine/colour/colour-mkhighlight.ts) derives
its trio from the frontend background and never extrapolates the base;
`mkhighlightSpecific(base)` extrapolates a near-extreme base toward the
opposite extreme, exactly as the C's `game_mkhighlight_specific`. Reach for
it whenever a tile colour isn't the host background (Unruly's near-white and
dark-grey tiles).

### Make determined state legible

**Where upstream leaves known cells looking like undecided ones, give each
determined state its own fill** — deliberate divergence; display was never in
parity scope. Range paints a known-white cell pure white (via a dedicated
colour derived from `colour-mkhighlight.ts`, which shifts the background off
pure white precisely so a pure-white cell stays distinguishable), leaving
only undecided cells grey. Exemplar:
[`range/render.ts`](../../src/games/range/render.ts).

### A cue that equals the background is a bug

**A "highlight" upstream draws as pure white may be invisible here — check
both schemes.** Spokes' satisfied-hub fill read as nothing in light mode and
as *literally the background* in dark mode, because `view.ts` hands the game
pure white there. A cue that has to be seen must be a clear step **away**
from the background (`defaultBackground × 0.85` is enough; greys survive the
dark-mode adaptation because it inverts lightness about the real background).
When a game's own colour nearly equals its background, fix it, don't preserve
it. Pair the cue with a `GamePref` when it is a solving aid rather than game
state (Bridges' `auto-mark-complete` and Spokes' `mark-satisfied` are the
same control). Exemplars:
[`spokes/render.ts`](../../src/games/spokes/render.ts),
[`bridges/render.ts`](../../src/games/bridges/render.ts).

### Completed regions share one colour

**Shade a completed-and-correct region with
[`correctRegionColour(background)`](../../src/engine/colour/palette.ts), not
an invented hue** — so "done and correct" reads the same across every game
and is tuned in one place (a green invented for Separate/Palisade was the
inconsistency this rule exists to prevent). Compute local validity per
wall-bounded component, OR an `F_CORRECT` bit into the packed cache key (it
must be in the diff key so it paints *and clears* as regions complete/break),
and prioritise it below flash/hint fills. Exemplars:
[`separate/render.ts`](../../src/games/separate/render.ts),
[`palisade/render.ts`](../../src/games/palisade/render.ts).

### Dark mode is the app's concern

**Don't make a colour derivation luminance-aware in the game.** `colours()`
never sees a dark background: `view.ts` passes pure white precisely because
puzzles multiply the background down, then adapts the whole returned palette
in OKLCH with per-puzzle overrides from `augmentation.ts`. A luminance test
in a game is dead code, and a second adaptation fights the layer that owns
the concern. Derive exactly as upstream does and record why there is no
divergence (this overturned a written design decision on
`add-loopy-ts-port`). Exemplar:
[`loopy/render.ts`](../../src/games/loopy/render.ts).

### What enforces the palette rules

[`palette-source.test.ts`](../../src/engine/colour/palette-source.test.ts)
reads your game's source and fails on a colour literal, on channel-indexing
the background, on importing the colour combinators, and on importing another
game's token (a genuinely-not-a-colour three-number array is declared in its
`NOT_COLOURS` with a reason — it has two entries and should stay about that
size). [`colours.test.ts`](../../src/engine/colour/colours.test.ts) measures
every must-stay-distinguishable set in both schemes;
`palette.test.ts` checks no meaning has quietly become a colour of its own
(meanings are references, checked by identity).
