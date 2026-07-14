# Design — generalise the hint sidecar to every render overlay

## D1. One type, three pack entry points (not two types, not one shape)

`HintSidecar` was already the right *storage*: a `packed` word per cell for the frame
being drawn, a `drawn` word per cell for what the canvas currently shows, and the three
beats — pack / `stale(i)` / `commit(i)`. What was hint-specific was only the *packing*:
`pack(highlights, index, markBits)` consumes a hint step's `area`/`targets`/`marks`.

The mistake overlay needs the same storage and a different packing (a flat
`findMistakes` cell list). So the type is renamed `OverlaySidecar` and grows entry
points rather than variants:

| Shape | Entry point |
| --- | --- |
| Hint step highlights | `pack(hl, index, markBits)` |
| `findMistakes` cell list | `packCells(cells, index)` |
| A game's own topology | `clear()` + `add(i, bits)` |

`clear()`/`add()` are the primitives the other two are written in terms of, so exposing
them costs nothing and buys Galaxies (D2). `at(i)` (`packed[i] !== 0`) is sugar for the
mistake overlay's "is this cell flagged", which every candidate render asks per cell.

Rejected: a `MistakeSidecar` subclass. The only difference is one method; a subclass
would say "these are different things" when the whole point of the change is that they
are the same thing, and it is the *sameness* that closes the bug class.

## D2. Galaxies' `wrongEdges` — converted (the proposal left this open)

The proposal flagged this as evaluate-don't-assume: `wrongEdges` packs *edges*, not a
mistake-cell list, and looked like it might already be a one-array compare not worth
converting. It converted cleanly and the code got smaller, so it converted.

What it was: a `Set` of half-grid edge coordinates built per frame, then — inside the
per-tile loop — four `Set` lookups per tile to ask "is my L/R/U/D wall flagged?",
compared against a one-array `ds.wrongEdges` drawn record.

What it is now: an `OverlaySidecar` packed by a pre-pass over the mistake list. A wrong
wall is a *shared* edge, so it lights `DRAW_EDGE_L` in the tile to its right and
`DRAW_EDGE_R` in the tile to its left — which is exactly the `clear()`/`add()` shape,
and is why `packCells` (one cell, one flag) does not fit and a raw escape hatch is the
right answer rather than a contortion of the list packer.

Net: the `Set` and the four per-tile lookups are gone, the work is now proportional to
the number of mistakes rather than to the board area, and the overlay reaches the cache
through the same mechanism as everyone else's. `setTileSize`'s `wrongEdges.fill(0)`
also went: invalidating the tile cache already forces every tile to repaint and
re-`commit()` its mask, so the manual reset was a second, redundant statement of the
same invariant.

## D3. The guard the conversion exposed

Galaxies' wall-overlay render test painted a **cold** frame — a fresh draw state, one
`redraw`. That test cannot fail for the bug it is guarding: on the first paint every
cell misses its cache key regardless, so an overlay absent from the diff key still gets
drawn. The playbook prescribes paint-twice for exactly this reason, and Towers has one;
Galaxies did not. Added (`galaxies.test.ts`, "recolours a flagged wall on a board that
was already drawn"): warm the draw state with no overlay, turn Check & Save on with
nothing else changed, assert the wall repaints `COL_MISTAKE` — then drop the overlay
and assert it goes back to `COL_EDGE`, which guards the *removal* half of the dance
(the half a one-array compare gets wrong most easily).

## D4. Non-goals held

- **No cross-game mistake-overlay guard.** A mistaken board cannot be built
  generically — the per-game paint-twice test remains the prescription. (The hint
  overlay *can* be driven generically, which is why `hint-overlay.test.ts` exists.)
- **No key-bits overlay helper.** Declined in the `unify-hint-framework` audit and
  still declined: per-game topology makes it parameter soup.
