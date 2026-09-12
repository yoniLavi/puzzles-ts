# Give the drag a name, the way the cursor has one

## Why

`GridCursor` is the collection's exemplar of a convention that worked: a
three-field object, five helpers, carried by **53 of 57 games**, and no game
re-decides what to call the thing or what "hidden" means. The **drag** is the
same kind of concept and never got the same treatment.

Measured 2026-09-12 across the 26 games that handle a pointer drag. Six of them
hold an **anchor and a current position, as integer coordinates in the game's own
space**, and they spell it four ways:

| game | the pair | space | "is a drag live" |
| --- | --- | --- | --- |
| boats | `dsx dsy dex dey` | grid cells | `dragOk` |
| tents | `dsx dsy dex dey` | grid cells | `dragOk` |
| pattern | `dragStartX/Y` + `dragEndX/Y` | grid cells | `dragging` |
| tracks | `dragSx dragSy dragEx dragEy` | grid cells | `dragging` |
| bridges | `dragxSrc/ySrc` + `dragxDst/yDst` | grid cells | `dragging`, and a `-1` sentinel |
| rect | `dragStartX/Y` + `dragEndX/Y` | half-grid | a `-1` sentinel alone |

**Four spellings of the pair and three of liveness, and not one of those answers
is about the puzzle.** That is the `adopt-conventional-tier-names` shape exactly:
N games each answering a question N ways, where no game could say what it would
legitimately want to do differently. The coordinate *space* is a genuine
per-game decision — Rect's half-grid is its own business — and a shared type
holding two pairs does not touch it.

### The defect this prevents is not hypothetical

`fix-stale-ui-and-cache-state` (archived 2026-09-12) fixed Pegs throwing at the
player: an armed gesture survived an undo and `executeMove` rejected the
keypress. The audit in that change read the 37 games with no `changedState` and
found Pegs alone — but the reason it was alone is that six other games write
their drag as **loose fields with private names**, so nothing in the engine can
see a drag at all, let alone know one needs canceling.

A named object changes what is possible: the midend can reset every `GridDrag` it
finds on a `Ui` by walking it once, and a game joins by **having** one rather
than by declaring anything — the collection's enrollment rule. Five of the games
that do declare `changedState` today (filling, pegs, signpost, slide, untangle)
use it for nothing but "put the gesture down", and that half goes away.

## What changes

- `engine/pointer.ts` gains `GridDrag` and its helpers, beside `GridCursor`.
- One pilot game converts, to pressure the contract before six do.
- The remaining five convert in reviewable batches.
- The midend cancels a live `GridDrag` on a state replacement, derived from the
  `Ui` rather than declared, and the games whose `changedState` existed only for
  that lose it.

## What this change does not do

- **It does not assume in three drags that are differently shaped.** Pegs holds a
  grid anchor with a *pixel* current (it drags a sprite), Sixteen holds a pixel
  pair **and** a cell pair, and Slide holds single *indices*, not x/y pairs.
  Those are assessed after the pilot, against the contract the pilot produced,
  and are a separate decision — folding them in now would be designing against
  three games nobody has converted.
- **It does not touch the accreting-paint drag** (bricks, clusters, sticks — a
  `dragType` plus an accreted cell list). A shared *lifecycle* for those was
  evaluated and declined twice, most recently as `add-sticks-ts-port` design F7,
  because forcing one callback shape over Sticks would contort its logic. That
  no-go stands and this does not reopen it: a named value type is not a
  lifecycle, and nothing here takes a callback.
- **It does not rename anything a player or a save can see.** A `Ui`'s field
  names are internal; the games that persist drag state persist it through their
  own `Move` types, which are untouched.

## The number that was wrong first

The first cut of this said "9 games, 8 spellings", grouping by the *shape of the
names* without checking the *unit* behind them. Three of those nine hold
something else (above). The corrected figure is 6 and 4. Recording it because
this repo's standing rule is that a number surviving into a proposal has still
not been checked — and this one had not.
