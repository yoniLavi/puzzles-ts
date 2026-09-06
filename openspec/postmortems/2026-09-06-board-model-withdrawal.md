# Postmortem: the declared board model, withdrawn before implementation

**Date:** 2026-09-06
**Status:** Withdrawn. `declare-the-board-model` is deleted; the direction is
dropped from the migration plan.
**Superseded by:** `unify-the-board-origin` and `share-the-run-length-desc-scanner`,
both scaffolded from this exploration's actual findings.

## TL;DR

`declare-the-board-model` proposed that a game declare its topology (square /
hex / one of the eighteen `grid/` tilings / a bespoke pair), what a cell holds,
and which entities exist, and receive in return **state allocation and
structural cloning, the desc codec, coordinate maps shared by input and paint,
cursor movement including the half-grid and edge-cursor variants, and
bounds/geometry for `computeSize`** — the largest block of derived behavior in
the whole vision.

Its task 0 was an exploration against a game chosen to break it, and the
proposal itself said that declining, with the measurement recorded, was a
legitimate outcome. The exploration ran. **The deliverable list was checked
item by item against what is already on disk, and the exemplar the vision
itself named — Palisade — turned out to have received four of the five
already, from a module keyed on the mechanic rather than on the topology.**

1. **A general board model already exists in this repo, and 55 of 57 games
   decline it.** `src/engine/grid/` is a full planar-graph model — faces, edges
   and dots with complete incidence, `gridNearestEdge` for input hit-testing,
   `gridNewDesc`/`gridValidateDesc` for the desc codec, `gridSizeFor` for
   geometry, across all eighteen tilings. Its consumers are Loopy and Pearl.
   The experiment this change proposed has been run.
2. **The named exemplar's deliverables had already shipped**, keyed on the
   mechanic: `border-grid.ts` gives Palisade and Separate their state
   allocation (`initBorders`), their pixel→edge map (`pointerEdge`), their
   half-grid cursor (`moveBorderCursor`) and, next door, their `computeSize`
   geometry (`borderGridSize`).
3. **Cursor movement is already derived for the whole collection**, and the
   escapers escape for reasons a topology cannot express.
4. **The two deliverables that have *not* shipped are the two the declaration
   is worst placed to give.** Cloning is 466 lines whose entire content is one
   per-field judgment — *copy this layer or share this reference* — that a
   topology does not know. The desc codec is frozen by C1, so for every
   existing game it can only be re-expressed byte-identically, for no player.
5. **On the topology axis the collection splits roughly in half**, and the
   half that fits would save about two lines each.

What the exploration *did* find is two real duplications, both measured, both
shaped like `border-grid.ts` rather than like a declaration. They are filed as
their own changes.

## What was proposed

From `docs/framework-rdd/game-definition.md` § "The board model":

> **You declare:** topology (square / hex / one of the eighteen `grid/` tilings
> / a bespoke coordinate pair), what a cell holds …, and which entities exist
> (cells, edges, vertices …).
>
> **You get:** state allocation and structural cloning (immutability by
> construction — no game writes `cloneState` again), the desc codec for the
> common run-length grammars, coordinate maps used identically by input and
> paint (the "one function, both callers" rule made structural), cursor
> movement including the half-grid and edge-cursor variants, and
> bounds/geometry for `computeSize`.

`migration.md` named its own falsifier: *"the adapter forces contortion on the
first non-Latin exemplar (the Palisade re-expression is the test — edge games
are where 'cells with domains' assumptions die)"*.

## What the exploration did

Following the three lessons the proposal inherited from the gesture-table
withdrawal:

- **Subtracted what had already shipped before counting what a declaration
  buys** — took each of the five deliverables in turn and asked what is on disk
  today, rather than reading the proposal's account of it.
- **Read the populations rather than counting a name.** All 45 clone bodies,
  all 57 `interpretMove` hit tests, every local `coord`/`fromCoord` definition,
  every run-length encoder.
- **Re-measured after catching its own instrument error.** A first pass reported
  "43 games use `geometry.ts`" from a grep for `\bcoord(`, which matches each
  game's *local* definition as readily as the shared import. The corrected
  count is below and is materially different — this is the repo's catalogued
  trap (`AGENTS.md` § "Method"), hit and caught inside one session.

## Finding 1 — the general board model exists, and the collection declined it

`src/engine/grid/` is not a square-grid helper. Its doc comment describes "the
idiomatic TS port of upstream `grid.c` … which models any planar graph as
faces, edges and dots with full reference incidence", split across
`grid-core.ts` (the four incidence classes), `grid-tilings.ts` (fourteen
periodic generators plus the size dispatch for all eighteen),
`grid-geometry.ts` (`gridNearestEdge` — *input hit-testing* — and
`gridFindIncenter`), `grid-desc.ts` (`gridNewDesc` / `gridValidateDesc`) and
`grid-trim.ts`.

That is the board model of the proposal's own bullet, minus the state layers:
topology, entities, coordinate map, desc codec, geometry. It has shipped, it
covers eighteen topologies, it is importable by any game, and **its consumers
are Loopy and Pearl.**

The other 55 do not decline it for want of access. They decline it because
`y * w + x` into an `Int8Array` is the right representation for a square board
and walking `GridFace` objects to reach a neighbor would be pure cost. That is
the "one obvious way" question already answered by the corpus, by the games
voting with their imports — and it is the answer a topology declaration would
have to overturn rather than discover.

## Finding 2 — the named exemplar had already been served, on the other axis

`migration.md` names the Palisade re-expression as this design's test. Palisade
was re-expressed, in 2026-09, against `border-grid.ts` + `border-grid-render.ts`
— and what those two modules give it is the board model's list:

| Board-model deliverable | Where Palisade gets it today |
| --- | --- |
| State allocation | `initBorders(w, h)` |
| Coordinate map, input side | `pointerEdge(...)` — pixel → (cell, direction) with the mid-edge dead zone |
| Coordinate map, paint side | `margin(ts)` / `fromCoord(coord, ts)`, the same functions |
| Cursor movement, half-grid variant | `moveBorderCursor(...)` |
| `computeSize` geometry | `borderGridSize(w, h, ts)` |
| Structural cloning | still Palisade's own — 11 lines |
| Desc codec | still Palisade's own — frozen by C1 |

So the exemplar chosen to break the model cannot break it: it was already
served, before the model was proposed, by a module keyed on **what the player
operates** rather than on **what shape the board is**. That is the axis lesson
from the gesture-table withdrawal arriving a second time, and this time on a
change whose proposal had quoted it.

`border-grid.ts`'s own criterion is the one that decided it, and it is not a
topology question: *"would a change here have to happen in both games at
once?"* Palisade and Separate answer yes about edge marking and no about
everything else. A topology declaration cannot ask that question, because two
games can share a topology and share nothing else — Slant and Palisade are both
square grids with sub-cell entities, and they share not one line.

## Finding 3 — cursor movement is already derived, and the escapers are not topological

`pointer.ts` gives every game `cursorDelta`, `gridCursorMove` and `moveCursor`
— the reveal-and-move-in-one-press cursor, clamped or toroidal —
plus the `GridCursor` shape held under `ui.cursor`. Measured 2026-09-06:
**46 of 57 games call one of the three movement functions.**

The eleven that do not — ascent, bricks, cube, inertia, netslide, palisade,
separate, sokoban, tracks, undead, untangle — still carry the shared `GridCursor`
shape or the shared button vocabulary, and hand-write only the traversal. And
`pointer.ts` already records, in the interface's own doc comment, that this is
deliberate:

> A genuinely different traversal — Palisade's and Separate's half-cell
> coordinates, a lock mode, obstacle-skipping — likewise stays put; those keep
> their own movement and share only the shape.

Those are the "half-grid and edge-cursor variants" the board model promised to
derive. Two of them are already derived, in `border-grid.ts`. The rest are a
sheared row (bricks), a rolling solid (cube), a ring outside the board
(netslide), a free graph (untangle) and a player-relative direction (sokoban) —
none of which follows from a topology, all of which follow from the puzzle.

## Finding 4 — the coordinate map is real, and it is a two-line pairing, written twice in eight games

This is the deliverable with the most residue, so it is measured most carefully.
Corrected counts, 2026-09-06:

- **10 games import `engine/geometry.ts`** — clusters, fifteen, flood, inertia,
  mines, samegame, sixteen, slide, spokes, twiddle.
- **36 define their own `coord` / `fromCoord`**, of which 6 (fifteen, flood,
  inertia, samegame, sixteen, twiddle) are wrappers currying the engine
  function with their border.
- **17 do neither** — ascent, blackbox, bricks, cube, galaxies, guess, loopy,
  mosaic, net, netslide, palisade, rome, separate, sticks, subsets, undead,
  untangle — because their hit test is not a per-axis floor at all.

What the 36 local definitions contain is two lines: `x * ts + border(ts)` and
`Math.floor((px - border) / ts)`. The arithmetic is shared and available; the
part that is genuinely per-game is the **border**, and the pairing of the two is
what each game writes locally. A declaration would replace two lines with one.

**The real defect is not the two lines — it is that eight games write them
twice.** The board's pixel origin is computed once for the input path and once
for the paint path, in two modules, with nothing holding them together:

| Game | Input side | Paint side |
| --- | --- | --- |
| blackbox | `index.ts` `Math.floor(ts / 2)` | `render.ts` `Math.floor(tilesize / 2)` |
| dominosa | `index.ts` `-Math.floor(ts / 16)` | `render.ts` `-gutter(ts)` |
| galaxies | `index.ts` `const border = tile` | `render.ts` `const border = tile` |
| range | `index.ts` `Math.floor(ts / 2)` | `render.ts` `Math.floor(ts / 2)` |
| signpost | `index.ts` `const BORDER = 1` | `render.ts` `const BORDER = 1` |
| singles | `index.ts` `Math.floor(ts / 2)` | `render.ts` `Math.floor(ts / 2)` |
| slant | `index.ts` `Math.floor(ts / 3) + 1` | `render.ts` `clueRadius(ts) + 1` |
| unruly | `index.ts` `Math.floor(ts / 2)` | `render.ts` `Math.floor(ts / 2)` |

All eight agree today; none is guarded. Slant is the sharpest — the input side
carries the comment `// render.ts border (NARROW_BORDERS)`, which is a copy
citing its original rather than importing it, and the two spell the same number
differently (`ts / 3` versus `clueRadius(ts)`).

**This is exactly the change's own constraint C3** — *"'one function, both
callers' is an existing rule; a declaration must make it structural, not restate
it."* It can be made structural without a declaration, and two games in the tree
already show how: Mines imports `borderFor` from its render module, and Bricks
exports `offsets` with the doc comment *"Shared with `interpretMove` so pointer
mapping and drawing agree."* Filed as `unify-the-board-origin`.

## Finding 5 — cloning is 466 lines, and every line of it is a judgment a topology does not know

Measured 2026-09-06 by scanning for a function whose name carries
`clone`/`copy`/`dup` and whose subject is the state (so `cloneUntangleState`,
`clonePatternState`, `cloneBridgesState`, `cloneAscentState`, `cloneRectState`,
`cloneSokobanState` and Flip's `dupGrid` are all included — the scan was keyed
on shape after the bare name `cloneState` was found to miss six games):

- **45 games carry one; 466 lines in total.** Thirteen are a single 3-line
  spread — blackbox, bricks, bridges, clusters, filling, flip, lightup, net,
  netslide, pattern, range, sticks, unruly — and the longest is Signpost's, at
  18.
- **12 do not** — fifteen, flood, inertia, mosaic, pegs, samegame, sixteen,
  slant, slide, tents, tracks, twiddle — because their moves *transform* the
  board (slide a row, flood a region, rotate a block) rather than *edit* it, so
  the new array is the move's actual work and there is no clone-then-mutate step
  for a declaration to absorb.

All 45 read the same: a shallow spread, then one decision per field — **copy
this layer, or share this reference.** That decision is the entire content, and
it is a puzzle fact, not a topology fact:

- Seismic shares its `dsf`: *"The partition is immutable for the life of the
  game, so every state shares one instance rather than cloning a union-find per
  keystroke."*
- Mines shares `layout` "by design D1"; Signpost clones its `dsf`, because
  Signpost's changes.
- Fifteen games share a `clues` / `immutable` / `numbers` / `layout` array by
  reference and say so in a comment on the field: abcd, ascent, dominosa,
  group, keen, mathrax, mines, palisade, pearl, salad, separate, singles, solo,
  towers, unequal.

A declaration that captured which fields are per-move layers would be the same
length as the function it replaced, and a declaration that did *not* capture it
would deep-copy frozen clue arrays on every keystroke. Either way the 466 lines
do not go away; they change notation.

## Finding 6 — the desc codec is frozen, so its value is forward-looking, and C1 already conceded this

Standing constraint C1 was right and is decisive on its own: existing games keep
byte-stable descs permanently, so a derived codec can only re-express them
byte-identically, for no player-visible gain, at the cost of proving 57 formats
unmoved.

The grammar itself is more unified than the proposal assumed, and that is a
finding in the *other* direction — it makes a **helper** worth having and a
declaration no more worth having. Measured 2026-09-06 over every function whose
body maps a run to a letter or back (30 games):

- One dialect dominates — `'a'` = a run of 1, chunked at 26 — written **four
  ways**: `96 + run` (bridges, crossing, map, mathrax, mosaic, salad, slant),
  `97 + run - 1` (bricks, boats, filling, loopy), `97 - 1 + currrun` (keen),
  and `A - 1 + run` (palisade). Five games spell the identical constant two
  different ways.
- Unruly is a genuine second dialect: `'a'` = a run of 0, with a second
  uppercase alphabet for the other cell color and a `> 24 / -= 25` flush.
- Magnets, samegame and singles are not run-length at all — they are base-36
  *value* codecs (`n2c` / `c2n`), and singles' and magnets' are near-identical
  to each other.

And within a single game the grammar is written **twice**: `validateDesc` scans
the desc to count squares and `newState` scans it again to fill them, each with
its own copy of the a–z arithmetic. Palisade, Mosaic, Bricks, Boats, Tents,
Towers, Tracks, Pattern and Pearl all do this. That intra-game duplication is
the sharper target, it needs no topology, and it is filed as
`share-the-run-length-desc-scanner`.

## Finding 7 — on the topology axis the collection splits about in half

The change's task 0.4 asked for four shapes. Reading all 57 hit tests, there are
more than four, and the escapers escape for puzzle reasons:

- **Falls out of a square-grid declaration** (one floor per axis, then a `w`/`h`
  bounds check): abcd, blackbox, boats, clusters, crossing, fifteen, filling,
  flip, flood, inertia, keen, lightup, magnets, mathrax, mines, netslide,
  pattern, pegs, range, rome, salad, samegame, seismic, signpost, singles,
  slant, solo, tents, twiddle, unruly.
- **Sub-cell entity within a square grid** — dominosa (which half of the tile),
  group (edge position, via `+ ts/2`), pearl (quadrant), spokes (angle to a
  neighbor), unequal (the gap between cells), towers (a point-in-triangle test
  for the clue wedges), subsets (fractional insets), undead (asymmetric x and y
  offsets, `-b-1` against `-b-2`), palisade and separate (edge pick, via
  `border-grid.ts`).
- **Not a cell hit test at all** — ascent (five per-mode offsets), bricks
  (sheared rows), cube (`Math.atan2` about the solid's center), galaxies (a
  `(2w+1)×(2h+1)` parity grid with nearest-edge rounding), guess (peg rows),
  loopy (`gridNearestEdge` over eighteen tilings), map (which region owns the
  pixel), mosaic (an offset origin), net (a wrapping window), rect (fractional
  coordinates, then `coordRound`), sixteen (drag distance along a row), sticks
  (a drag bounding box), sokoban (direction from the player's own cell), tracks
  (a drag along a line), bridges (island adjacency), untangle (rational free
  points).

So the declaration would cover about half the collection and save it around two
lines each, while the other half needs a hatch. The proposal set this test
itself — *"a board model that expresses squares and hexes cleanly while
Palisade, Slant, Loopy's eighteen tilings and Untangle's free graph all escape
it has not produced one obvious way"* — and named the outcome: a majority idiom
plus a second, less-traveled path, "which is the state we are in now with extra
machinery."

## What survives

- **`grid/` is the board model, for the games that need one.** A future game on
  a hex or aperiodic tiling should import it, and that is the whole answer.
  Nothing needs to be built for it.
- **The two duplications, filed with their measurements**:
  `unify-the-board-origin` (the eight two-copy origins) and
  `share-the-run-length-desc-scanner` (one grammar, four spellings, written
  twice per game).
- **The rule this exploration cost a day to sharpen**, now in
  `docs/games/mechanics.md` § "One function, both callers": the rule's most
  common concrete instance is the board's pixel origin, and the fix is to
  export it from one module and import it in the other — never to copy it with
  a comment naming the original.
- **The guarantee that was worth wanting.** `guarantees.md` listed "coordinate
  maps agree from both callers" as a generated guarantee of the board model.
  It is worth having and it does not need the model: making the origin one
  function makes the guarantee true by construction, which is stronger than a
  test asserting it.

## What was considered and declined

**A source scan asserting no game defines its board origin twice.** Declined:
it would have to key on a name (`border`, `margin`, `BORDER`, `TLBORDER`), and
Slant's copy is an unnamed inline expression — the scan would have reported
Slant clean while shipping the worst instance in the set. That is precisely
this repo's catalogued instrument failure, and structure is available instead:
one exported function cannot drift from itself.

**A behavioral guard driving `Midend.processInput` at the painted cursor
position.** Considered seriously, because it is derived rather than declared.
Declined: the assertion it can make without a per-game ledger is only
whole-cell agreement, and the drift this defect class produces is one or two
pixels at a boundary — the guard would pass over exactly the failure it exists
to catch. A guard that cannot fail on its own defect is the shape `AGENTS.md`
opens with.

## What would reopen this

A concrete game whose board is genuinely not expressible as either "typed
arrays indexed `y*w+x`" or "a `grid/` planar graph", where the awkwardness is in
the *topology* rather than in the mechanic — and where the declaration would
serve more games than escape it, measured before the design. Neither condition
holds today, and `grid/` covers the second case already.

The greenfield route stays open on its own terms: if `add-path-ts-port` or
`add-numgame-ts-port` is ever built and finds itself writing board plumbing that
neither `grid/` nor `geometry.ts` nor `border-grid.ts` supplies, that is real
downstream pressure and this can be reconsidered against it. It is not pressure
that can be manufactured from the corpus the model would replace.
