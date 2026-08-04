# Tasks — add-clusters-difficulty-tiers

- [x] 0.1 **Measure first**: does either tier have boards? 100 boards per size,
      asking of each whether the single-cell rule alone finishes it. Both tiers
      are dense (Tricky 36% at 7×7 rising to 54% at 10×10) — design D1.
- [x] 1.1 Add the difficulty parameter: encode/decode, default that an ID with no
      difficulty character lands on, `validateParams`.
- [x] 1.2 Generator gate: Easy solves at 0; Tricky solves at 1 and not at 0.
      Cheap rung first, so the common case costs one solver run — design D3.
- [x] 1.3 Presets across both tiers; `paramConfig` + `describeParams` so the
      Custom dialog offers it (a port that forgets this ships a blank dialog).
- [x] 1.4 Measure generation cost per tier by the tail, not the median — the
      and-not gate adds a solver run and rejections.
- [x] 1.5 **Not in the proposal**: bound the retry loop. Clusters had none — the
      `MAX_ATTEMPTS` constant was only the `force` cadence — which a second
      acceptance test turns from an accident into a hang. Design D5.
- [x] 1.6 **Not in the proposal**: perturb the grid when rejecting a *completed*
      candidate, or the retry loop is a fixed point that draws no randomness and
      never terminates. One flipped cell, not a reset — the loop is a hill-climb
      and resetting it costs 5–7× the generation time. Design D4.
- [x] 1.7 **Not in the proposal**: refuse 1×2 and 2×2, which upstream's area
      check admits and which have no puzzle at any difficulty. Pre-existing, and
      an outright hang before 1.5 bounded the loop. Design D7.
- [x] 2.1 Property test: a Tricky board is not solvable at level 0; an Easy board
      is.
- [x] 2.2 Differential: the existing fixtures still byte-match, via the `spokes`
      `upstreamLooseGate` shape. No fixture re-founded — design D7.
- [x] 2.3 Hint (`add-clusters-hint`) re-checked against both tiers.
- [x] 3.1 Spec delta `clusters`; update `help/games/clusters.md`, which currently
      documents Width and Height only.
- [x] 3.2 Full gate green (254 files / 6755 tests); owner-accepted 2026-08-04,
      after a Chrome pass over the preset menu, the Custom dialog, the
      too-small-for-Tricky refusal and a hint on a Tricky board.
