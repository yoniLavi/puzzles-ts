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

- [x] 2.1 Bricks `dragtype` → `dragType`, matching Clusters and Sticks and the
      model `docs/games/input.md` § "The accreting-paint drag" documents. The
      guide now states that all three spell it `dragType`, and Bricks'
      declaration points at the guide section rather than listing its two
      siblings.
- [x] 2.2 Bridges' `aiming` → **`dragged`**, *not* the `steering`/`aimedAway`
      the design proposed. Rect already holds this concept under that name,
      documented in almost the same words ("set once a drag has moved off its
      start point … distinct from `drag.live`: a press is live immediately, but
      has not yet *dragged*") and gated on the identical predicate
      (`gx !== drag.sx || gy !== drag.sy`). **Joining an existing spelling beats
      minting a third**, which is this section's own point; minting would have
      been the error the change was written to fix.

      Reading the neighbors also produced a **negative** result worth as much:
      Boats' and Tents' `dragOk` is a *different* concept ("the pointer is over
      a valid cell right now"), already consistent across its two games, and
      must not move. A sweep that only renames cannot tell those apart.

      `docs/games/input.md` § "A button with two meanings resolves on the
      release" now states the convention and why `aiming` is the wrong word for
      it. Incidental: dropped a comment naming `dragxSrc`/`dragySrc`, fields
      `name-the-drag` had already deleted.
- [x] 2.3 The pixel/grid drag position, read per game — and the reading
      **changed the answer twice**:

      **Sixteen is an invisible third pixel game.** It holds `dragX`/`dragY`
      (pixels) plus seven more drag fields, all declared `optional` and assigned
      only mid-gesture, so `newUi` returns `{cursor, curMode}` and **none of
      them appear in the snapshot**. With Pegs' and Signpost's draw states that
      makes `dragX`/`dragY` the spelling of four games against Map's one — so
      **Map** moves (`Ui` and draw state both), not Guess. The instrument that
      motivated this change is half-blind on its own `Ui` side; recorded in
      `docs/games/testing.md`.

      **Guess's `dragCol` is a *color*, not a column** — Map spells the same
      concept `dragColor`. It had to move too, because `dragCol` was the first
      name chosen for Ascent's column and would have collided *as a homonym*:
      `dragCol` (color), `dragColor` (color), `dragColumn` (column) is worse
      than fixing Guess. → `dragColor`.

      **Ascent's pair is a column index and a row index**, not "a grid cell":
      the renderer compares them against `i % w` and `trunc(i / w)`, so they
      paint a vertical and a horizontal guide line, and only the one
      perpendicular to the grabbed edge survives. → `dragColumn`/`dragRow`,
      spelled out because `Col` was the homonym above.
- [x] 2.4 **A rename that asserts a semantic owes something that checks it.**
      `dragx`/`dragy`/`dragCol` had **zero** test references in all three games,
      so the renames were verified by `tsgo` alone — sufficient for a rename, but
      `dragColumn`/`dragRow` are names that make a claim, and an unchecked claim
      is the thing `AGENTS.md` warns about in comments. Ascent gained three
      tier-2 cases (`ascent.test.ts`, "ascent edge-drag guide line"): the
      highlight for `dragColumn` shares one x and spans several y, for `dragRow`
      the transpose, and neither set paints anything. Proved by swapping the two
      comparisons in `render.ts` — both fail, "expected 5 to be 1" — then
      restored. Nothing else in the suite could see that mutation.
- [x] 2.5 **No save format is touched**, checked rather than assumed, because a
      `Ui` rename is in `AGENTS.md`'s ask-the-owner-first category if it is.
      `Midend` persists a `Ui` only through `game.encodeUi`, never by
      serializing keys; Ascent's encoder emits `P…H…N…` from
      `positions`/`prevhints`/`nexthints` positionally and names none of the
      renamed fields, and Guess and Map declare no `encodeUi` at all.

## 3. Record what is a finding rather than a defect

- [x] 3.1 Recorded in `docs/games/input.md` § "Other drag shapes", under the
      sentence that already names the pair: the three-part shape (`sx`/`sy`
      grid anchor, `dx`/`dy` pixel current, `dragging`), why `GridDrag` is not
      it (its two ends share one space; here the far end is a pointer the
      release does not read), and the actionable conclusion — **a third sprite
      drag copies Pegs rather than bending `GridDrag`**, and that is when the
      anchor-only drag `name-the-drag` §4.1 deferred becomes worth building.
      Also records that the pixel *destination* is `dragX`/`dragY` on the draw
      state in all three sprite games, Map included, which is what task 2.3
      made true.
- [x] 3.2 `docs/games/testing.md` § "The divergence no clone detector can see",
      a sibling of § "How a cross-game guard finds its population". States the
      class (one concept, several spellings — not duplication, so jscpd is
      blind), the two worked examples, what the snapshot deliberately does not
      assert, and **both** of its limits: the `Ui` half cannot see an optional
      field only a gesture assigns (Sixteen's nine), and the draw state must be
      read unsized because `setTileSize` writes.

## 4. Close

- [x] 4.1 **Four commits, each through the full gate**, green every time; the
      last ran 9224 tests. No render snapshot moved in any of them — only
      `capability-surface.test.ts.snap`, which is the vocabulary snapshot and is
      the point. Each diff was verified by shape rather than by the green suite:
      every changed source line is the substitution, a doc comment, or (in the
      last) the new tier-2 block.
- [x] 4.2 **Checked in Chrome anyway, and it earned the time.** This task said
      an app check was unnecessary because no recorded draw call moved. That is
      the right *rule* but the wrong call here: three of the five renamed fields
      had **no test coverage at all** before this change (task 2.4), and all of
      them drive rendering, so "no recorded draw call moved" only says the
      frames nobody was recording did not move. A rename of an untested render
      path is exactly where a real canvas is worth looking.

      Console clean on every page. All five paths render:

      - **Ascent, 5x5 Edges** — the finding the whole rename rests on, seen:
        dragging a number in from the **left** edge paints a **vertical**
        highlighted column, from the **top** edge a **horizontal** row. The
        names and the tier-2 test and the canvas all agree.
      - **Bricks** — the accreted drag paints three cells black inside the red
        drag outline.
      - **Map** — the floating blob follows the pointer and leaves **no trail**
        behind it, which is the real check on the renamed draw-state pair: a
        wrong `ds.dragX`/`dragY` would restore the background at the wrong place
        and smear.
      - **Guess** — the peg sprite follows the pointer, no trail.
      - **Bridges** — both branches of `dragged` in one board: press-move-release
        across two islands drew a bridge, press-release on a third island marked
        it instead, "Move 2 of 2". That disambiguation is the only reason the
        flag exists.
- [x] 4.3 Archive the change.
