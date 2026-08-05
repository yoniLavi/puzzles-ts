# Tasks — add-subsets-difficulty-tiers

## 1. Repair the arrow deduction (gating)

- [x] 1.1 Recover upstream's commented-out block from `subsets.c` in git history
      and work out what was wrong with it — do not assume it was merely unfinished.
      **Finding: nothing was.** Recovered from `788d0cc^`; it is the exact mirror
      of the live half and sound as written. Ported verbatim it eliminates no
      true candidate over hundreds of boards, terminates, and costs no
      measurable time. The `TODO` records an intention, not a diagnosis — see
      design D1, which says so rather than inventing a repair narrative.
- [x] 1.2 Implement it soundly on the candidate cube.
- [x] 1.3 **Prove soundness before anything depends on it.** Checked against the
      generator's own known assignment (`generateCandidate` returns the board it
      blanked), **not** against the weaker cap — agreeing with the weak solver
      only covers boards the weak solver already finishes, i.e. exactly where
      the new rule matters least.
- [x] 1.4 Delete the "do not fix this" note at `applyArrowsAdvanced`; replace with
      what was repaired and why.

## 2. Tiers

- [x] 2.0 **Read the generator's retry loop before touching the gate.** It has
      none, and carries nothing between attempts — every candidate redraws both
      shuffles — so the Clusters hill-climb hazard is structurally absent and a
      bare `retryLimit`ed loop is correct. Design D4.
- [x] 2.1 Difficulty parameter: `d<char>` encode/decode over `"et"`, an ID with
      no `d` keeping the default, an unrecognised char landing out of range so
      `validateParams` rejects it. **The default is Easy, and the argument is
      unusually easy here**: Easy *is* upstream's shipped strength, so unlike
      Clusters "the tier that reproduces today's boards" does exist.
- [x] 2.2 Gate: Easy takes the first candidate (tier 0 has no tier below, so its
      acceptance rule is upstream's unchanged); Tricky applies
      `solvableAtExactlyTier`, which asks the cheap question first.
- [x] 2.3 Presets per tier, and the game's first `paramConfig` entry — the tier
      alone, since the board shape has one legal value.
- [x] 2.4 Measure the cost and the yield rather than reasoning about them:
      Easy 1.0 ms/board, Tricky 3.6 ms (median 3 ms, p95 12 ms, max 28 ms), gate
      yield 26.0%, givens 5.17 → 4.72. No parameter floor to measure — the board
      shape is fixed.

## 3. Assurance

- [x] 3.1 **The byte-match was kept in full, and needed no `upstreamLooseGate`.**
      The new rung sits *above* upstream's strength rather than replacing it, so
      at `DIFF_EASY` the rules, the acceptance test and the RNG draw order are
      all untouched and the twelve fixtures still reproduce byte-for-byte — on
      the **live default path**, not behind a test-only flag. Design D3.
- [x] 3.2 The hint recorder narrates the repaired rule, so a Tricky board's plan
      completes. It reaches for it only as a **fallback**: the first cut ran it
      unconditionally, which silently re-planned Easy boards and was caught by a
      render snapshot. Design D5.
- [x] 3.3 The two-way placement reference aid is untouched — it judges shallowly
      from the visible board (`whyCantPlace`), never from the solver, so a
      stronger solver cannot leak into it.

## 4. Close out

- [x] 4.1 Spec delta `subsets` (three MODIFIED requirements); `help/games/subsets.md`
      no longer says the game has no adjustable parameters, and explains the
      backwards argument the Tricky tier asks for.
- [ ] 4.2 Full gate green; owner acceptance.
