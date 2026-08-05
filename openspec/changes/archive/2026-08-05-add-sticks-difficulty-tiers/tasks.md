# Tasks — add-sticks-difficulty-tiers

> **Outcome: withdrawn at the gating spike, 2026-08-05.** Task 0 held an explicit
> licence to end the change, and it fired. Full evidence in `design.md`; the
> one-line version is that **every board the shipped solver declines is
> genuinely ambiguous** (0 of 300 candidates were uniquely-solvable-but-unsolved),
> so there is no population of boards for a harder tier to be made of.

## 0. Spike: is there a second rung? (gating)

- [x] 0.1 Survey techniques beyond "tentative placement contradicts". Two
      candidates were taken forward: the **one-level hypothetical** (Clusters'
      Tricky rung — a proof by contradiction, not a guess) and **correcting the
      `x > 1` / `y > 1` reachability bugs**, which makes `sticksValidate`
      stronger at no search cost. Deliberately not a literature survey: the
      repo already has a working, narratable, policy-compliant deeper rung, and
      trying it costs an hour rather than a week.
- [x] 0.2 Implement each and measure what fraction of boards it decides that the
      current technique cannot.
      - Hypothetical: real but rarely reachable and expensive — 1 of 12 boards
        reached it within 8 minimisation shuffles at *both* presets, at ~1.5 s
        per pass at 10×10, i.e. **8–15 s per Tricky board**. Design S2.
      - Corrected reachability: **0 of 15** boards stripped an extra clue and
        **0 of 15** escaped the shipped solver, at both presets. Design S3.
      - And the reason both fail: the shipped solver already decides **every**
        uniquely-solvable board this generator produces. Design S1.
- [x] 0.3 **Decision: stop.** Rung A is real but the generator can rarely fill
      it and it costs an order of magnitude more than the slowest game in the
      collection; rung B does nothing at all. Task 0.3's own bar — *"a tier the
      generator can rarely fill is worse than no tier"* — settles it.

## 1. Tiers — not done, and deliberately

- [~] 1.0–1.3 Withdrawn with the change. No difficulty parameter, no presets per
      tier, no `paramConfig` entry, no `Game.difficulty` contract: Sticks stays a
      one-tier game, and the cross-game guards correctly leave it alone (they
      enrol on the presence of a difficulty `paramConfig` choice).

## 2. Assurance

- [x] 2.1 The byte-match differential is untouched, because the solver is
      untouched. Nothing needed an `upstreamLooseGate`.
- [x] 2.2 **The `x > 1` / `y > 1` quirks are kept, and now for a measured reason
      rather than an inherited one: they are inert.** Correcting them changes no
      verdict on any board sampled at either preset (design S3). They are real
      reachability bugs that are never reached.

## 3. Close out

- [x] 3.1 No `sticks` spec delta — the change alters no behaviour. `help/games/sticks.md`
      is unchanged for the same reason; it never promised difficulty settings.
- [x] 3.2 **The residue that does ship**: `sticks.test.ts` now asserts that every
      generated board has exactly one solution *and* that the shipped deduction
      finds it, at both presets, using an independent branch-and-count oracle
      proved non-vacuous in the same test. For a one-tier game that property is
      what "graded honestly" means, and it was previously unasserted.
- [ ] 3.3 Owner acceptance of the withdrawal.
