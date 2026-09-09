# widen-the-mistake-overlay-coverage-key — tasks

## 1. Widen the key

- [ ] 1.1 Replace the `showMistakes` coverage test in
      `src/mistake-overlay-coverage.test.ts` with one keyed on the **property**:
      a test file that pairs a mistake source (`showMistakes`,
      `midend.findMistakes()`, or `game.findMistakes?.(`) with a redraw and an
      op assertion. Accept the superset and classify it in the ledger's reasons,
      rather than narrowing — that narrowing is what produced the defect.
- [ ] 1.2 Re-derive `NO_OVERLAY_TEST`. Expected to lose **abcd, galaxies, keen,
      lightup, map, rome** and keep the other eleven. If it loses more or fewer,
      read them before editing the list — the count is the finding, not the
      goal.
- [ ] 1.3 Keep both vacuity floors and add one for the widened key: assert how
      many test files the coverage scan matched, so a regex that stops matching
      after a rename cannot report the shortfall as zero.

## 2. Prove the widened key fails

- [ ] 2.1 For a game the widened key now calls **covered**, plant the defect
      (drop the overlay's stale clause from the cache-miss test, or split the
      key so the overlay bit is painted but not compared) and confirm that
      game's own suite goes red. Restore. Already done once for keen, abcd,
      rome and galaxies during the exploration — redo one as the change's own
      evidence and record which.
- [ ] 2.2 For a game the key still calls **uncovered**, plant the same defect
      and confirm nothing goes red. That is the pair that proves the line is in
      the right place; a guard that reports the same either side of its own
      threshold is measuring nothing.

## 3. Record what the guard learned about itself

- [ ] 3.1 Rewrite the header's "ON THE KEYS" paragraph. It currently argues that
      `showMistakes` "is not a name a game chose" — it is the name one *harness*
      chose, and four games' tests predate it. State the new key, and state the
      rule the mistake taught: **a guard's coverage side needs the same
      derivation discipline as its population side.**
- [ ] 3.2 Add that rule to [`docs/games/testing.md`](../../../docs/games/testing.md)
      § "How a cross-game guard finds its population" — it is about finding the
      population's *covered subset*, which the section does not currently
      distinguish.
- [ ] 3.3 Update [`docs/framework-rdd/guarantees.md`](../../../docs/framework-rdd/guarantees.md)'s
      "19 games at filing, 17 today" figure once the re-derivation lands.

## Findings

_(none yet — not started)_
