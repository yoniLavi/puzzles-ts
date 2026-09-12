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
| boats | `dsx dsy dex dey` | grid cells | `dragFrom !== ""` — a payload sentinel |
| tents | `dsx dsy dex dey` | grid cells | `dragButton >= 0` — a payload sentinel |
| pattern | `dragStartX/Y` + `dragEndX/Y` | grid cells | `dragging` |
| tracks | `dragSx dragSy dragEx dragEy` | grid cells | `dragging` |
| bridges | `dragxSrc/ySrc` + `dragxDst/yDst` | grid cells | `dragging`, and a `-1` sentinel |
| rect | `dragStartX/Y` + `dragEndX/Y` | half-grid | a `-1` sentinel alone |

**Four spellings of the pair and four of liveness, and not one of those answers
is about the puzzle.** That is the `adopt-conventional-tier-names` shape exactly:
N games each answering a question N ways, where no game could say what it would
legitimately want to do differently. The coordinate *space* is a genuine
per-game decision — Rect's half-grid is its own business — and a shared type
holding two pairs does not touch it.

**What is *not* shared, and must not be:** Boats and Tents each carry a
`dragOk`, which reads like liveness and is not. It means *"the pointer is over a
valid cell right now"* — it goes false when the drag leaves the grid and true
again when it comes back, and a release while it is false commits nothing. Only
the two games whose drag runs along a line have it, because only they can leave
the grid mid-drag and come back. That is a game legitimately differing, which is
the test for leaving something where it is.

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

### What the change is actually buying, measured

One plant per game — swap the two coordinates written at its drag anchor, run
that game's own tests (2026-09-12):

| game | tests failed | | game | tests failed |
| --- | --- | --- | --- | --- |
| tents | **0** of 27 | | boats | 2 of 125 |
| pattern | **0** of 38 | | tracks | 3 of 88 |
| rect | **0** of 32 | | | |
| bridges | **0** of 72 | | | |

**Four of the six can have their drag anchor's axes swapped without a single
test noticing**, and the worst is Bridges: the most intricate drag in the set,
72 passing tests, no net. That reframes the change. The shared type is worth
having on its own terms, but the thing it is really buying is a reason to write
six drag tests that six separate games were never going to get around to — the
same finding `promote-the-pencil-indicator` reached from the rendering side,
where deleting the indicator's invalidation from nine games failed zero tests.

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

## Two corrections this proposal needed, and the one habit behind both

**The count.** The first cut said "9 games, 8 spellings", grouping by the *shape
of the names* without checking the *unit* behind them: Pegs' current position is
in pixels, Sixteen has both a pixel pair and a cell pair, and Slide holds single
indices. The corrected figure is 6 and 4.

**The liveness column.** The second cut listed `dragOk` as Boats' and Tents'
liveness flag, on the strength of its name. It is not — it is "the pointer is
over a valid cell right now" (above), and their actual liveness is a sentinel in
the payload each picked at press time. That was caught only by reading Tents'
`interpretMove` line by line while converting it.

Both are the same error: **a name-shaped scan over-groups**, and the tell is that
it produces a clean table. `AGENTS.md` says to key on the shape rather than the
name and then classify what that catches; the honest version of that here is that
the shape *is* the code, and six `interpretMove` bodies is a readable population.
A number surviving into a proposal has still not been checked — twice over.
