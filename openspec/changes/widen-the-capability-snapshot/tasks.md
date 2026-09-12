## 1. Widen the instrument

- [x] 1.1 Added the draw state's own field names to `capabilitySets()`, built off
      the `state` `builtGames()` already memoizes. Names only — not sizes, values
      or types.

      **Read UNSIZED, against this task's own instruction, and the instruction
      was wrong.** Sizing first was the first cut, exactly as written here; task
      1.3 then broke it and it **passed**. `setTileSize` *assigns* into the draw
      state, so sizing puts back any field it writes — Flood's is
      `ds.tilesize = ts`, so a `tilesize` deleted from its `newDrawState`
      reappeared and the snapshot could not see the loss. The blindness lands on
      the field **55 of 57** games' `setTileSize` writes, which is the worst
      possible place for it.

      The design reasoned one-sidedly: it asked what sizing might *reveal* (a
      field assigned conditionally on the tile size) and never what sizing
      *creates*. So the reading is unsized and the original worry is
      **asserted** instead — `capability-surface.test.ts` compares the two
      readings and requires sizing to add no key for any game, so a game that
      ever does assign one only under a tile size fails a test rather than being
      swallowed by the snapshot. Every game is in that check by construction: it
      compares two readings of the same draw state.
- [x] 1.2 Re-baselined and read in full: **556 lines, every one an insertion**,
      nothing removed, and every added line is the `"drawState": [` header, a
      quoted field name, or the closing bracket. Verified by shape rather than
      by eye (`AGENTS.md` § "Verify a bulk edit by shape"). The key sorts before
      `"id"` in vitest's serializer, so it lands at the top of each game's block.
- [x] 1.3 **Proved it fails** — and it did not, first time; see 1.1. After the
      inversion, deleting `tilesize` from Flood's `newDrawState` fails **two**
      tests independently, each naming the game and the field: the snapshot
      moves, and the sizing assertion reports `flood` added `tilesize`.
      Restored, and the snapshot diff is still 556 insertions with zero
      deletions.
- [x] 1.4 Confirmed: `pencilModeShown` stands against exactly nine games in one
      glance — abcd, crossing, keen, mathrax, salad, seismic, solo, undead,
      unequal — which is `promote-the-pencil-indicator`'s nine.

- [x] 1.5 **What the widened instrument found on its first reading**, unplanned
      and much larger than the three `Ui` divergences below: **`tilesize` (40
      games) against `tileSize` (15)**, with Cube and Loopy holding neither and
      Loopy alone also lacking `started` (55). It is the collection's biggest
      vocabulary split, it is invisible to jscpd (not duplication) and it was
      invisible to the snapshot (draw state) — the exact class this change
      exists to surface. Far too wide for this change; scaffolded as
      `spell-the-tile-size-once`.

## 2. Fix what reading already found

Each is its own commit, and each must move **no** recorded draw call — a rename
that re-baselines a render snapshot is not a rename.

- [ ] 2.1 Bricks `dragtype` → `dragType`, matching Clusters and Sticks and the
      model `docs/games/input.md` § "The accreting-paint drag" documents.
- [ ] 2.2 Bridges' `aiming` → a name Inertia is not already using (it has
      `aiming` and `aimDir` for the aimed move direction). Self-inflicted by
      `name-the-drag`; Bridges' means "the pointer has left the source island".
- [ ] 2.3 The pixel/grid drag position, **read per game, not replaced in bulk**:
      Ascent's `dragx`/`dragy` are a grid cell, Map's and Guess's are pixels
      (Guess spelling it `dragX`). Give the unit the name, so the two pixel
      games agree and Ascent's pair says cells. Renaming Guess to match Map
      without this would leave three games sharing one name for two units.

## 3. Record what is a finding rather than a defect

- [ ] 3.1 Pegs and Signpost already agree on `sx`/`sy` (grid anchor) + `dx`/`dy`
      (pixel current) + `dragging` — a second, consistent drag shape distinct
      from `GridDrag`'s. Record it where the next reader of either meets it
      (`docs/games/input.md` § "Drag models"), and cross-reference
      `name-the-drag` § 4.1, which defers exactly this pair.
- [ ] 3.2 Note in `docs/games/testing.md` what the widened snapshot is for: the
      class of divergence a clone detector cannot see, with the pencil indicator
      and the drag anchor as the two worked examples.

## 4. Close

- [ ] 4.1 Run the full gate. No app check is needed if every commit moved no
      recorded draw call — and if one did, it is not a rename and needs one.
- [ ] 4.2 Archive the change.
