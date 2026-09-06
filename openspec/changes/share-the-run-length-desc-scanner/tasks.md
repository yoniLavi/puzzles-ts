# share-the-run-length-desc-scanner — tasks

Scaffolded 2026-09-06 by `declare-the-board-model`'s exploration, which measured
the duplication but did not extract it.

## 0. Size it on two games, then decide — **done; the answer is yes, for ten**

- [x] 0.1 Explored by implementing, which is what the sizing needed.
- [x] 0.2 **Scanner written and Palisade adopted.** Its three grammar functions
      went **43 lines → 25**, and the nested `while (run) { while (run > 26) }`
      that nobody could read at a glance became
      `encodeRunLength(wh, i => clues[i] === EMPTY ? null : String(clues[i]))`.
      Better to read, and the grammar now has one statement per game instead of
      two.
- [x] 0.3 **The heavy case fights it, and that decided the roster.** Towers'
      desc is two comma-separated sections holding multi-digit numbers and `_`
      separators, scanned by index so it can report "rubbish at end"; a token
      iterator would have to hand the index back and be re-entered, which is
      longer than the loop it replaces. Measured across the family: **ten games
      have the simple grammar** (bricks, bridges, crossing, filling, loopy, map,
      mosaic, palisade, pearl, slant) and **eleven have sections or multi-digit
      values** (boats, keen, mathrax, pattern, salad, solo, tents, towers,
      tracks, undead, unequal). The eleven are a *different grammar*, not a
      harder version of this one, and they keep their own parsers.
- [x] 0.4 **Decision: adopt, for the ten.** Recorded in `run-length.ts`'s own
      doc comment, including why the eleven are out.

## 1. If it goes ahead

- [x] 1.1a **Three adopted so far**, one at a time: palisade, slant, mosaic.
      Slant's and Mosaic's **frozen differentials are byte-clean**, which is the
      byte-level proof the encoders are unchanged.
- [ ] 1.1b The remaining seven of the ten: bricks, bridges, crossing, filling,
      loopy, map, pearl. **Two of them will be neutral rather than a win, and
      that is measured, not guessed** — Bridges and Map walk a cell index
      alongside the desc index and raise their own "shorter/longer than
      expected" pair, so the token loop removes the `charCodeAt` arithmetic and
      little else. Take the decode side there and leave the encoder, or leave
      both; either is defensible, and the reason belongs in the change that
      does it.
- [ ] 1.2 **Leave unruly alone**, or give it its own parameter deliberately —
      `'a'` = 0 with a second alphabet is a real second dialect, and bending the
      scanner to cover it is the contortion the guardrails forbid.
- [ ] 1.3 **Leave magnets / samegame / singles alone.** They are value codecs,
      not run-length, and were caught by this sweep only because the sweep keyed
      on the character arithmetic. Singles' and magnets' near-identical
      `n2c`/`c2n` is a separate finding — file it, do not fold it in here.
- [x] 1.4 **The encoder is fuzzed against the code it replaced** — 4,000 trials
      biased hard toward blanks so runs past 26 and 52 occur constantly, with
      Palisade's prior nested-`while` encoder kept in `run-length.test.ts` as
      the oracle. That check exists because Palisade, the first game converted,
      has **no frozen differential**: nothing else in the suite would have
      noticed the encoder rounding a 27-blank run differently, and a desc is a
      player promise.

## 2. The guard that matters more than the extraction

- [ ] 2.1 **`validateDesc` accepts a desc iff `newState` can parse it**, as a
      cross-game property over the adopting games. That is the invariant the two
      hand-written scans exist to uphold and that nothing asserts today; it is
      worth having whether or not the scanner ships.

## Findings

- **The trailing run is load-bearing, and two games disagree about it.**
  Palisade drops the run that reaches the last cell; Slant and Mosaic keep it,
  because their `validateDesc` rejects a desc that does not fill the grid
  *exactly* ("Not enough data to fill grid", "Desc size mismatch"). Encode a
  Slant desc without it and the game refuses to load its own board. So
  `encodeRunLength` takes `keepTrailingBlanks` — one option carrying one real
  per-game fact, not a style knob. **Assuming either behavior would have
  corrupted descs silently in half the family.**
- **The decode side unifies cleanly; the encode side has three shapes.** Mosaic
  iterates its clue array, Bricks walks to a sentinel index, and Filling exposes
  a standalone `encodeRun(n)` used from inside a larger encoder — which
  `encodeRunLength(count, emit)` cannot express at all. Expect the scanner to
  reach further than the encoder.
- **Ten in, eleven out, and the eleven are not escapers.** They parse a
  different grammar — multi-digit numbers, `_` separators, two comma-separated
  sections — rather than a harder version of this one. That is the distinction
  the gesture-table and board-model withdrawals turned on, checked here before
  building rather than after.
