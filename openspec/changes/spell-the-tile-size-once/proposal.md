# Spell the tile size once

**Readiness: scaffolded, not started.** Found by
`widen-the-capability-snapshot` on the widened instrument's first reading, and
deliberately left out of that change because it is 55 games wide and that one
was three.

## Why

Every game's draw state remembers the tile size it was last laid out at, and the
collection spells it **two ways**. Measured 2026-09-12 by reading every game's
`newDrawState` return object through `capabilitySets()`:

| spelling | games | who |
| --- | --- | --- |
| `tilesize` | 40 | abcd, blackbox, boats, bricks, clusters, crossing, dominosa, fifteen, filling, flood, group, keen, lightup, magnets, mathrax, mosaic, net, netslide, palisade, pattern, range, rome, salad, samegame, seismic, separate, singles, sixteen, slant, slide, sokoban, spokes, sticks, subsets, tents, towers, twiddle, undead, unequal, unruly |
| `tileSize` | 15 | ascent, bridges, flip, galaxies, inertia, loopy, map, mines, pearl, pegs, rect, signpost, solo, tracks, untangle |
| neither | 2 | cube (`gridscale` — its solid is not tiled), guess (`pegsz`/`gapsz`/`pegrad` — a peg board, not a grid) |

No game holds both, so the census is exhaustive: 40 + 15 + 2 = 57.

It is the largest vocabulary divergence in the tree, and **not one of the 57
answers was about the puzzle** — which is the test `AGENTS.md` § "Convention over
configuration" sets for whether a decision is real. No game could legitimately
want to differ; a porter re-answered a question somebody forgot to settle.

Two things about why it survived this long, both worth keeping:

- **jscpd cannot see it.** It is not duplication — it is one concept with two
  names, which is the blind spot `re-express-the-collection` named in its own
  closing note.
- **Nothing else could either.** The capability snapshot read only the `Ui`
  until `widen-the-capability-snapshot`; a draw state's field names were
  unobserved by any instrument in the tree. The split was visible the first time
  anything looked.

## What changes

- One spelling across all 55, and the engine-side name
  (`Game.setTileSize`, `Midend.freshDrawState`) already settles which:
  **`tileSize`**. That is the larger edit (40 games move, not 15) and it is the
  right direction anyway — the contract the games implement is camelCase, and
  `preferredTileSize` and `computeSize(p, tileSize)` are too.
- Cube and Guess keep their own words, because neither board is tiled and that
  *is* a per-game answer about the puzzle. Whether Cube's should be `gridScale`
  is the same question one layer down; decide it here rather than leaving a
  third spelling behind.

## Open questions for the design

- **Loopy holds `tileSize` and no `started`** — with Cube, one of only two
  games lacking the redraw doctrine's ground-painted flag, and the only one
  where that reads as an omission rather than a consequence of the board (Cube
  paints no grid at all). A separate finding, not this change's business, but
  check it is deliberate before touching the file: the `started` population is
  55, and a missing one is exactly the shape `AGENTS.md` says to re-verify
  rather than inherit.
- **Prove the rename moved no frame.** A tile size is read by every `redraw`,
  so the tier-2.5 render snapshots are the check: a rename that re-baselines
  one is not a rename (`widen-the-capability-snapshot` design). Verify by shape
  across the whole diff — every changed line is the one intended substitution —
  because a green suite cannot distinguish a rename from a rename plus a
  swallowed `describe`.
- **Whether to state the convention anywhere.** A `ts-engine` requirement would
  make it normative; a line in `docs/games/rendering.md` would make it
  followable. A *guard* enumerating approved draw-state field names would be
  the manifest this collection refuses — the capability snapshot's diff is the
  instrument, and it now covers this half.
