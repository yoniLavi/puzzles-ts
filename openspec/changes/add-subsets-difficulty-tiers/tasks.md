# Tasks — add-subsets-difficulty-tiers

## 1. Repair the arrow deduction (gating)

- [ ] 1.1 Recover upstream's commented-out block from `subsets.c` in git history
      and work out what was wrong with it — do not assume it was merely unfinished.
- [ ] 1.2 Implement it soundly on the candidate cube.
- [ ] 1.3 **Prove soundness before anything depends on it**: over a wide sweep of
      boards with known solutions, the rule never eliminates a candidate that the
      solution uses. An unsound rule yields unsolvable puzzles.
- [ ] 1.4 Delete the "do not fix this" note at `applyArrowsAdvanced`; replace with
      what was repaired and why.

## 2. Tiers

- [ ] 2.1 Difficulty parameter: encode/decode, default reproducing today's boards
      for an ID with no difficulty character, `validateParams`.
- [ ] 2.2 Gate: easier tier solvable without the repaired rule; harder tier
      requires it and is not solvable without it.
- [ ] 2.3 Presets per tier, and the game's first `paramConfig` entry.
- [ ] 2.4 Measure generation cost by the tail.

## 3. Assurance

- [ ] 3.1 Retire the desc byte-match; replace with uniquely-solvable-at-exactly-
      its-tier; keep C fixtures as verdict checks where meaningful.
- [ ] 3.2 `add-subsets-hint`'s explanations cover the repaired rule — a hint that
      cannot narrate a deduction the solver uses fails the bar.
- [ ] 3.3 The two-way placement reference aid still judges shallowly from the
      visible board, not from the stronger solver.

## 4. Close out

- [ ] 4.1 Spec delta `subsets`; update `help/games/subsets.md`, which currently
      states the game has no adjustable parameters.
- [ ] 4.2 Full gate green; owner acceptance.
