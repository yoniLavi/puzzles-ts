# widen-the-mistake-overlay-coverage-key — tasks

## 1. Widen the key

- [x] 1.1 Replace the `showMistakes` coverage test in
      `src/mistake-overlay-coverage.test.ts` with one keyed on the **property**:
      a test file that pairs a mistake source (`showMistakes`,
      `midend.findMistakes()`, or `game.findMistakes?.(`) with a redraw and an
      op assertion. Accept the superset and classify it in the ledger's reasons,
      rather than narrowing — that narrowing is what produced the defect.
- [x] 1.2 Re-derive `NO_OVERLAY_TEST`. Lost **abcd, galaxies, keen, lightup,
      map, rome**; the other eleven stand.
- [x] 1.3 Keep both vacuity floors and add a third for the widened key (`covered
      ≥ 25`), so a regex that stops matching cannot report the shortfall as
      *growing* rather than the key as broken.

## 2. Prove the widened key fails

- [x] 2.1 Galaxies — which the widened key now calls covered — goes red on the
      planted defect (`ds.wrongEdges.stale(cacheI)` → `false`): "recolors a
      flagged wall on a board that was already drawn". Restored.
- [x] 2.2 Unequal — which the ledger still calls uncovered — passes all 151
      tests with the same defect planted (`ds.wrong.stale(i)` → `false`).
      Restored. **That pair is the line proven in both directions**; a guard
      that reported the same either side of its own threshold would be
      measuring nothing.

## 3. Record what the guard learned about itself

- [x] 3.1 Rewrote the header's "ON THE KEYS" paragraph — the old text argued
      that `showMistakes` "is not a name a game chose", which is true of a game
      and false of a harness.
- [x] 3.2 Added rule 7 to `docs/games/testing.md` § "How a cross-game guard
      finds its population": a coverage guard has a *second* key and it is the
      one nobody checks, with the tell.
- [x] 3.3 Updated `docs/framework-rdd/guarantees.md`'s figure to 19 → 17 → 11.

## Findings

**The fix's own first cut repeated the defect one layer down, and that is the
most useful thing here.** The widened key matched `\bredraw\w*\(` and still
convicted Galaxies, because its test calls `galaxiesRedraw(` — the alias five
games use for the same export. It was caught only because
`explore-the-tile-loop-inversion` had already read that test and knew the answer
should be six, not five. A key written without that expectation would have
shipped at 12 and looked like a success.

**The remaining eleven** — ascent, bridges, dominosa, filling, group, mosaic,
palisade, pattern, range, undead, unequal — are real. Unequal was mutation-checked
(task 2.2) and its mistake overlay is drawn by code no test has ever looked at.

**Range is the one judgment call in the list.** It *does* render the overlay,
from a hand-written mistake list, but onto a fresh drawstate every time — the
cold frame `docs/games/rendering.md` says "proves nothing about an overlay". It
stays, with its reason recorded at the entry, and it is the cheapest of the
eleven to retire: it needs one more `redraw` on the same drawstate.
