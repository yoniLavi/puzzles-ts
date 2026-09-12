# Design

## One function, not two, because the gate forbids the other one

The first plan split this in two — promote the painter, then the cache — on
`rendering.md`'s rule that an extraction which moves nothing should be separable
from a change that does. Two measurements collapsed it to one function:

- **Nothing moves in either half** (below), so there is no reviewability gain to
  buy with the split.
- **A painter with no direct caller cannot ship.** All nine games want the cache
  too, so a bare `drawPencilIndicator` would be exported and imported by nothing,
  which `scripts/checks/unused-exports.mjs` fails in the gate. The split was not
  merely unnecessary, it was unbuildable.

So the engine exports one entry point, `repaintPencilIndicator`, which decides
and paints.

## The three first-frame mechanisms already agree, and checking that took two passes

The first reading of this population had Crossing painting nothing on frame 1,
because the scan keyed on the conditional wrapping the cache site. Crossing has
two call sites: the cache one, and one inside its `!ds.started` block that paints
and seeds `pencilModeShown` twenty lines earlier. So **all nine games paint on
frame 1**, by three mechanisms that differ in spelling only.

Two consequences. Unifying the guard is **byte-clean**, not a behavior change, so
both commits are checkable against an unchanged snapshot rather than only the
first. And the direction question — unify onto the variant that paints more, or
the one that paints less — does not arise, which is worth recording because the
wrong answer to it would have been invisible: dropping the frame-1 paint is only
safe if every game's first-frame block covers the indicator's box, and Mathrax
and Seismic place theirs *outside* the board rect.

## The first-frame flag is not a parameter — it is a third cache state

The first cut passed the flag in, on the reasoning that *which* flag a game has
(`firstFrame`, `!ds.started`) is its own bookkeeping. Two things said otherwise.

The call then ran to **89 characters** — one over the formatter's width — and
wrapped to eight lines, so nine games traded a compact private function for a
verbose call and the whole change came out *longer*. A formatter is a poor
reason to redesign an API, but it was a fair signal that the argument list had
one thing too many in it.

And the flag is not really the game's bookkeeping. What it is asking is *"has
anything been painted under the indicator yet?"*, and the thing that knows that
is the cache. So `pencilModeShown` is `boolean | null`, `null` meaning never
painted: it is never equal to a boolean, so the first frame falls out of the
same comparison that handles a toggle, and no game passes a flag at all. Three
spellings of the guard do not get unified, they cease to exist.

Two confirmations that this was right rather than merely shorter. The
typechecker then found that **abcd, Keen and Solo's `firstFrame` local had no
other reader** — it existed only for the indicator, so all three lose a line
rather than gaining one. And Crossing, which had a *second call site* inside its
first-frame block, loses it: the `null` covers what that call was there to do.

## Signature: two objects, not eight positions

`engine/draw.ts` is uniformly positional with colors last, and the neighbor
`drawPencilGlyph(dr, ox, oy, size, bodyColor, gridColor)` is too. Followed
literally that gives a **ten**-argument call — surface, cache, mode, flag, three
coordinates, three colors — which is worse than the four lines it replaces.

So the geometry becomes one `PencilIndicatorBox` and the three palette indices
one `PencilIndicatorStyle`, both constant per game and named once at module
scope, leaving `repaintPencilIndicator(dr, ds, ui.pencilMode, BOX(ts), STYLE)` —
one line, in every one of the nine. `drawMarkSides(dr, { box, outer, inner }, …)`
is the existing precedent for an object parameter where the positional form
stops reading.

The box is square in all nine games, so `size` rather than `w`/`h`: a helper that
accepted a rectangle would invite one, and the glyph cannot draw into one.

`PencilIndicatorCache` is structural — a draw state satisfies it by carrying
`pencilModeShown`, with no base class — which is the same shape `NoteTakingUi`
uses for the input half of this mechanic.

## The real payoff: the invalidation was untested in all nine games

`rendering.md` says *"a byte-clean snapshot is only evidence if something is
watching"*, so the helper was broken deliberately before the unchanged snapshots
were believed. Removing the `drawUpdate` — which on a real canvas means the
glyph is painted into a region the frontend never blits, so the indicator sticks
— failed **zero** tests across all nine games.

The cause is a deliberate and correct design choice one layer down:
`RecordingDrawing` keeps `drawUpdate` **out** of `ops`, because it is
bookkeeping rather than paint and would otherwise add a line to every snapshot
in the collection. It exposes the rects on a separate `updates` array instead —
and exactly **one** test in the repository reads that array (Cube's).

So the nine copies did not merely duplicate four lines; they made a test nobody
was ever going to write nine times over. `pencil-indicator.test.ts` writes it
once, and asserts the channel no snapshot can see. Confirmed against three
mutations, each caught: no `drawUpdate` (2 failures), glyph never drawn (2), the
never-painted state ignored (1).

**This is the argument for the promotion, more than the lines it deletes** — and
it generalizes. A shape duplicated across games is not only N times the code, it
is a test that costs N times as much to write and therefore does not get
written.
