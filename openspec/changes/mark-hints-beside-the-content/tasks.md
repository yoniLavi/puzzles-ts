# Tasks

> Keen already ships both marks (`53b4f40`, `fd36f9a`, `e559545`). It is the
> exemplar, not part of the sweep — read its `drawCellSides` and the post-tile
> block of `redraw` before starting.

## 1. The six remaining target fills become rings

Each is the same shape of change: drop the `COL_HINT` background branch, point
`COL_HINT` at `HINT_ACTION`, and draw the ring in the gutter after the tile loop.

- [ ] 1.1 towers — note it repaints each tile up to **four times** inside one
      clip (3D towers spill into their neighbours), so anything drawn per tile
      lands four times; the ring is drawn once per frame from `redraw` instead.
- [ ] 1.2 unequal
- [ ] 1.3 solo — its cells sit inside blocks with their own thick borders; check
      the ring against a block boundary, not only a plain cell boundary.
- [ ] 1.4 group
- [ ] 1.5 undead
- [ ] 1.6 filling — the only one of the six whose cells carry *digits* rather
      than pencil marks. Its geometry differs; confirm the gutter arithmetic
      rather than copying Keen's.
- [ ] 1.7 Each game: the drawstate must remember what is marked. The gutter
      belongs to no tile, so a mark that moved or went has to be erased
      explicitly and a mark that stayed has to be restamped every frame — see
      `ds.ringed` / `ds.evidenced`.

## 2. Evidence: outline where it carries content, wash where it does not

- [ ] 2.1 Decide per game on `hints.md` § "Shade vs ring"'s question, widened to
      include *hidden by contrast*. Record the call **and its reason** beside the
      game's `colours()`; a game keeping a wash is claiming nothing is drawn
      there, and that claim is what a later reader needs (design D1).
- [ ] 2.2 Outline the candidate games' evidence, reusing the one rule that draws
      both shapes: paint a side wherever the neighbour across it is not also
      evidence — a contiguous region becomes one contour, a scattered set one
      ring per cell.
- [ ] 2.3 Where evidence stays a wash, put it back to `TEAL_WASH`: it was
      darkened to carry content, and a wash that carries none should be the more
      visible of the two (design D2).
- [ ] 2.4 Give an outline a **`_BOLD`** colour, not a base — a base step at the
      same lightness in both schemes reads soft on a pale board and bright on a
      dark one, which `colour-dark-check` flags. It caught exactly this in Keen.

## 3. Consolidate the roles

- [ ] 3.1 The evidence outline and the chain ordinal are one role, not two that
      agree by coincidence (design D3). Choose which name survives deliberately —
      its doc comment is where the shared colour gets explained.
- [ ] 3.2 If no game is left washing evidence under content, retire
      `TEAL_WASH_DEEP` with its last consumer; `palette-source.test.ts` fails on
      an intensity nobody references, so this is checked rather than assumed.

## 4. Guards

- [ ] 4.1 Promote Keen's shape assertions to a cross-game guard over the
      `hint-games.ts` enrolment: four thin rects and **none solid** for a target,
      `2w + 2` sides for a `w`-cell contour. Shape, not colour — "some rect is
      `COL_HINT`" is satisfied by the fill being removed (design D4).
- [ ] 4.2 **Prove the guard fires** by deleting one game's ring and watching it
      go red. Both guards written during `walk-tactic-hint-chains` were vacuous
      on their first cut and neither was caught by reading them.
- [ ] 4.3 `hint-overlay.test.ts` still passes: a hint drawn only in the gutter
      must still repaint a warm, otherwise-unchanged frame.
- [ ] 4.4 Baselines, compared rather than eyeballed: `colour-collide` and
      `colour-dark-check` counts before and after, with every new pair explained.

## 5. Close out

- [ ] 5.1 `ts-engine` delta applied; `docs/games/hints.md` § "Shade vs ring"
      updated to name every game's call rather than just Keen's.
- [ ] 5.2 Browser pass per game, **both schemes** — this is player-visible in
      every hinting game and a green suite is not evidence for it.
- [ ] 5.3 `openspec validate --strict`; owner acceptance; archive.
