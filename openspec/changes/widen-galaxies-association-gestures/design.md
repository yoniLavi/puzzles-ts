# Design

## Context

Galaxies has exactly two player actions — set a wall on a grid line,
and associate a cell with a dot — and until now they lived on separate
mouse buttons, with the association drag on the right. The right button
is the one this frontend serves worst (see the proposal), so the
association gesture is the one that is hardest to reach. Widening it is
two independent moves that happen to share one state machine: put it on
the left button as well, and let it run from a cell as well as from a
dot.

## Decisions

- **D1 — Left gets the drag; the edge toggle moves to release.**
  Upstream's own header comment specifies left-drag-from-dot and its
  code has never matched it (`e137ad8`, no rationale recorded). Left
  cannot both toggle an edge on *press* and start a drag, so the toggle
  fires on release when the pointer never left `DRAG_SLOP_PX`. That is
  the whole cost, it is the standard click-or-drag resolution, and it
  buys the gesture on touch without a long-press. Right-button drags
  are untouched — a mouse player's habit and the `detectSecondaryButton`
  promotion both keep working, and the drag lifecycle already keys off
  the button *class* so the promoted press finishes its own drag
  (`input.md` § "A touch hold arrives as the right button").
- **D2 — The release re-measures the distance; it does not merely ask
  "did a drag start?"** `view-interactive.ts`'s `cancelPointerTracking`
  synthesises a drag *and* a release at `(-100, -100)` when the pointer
  leaves the canvas mid-press. A press that never found a drag source
  therefore arrives at a release far from where it started, and must
  **not** toggle an edge there. Measuring the release against the press
  pixel handles that case for free, where a `dragStarted` boolean would
  have needed it spelled out.
- **D3 — The cell→dot drag is the same drag with the roles swapped.**
  `Ui` gains `dragToDot: boolean`. In that mode `targetX`/`targetY` are
  pinned to the source cell and `dotx`/`doty` are what the pointer
  picks; in the existing mode it is the other way round. Everything
  downstream — `okToAddAssocWithOpposite`, the preview, `dropDrag`,
  `executeMove` — is already written in terms of a (tile, dot) pair and
  needs no knowledge of which end moved. Two places do: `dropDrag`'s
  "dragged back to where it started is a null move" test (in reverse
  mode the target *is* the source, so the test must not fire) and its
  "remove the arrow from the source" op (in reverse mode there is no
  arrow there to remove).
- **D4 — Only an unassociated, dot-free tile starts a reverse drag.** A
  press on a tile that already has an arrow keeps today's meaning: pick
  that arrow up and carry it somewhere else, which is the more useful
  action *there*. Re-pointing a cell at a different dot stays reachable
  by dragging from the new dot. The alternative — reverse-dragging from
  an associated cell — would have taken the only gesture for moving an
  arrow and left nothing in its place.
- **D5 — The snap radius is one tile, and misses show nothing.** The
  pointer picks the nearest *legal* dot within `tileSize` of it;
  outside that, no dot is picked and the preview shows nothing, which
  is how the player cancels. Nearest-legal-dot-anywhere was rejected:
  it teleports a commitment across the board and leaves no way to let
  go harmlessly. One tile is about two subcell steps, so it is generous
  enough for a finger without being surprising.
- **D6 — The candidate rings are a preference, defaulting on; the
  gesture is not.** These are two different things and only one is an
  aid. Being *able* to drag from a cell tells the player nothing they
  could not learn by dragging to it and seeing whether it took;
  knowing, before committing, the set of dots whose 180° image of this
  cell is on the board and unclaimed is a real deduction, done for
  them. So `galaxies-show-drag-candidates` gates the rings alone.
  Default on, because the ring is also what *explains* the new gesture
  the first time a player stumbles into it; a purist turns it off once,
  and `Game.prefs` persists it across new games.
- **D7 — Rings ride the transient-UI overlay sidecar.** `ds.overlay`
  already carries the preview plane (bits 0-1) and the half-grid cursor
  (bits 2-10) since `fix-galaxies-drag-preview`; candidate marks take
  bits 11-28 as two bits per subcell position, the same 9-position
  shape the dot bits and the cursor bits use, so a dot on a tile corner
  is painted (and erased) by each of the four tiles that clip it. The
  Int32 cache key has no free bits, and a sidecar is what
  `rendering.md` § "Overlay sidecars" prescribes for exactly this.

- **D8 — The offer is bounded by the rules of a galaxy, and stops there**
  (added on owner acceptance, 2026-08-08). Upstream's
  `ok_to_add_assoc_with_opposite` is a *local* test — in-grid, dot-free,
  mirror likewise — so it accepts arrows no galaxy centred on that dot
  could ever contain. The owner hit one: a cell two steps from its dot
  whose direct route ran through a tile another dot sits on, and whose
  every detour was cut off by the mirror requirement. Now
  `reachableFromDot` floods outward from the dot's own tiles **in mirror
  pairs**, blocked by other dots' own tiles. Three boundaries make this
  defensible:
  - *Why it is sound*: a real galaxy is connected, symmetric, and holds
    exactly one dot, so the fill reaches every cell the solution assigns —
    asserted over generated boards, which is the test that lets the
    predicate be tightened at all.
  - *Why it stops here*: block on anything a **deduction** establishes and
    the offer converges on the unique solution. That is not an aid, it is
    an answer. Only facts forced by the dot layout count.
  - *Why it ignores the player*: respecting their walls and arrows would
    be consistent but would let one mistake veto a correct arrow elsewhere
    with nothing on screen to explain it.

  Two consequences worth stating. The offer narrows a lot — 4.28 → 1.51
  dots per cell on a fresh 10×10 — so for many cells there is now exactly
  one, which means **the candidate preference (D6) no longer hides the
  information, only the convenience of seeing it**: an honest preview
  reveals the same set to anyone willing to wave the pointer around. And
  it costs 0.45 ms per call on 15×15 Unreasonable (46 dots), measured, so
  the obvious memoisation was not written.

## Verification

Tier-1: the left click/drag disambiguation in both directions
(short press-release toggles the edge; a press that travels starts a
drag and toggles nothing; a cancelled press at `(-100, -100)` toggles
nothing); reverse drags commit the right pair; the same-cell null-move
test does not fire in reverse mode; keyboard select/move/select
commits. Tier-2: candidate rings appear only while a reverse drag is
live and only on legal dots, are absent with the preference off, and
are erased by their tiles' own repaints when the drag ends. Live
Chromium in both schemes, mouse **and** emulated touch.

## Open Questions

None.
