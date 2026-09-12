# Widen the capability snapshot, and fix what reading it already found

## Why

`re-express-the-collection` (archived 2026-09-06) swept all 57 games in eight
batches and re-measured its own definition of done. It was candid about the limit
of its instruments:

> jscpd is a text instrument: it cannot see two games that implement one mechanic
> with different identifiers … and it cannot see a difference that is *not*
> duplication.

Two convergences shipped this week sit squarely in that blind spot, which is the
evidence that the gap is real rather than theoretical:

- **`promote-the-pencil-indicator`** — nine private `drawPencilIndicator` copies.
  Not clones: each computes its own box, so jscpd saw nothing.
- **`name-the-drag`** — six spellings of a drag's anchor. Not duplication at all,
  so there was nothing for a clone detector to detect.

The sweep compensated by **reading** for batches B5 and B6. This change makes the
reading cheaper and repeatable, and fixes what one pass of it has already found.

### What one pass of reading found

The `capability-surface` snapshot already lists every game's `Ui` field names,
sorted, in one file. Reading all 57 (2026-09-12):

| finding | detail |
| --- | --- |
| **`dragtype` vs `dragType`** | Bricks spells it lowercase; Clusters and Sticks do not — and `docs/games/input.md` documents the model as `dragType`. Clusters' own comment calls it *"the model Bricks and Sticks share"*, one line above the spelling they do not share. |
| **`dragx`/`dragy` means two different things** | Ascent's is a **grid cell** (`ui.dragx = gx`); Map's and Guess's are **pixels** (both say so in a doc comment, Guess spelling it `dragX`). One name, two units — and two names, one unit — in the same three games. |
| **`aiming` now means two different things** | Inertia's is the aimed move direction; Bridges' is "the drag has left its source island". **Self-inflicted**, by `name-the-drag` two commits ago: it renamed Bridges' `dragging` without checking the word was free. |
| **Pegs and Signpost already agree** | Both hold `sx`/`sy` (grid anchor) + `dx`/`dy` (pixel current) + `dragging` — a second, consistent drag shape, distinct from `GridDrag`'s. That is a *finding*, not a defect: it strengthens the case for the sprite-drag pair that `name-the-drag` deferred. |

### The half the Ui snapshot cannot see

The pencil-indicator divergence was **not** visible there, because
`pencilModeShown` is a **draw-state** field and draw states are not snapshotted.
`builtGames()` already carries each game's `state`, so `newDrawState(state)` is
one call away and the same reading becomes possible for the other half of a
game's remembered vocabulary.

## What changes

- `capabilitySets()` gains the draw state's own field names, so the snapshot
  covers both halves of what a game remembers. The diff it produces is the
  instrument; nothing is asserted about the *contents*.
- The three divergences above are fixed: Bricks adopts `dragType`; the pixel drag
  position gets one spelling and Ascent's grid pair stops borrowing it; Bridges'
  `aiming` is renamed so Inertia keeps the word.
- The Pegs/Signpost finding is recorded where the next reader of either will meet
  it, rather than left in this proposal.

## What this change does not do

- **It does not re-open the sweep.** `re-express-the-collection` is done by its
  own re-measured criteria, and its closing note already says a concern found
  later is *"an addition to a named list, not the whole method"*. This is one
  such addition.
- **It asserts no vocabulary rule in the snapshot.** A guard that enumerated
  approved field names would be the manifest this collection refuses; the
  snapshot's job is to make a divergence a reviewable line in a text diff, which
  is what it already does for capabilities.
- **It does not convert Pegs or Signpost.** They are a coherent pair and belong
  with the five games whose `changedState` exists only to cancel a gesture —
  `name-the-drag` § 4.1 holds that population.
