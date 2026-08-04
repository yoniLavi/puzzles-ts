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

- [ ] 2.0 **Read the generator's retry loop before touching the gate.** If it
      carries state between attempts, a rejection that can now land on a
      *completed* candidate must perturb rather than discard — a plain refusal is
      a hang, and a full reset is 5–7x the cost. See the Clusters section in
      `proposal.md`.
- [ ] 2.1 Difficulty parameter: encode/decode, a default for an ID with no
      difficulty character — argued, not assumed: "the tier that reproduces
      today's boards" may not exist — plus `validateParams`.
- [ ] 2.2 Gate: easier tier solvable without the repaired rule; harder tier
      requires it and is not solvable without it. Run the rung *below* first where
      the two nest — it is free, and skips the expensive rung on every candidate
      the cheap one settles.
- [ ] 2.3 Presets per tier, and the game's first `paramConfig` entry.
- [ ] 2.4 Measure generation cost by the tail, and measure any parameter floor
      rather than reasoning one out — the Clusters guess was more than twice the
      measured value, and its obvious predicate was the wrong one.

## 3. Assurance

- [ ] 3.1 **First try to keep the byte-match**, by holding the unrepaired arrow
      rule behind an `upstreamLooseGate`-style flag set by the differential alone
      (the Spokes shape; Clusters kept its oracle in full this way). Only if that
      genuinely cannot express the old verdict: retire it, replace with
      uniquely-solvable-at-exactly-its-tier, keep the C fixtures as verdict checks
      where meaningful, and **record what was lost**.
- [ ] 3.2 `add-subsets-hint`'s explanations cover the repaired rule — a hint that
      cannot narrate a deduction the solver uses fails the bar.
- [ ] 3.3 The two-way placement reference aid still judges shallowly from the
      visible board, not from the stronger solver.

## 4. Close out

- [ ] 4.1 Spec delta `subsets`; update `help/games/subsets.md`, which currently
      states the game has no adjustable parameters.
- [ ] 4.2 Full gate green; owner acceptance.
