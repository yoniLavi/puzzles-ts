# Tasks

> Keen already ships both marks (`53b4f40`, `fd36f9a`, `e559545`). It is the
> exemplar, not part of the sweep — read its `markBand` and the post-tile block
> of `redraw` before starting.
>
> **The proposal's "six remaining fills" was a proxy** — it enumerated by
> `HINT_FILL`'s consumers, which names a colour rather than the defect. Measuring
> every hinting game frame by frame found **fifteen**, and the owner's call
> (2026-08-22) was to convert every target, the eight whose fill hid nothing
> included. See design D5 for the table.

## 1. Every target fill becomes a ring

Same shape of change in each: drop the `COL_HINT` background branch, point
`COL_HINT` at the game's action colour, and draw the ring on the cell's border.
`engine/hint-mark.ts` carries the geometry (`MarkBand`, `drawMarkSides`,
`outlineSides`) and the erase/restamp pass (`HintMarks`); a game with more than
two mark roles calls `drawMarkSides` directly from its tile painter.

- [x] 1.1 towers — repaints each tile up to **four times** inside one clip (3D
      towers spill into their neighbours), so the marks are drawn once per frame
      from `redraw` and unclipped, where a neighbour's tower cannot bury them.
- [x] 1.2 unequal — band entirely *outside* the cell, bounded by the greater-than
      chevrons at `GAP/4 − 1`.
- [x] 1.3 solo — Keen's geometry exactly; two cells in one sub-block sit a pixel
      apart, so the mark reads widest on a block boundary, which is where it
      matters.
- [x] 1.4 group — keyed by **display** position, not grid cell: the player can
      drag the Cayley table's rows and columns into any order.
- [x] 1.5 undead — inner reach bounded by the pencilled monster's radius
      (`2/5` of a `TILESIZE/2` box, a quarter-tile in ⇒ `TILESIZE/20` clear).
- [x] 1.6 filling — digits rather than pencil marks; the mark covers the marked
      cell's half of a region border, and the neighbour's half survives.
- [x] 1.7 crossing — **not in the proposal's list**: it fills in `GREEN`, because
      blue already means "across". Its cursor cue reverts to the ordinary
      background highlight, which the fill had displaced.
- [x] 1.8 clusters — also missed by the grep (fills in `PURPLE`, because blue is
      one of the two colours a player *paints*).
- [x] 1.9 dominosa — the collection's worst case: `HINT_ACTION` itself, the
      emphatic blue, filled behind a number.
- [x] 1.10 netslide — the fill *was* the moving-tile mark, so it becomes a
      **double** ring on the tile frame, distinct from the single inset ring the
      destination cell already carries, and it rides with the tile through a slide.
- [x] 1.11 bricks, unruly, slant, pattern, range, lightup, galaxies, singles —
      the eight whose fill covered an empty cell. Galaxies is the interesting one:
      a cell's fill *is* its association, so the fill was taking the premise away
      after all.
- [x] 1.12 Each game: the drawstate remembers what is marked **only where the
      band lies outside the content box** (keen, solo, unequal, group, undead,
      clusters). Where it lies inside, the cell's own repaint undoes it — the
      hint overlay is already in that cell's cache key.

## 2. Evidence: outline where it carries content, wash where it does not

- [x] 2.1 Decided per game on the measurement rather than the family, and
      recorded beside each `colours()`. Three games keep a wash and say why:
      **unruly** (still-empty siblings), **pattern** (undecided squares),
      **lightup** (dark squares, where the premise is *not lit* and a teal shade
      is not yellow).
- [x] 2.2 Outlined everywhere else, by the one rule that draws both shapes: paint
      a side wherever the neighbour across it is not also evidence.
- [x] 2.3 The wash goes back to `TEAL_WASH`, the visible step, since nothing is
      drawn on it (design D2).
- [x] 2.4 Outlines take a `_BOLD` step. This also fixed a defect nobody had
      listed: **bricks, sticks, spokes, boats, singles and unruly already drew
      evidence rings**, in the pale wash — 1.11:1 against a light board.
- [x] 2.5 Sticks and Boats each *split* their evidence, washing one kind of cell
      and ringing another; both collapse to one shape for one role.
- [x] 2.6 Crossing's clue list and Subsets' tally band filled behind a **label
      whose colour is information**; both become boxes.

## 3. Consolidate the roles

- [x] 3.1 `HINT_EVIDENCE` is now the evidence **mark** (teal's bold step) and
      covers the chain ordinal; `HINT_ORDER` is gone. The fill form is
      `HINT_EVIDENCE_WASH`, following this module's own `ERROR` / `ERROR_WASH`
      precedent — the stroke takes the plain name. Games collapsed their
      `COL_HINT_ORDER` palette index into `COL_HINT_CELL`, so the identity is
      structural rather than a coincidence two names agree on.
- [x] 3.2 `TEAL_WASH_DEEP` retired with its last consumer, and `HINT_FILL` with
      it — the fill the search proved has no working value. `colour-collide`
      **172 → 171 pairs**: exactly the coincidental pair D3 named.

## 4. Guards

- [x] 4.1 `src/engine/hint-mark.test.ts` sweeps the `hint-games.ts` enrolment,
      reading each game's `COL_HINT` / `COL_HINT_CELL` out of its own `render.ts`
      via `import.meta.glob` so there is no second list to drift. Shape, not
      colour: no rect in a hint colour may be cell-sized and thick in both
      directions. Per-game, `engine/testing/mark-shape.ts` gives `expectRing` and
      `expectContour`.
- [x] 4.2 **Proved it fires** — reverting Unruly's ring to a fill turns it red
      with the offending rect in the message; the revert was diffed back to
      byte-identical afterwards. Three further guards inside it: a discovery floor
      on the glob, an exact list of the two games with no `render.ts`, and
      `CHECKED.length === 27` so a renamed export cannot drop a game silently.
- [x] 4.3 `hint-overlay.test.ts` green: a hint drawn only on the border still
      repaints a warm, otherwise-unchanged frame.
- [x] 4.4 Baselines compared, not eyeballed: `colour-collide` **172 → 171**
      (the consolidated role removed the pair), `colour-dark-check` **64 → 64**
      (no new background-relationship violation across ~20 games' marks changing).
      `metrics/colour-inventory.md` regenerated; every changed row is a hint role.

## 5. Close out

- [x] 5.1 `ts-engine` delta rewritten to what shipped; `docs/games/hints.md`
      § "Shade vs ring" rewritten around the rule, the band placements, and the
      three named wash games.
- [ ] 5.2 Browser pass per game, **both schemes**.
- [ ] 5.3 `openspec validate --strict` (passing); owner acceptance; archive.
