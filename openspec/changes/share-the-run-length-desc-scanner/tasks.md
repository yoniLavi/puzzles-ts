# share-the-run-length-desc-scanner — tasks

Scaffolded 2026-09-06 by `declare-the-board-model`'s exploration, which measured
the duplication but did not extract it.

## 0. Size it on two games, then decide

- [ ] 0.1 `/opsx:explore`.
- [ ] 0.2 **Write the scanner and adopt Palisade only.** Count the lines before
      and after in `validateDesc` + `newState`, and read the result: does the
      per-game half read better or worse once the scan is a loop over tokens?
      A worse-reading result is a legitimate stop.
- [ ] 0.3 **Adopt one game whose validation is heavier** — Towers
      (`validateDesc` 45 lines) or Pattern (58) — because the light case will
      always flatter an extraction. If the heavy case fights the token loop,
      the scanner serves the easy games and is escaped by the hard ones, which
      is the shape this repo has withdrawn twice.
- [ ] 0.4 **Decide from those two, and record the decision either way.** A
      declined extraction with its measurement is a result; an unrecorded one
      costs the next session the same two days.

## 1. If it goes ahead

- [ ] 1.1 Adopt the dialect-A games one at a time, each with its frozen
      differential byte-clean before the next.
- [ ] 1.2 **Leave unruly alone**, or give it its own parameter deliberately —
      `'a'` = 0 with a second alphabet is a real second dialect, and bending the
      scanner to cover it is the contortion the guardrails forbid.
- [ ] 1.3 **Leave magnets / samegame / singles alone.** They are value codecs,
      not run-length, and were caught by this sweep only because the sweep keyed
      on the character arithmetic. Singles' and magnets' near-identical
      `n2c`/`c2n` is a separate finding — file it, do not fold it in here.
- [ ] 1.4 Property-test the scanner against a generated corpus of descs, and
      **prove the test fails**: change `'a'` to mean a run of 0 and watch every
      adopting game's differential go red.

## 2. The guard that matters more than the extraction

- [ ] 2.1 **`validateDesc` accepts a desc iff `newState` can parse it**, as a
      cross-game property over the adopting games. That is the invariant the two
      hand-written scans exist to uphold and that nothing asserts today; it is
      worth having whether or not the scanner ships.

## Findings

_(none yet — not started)_
