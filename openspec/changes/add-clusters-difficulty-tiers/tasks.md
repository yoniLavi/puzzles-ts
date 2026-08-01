# Tasks — add-clusters-difficulty-tiers

- [ ] 1.1 Add the difficulty parameter: encode/decode, default that reproduces
      today's boards for an ID with no difficulty character, `validateParams`.
- [ ] 1.2 Generator gate: Easy solves at 0; Tricky solves at 1 and not at 0.
- [ ] 1.3 Presets across both tiers; `paramConfig` entry so the Custom dialog
      offers it (a port that forgets this ships a blank dialog).
- [ ] 1.4 Measure generation cost per tier by the tail, not the median — the
      and-not gate adds a solver run and rejections.
- [ ] 2.1 Property test: a Tricky board is not solvable at level 0; an Easy board
      is.
- [ ] 2.2 Differential: determine whether the existing fixtures still byte-match
      at Tricky. If not, re-found on uniquely-solvable-at-exactly-its-tier and
      record the loss.
- [ ] 2.3 Hint (`add-clusters-hint`) re-checked against both tiers.
- [ ] 3.1 Spec delta `clusters`; update `help/games/clusters.md`, which currently
      documents Width and Height only.
- [ ] 3.2 Full gate green; owner acceptance on how the tiers feel.
