# assert-that-tiers-bind — tasks

## 1. The guard

- [ ] 1.1 Add the assertion to `difficulty-contract.test.ts`, over the `tiered`
      population that file already derives. For each **leaf preset** whose
      `contract.tierOf(params)` is a number, generate `seedBudget(…)` boards and
      require `lowestSolvingCap(...) === tierOf(params)`.
- [ ] 1.2 Do **not** route it through `paramsForTier`. Write the reason in the
      doc comment: that helper answers "the cheapest preset valid at this tier",
      which for this property is the wrong key and produced ten false convictions
      across four games before it was re-keyed (proposal § "The instrument").
- [ ] 1.3 Skip a tier the game already declares special — `nonUniqueTiers`
      (Dominosa's "Ambiguous" promises the opposite of unique solvability) and
      `nonMonotone` (Boats, whose lowest cap is not a well-defined floor). Derive
      the exemption from those declarations; **add no roster.**
- [ ] 1.4 Carry the vacuity guard: count the preset cases actually asserted and
      assert the count is above a floor well below today's 285. A `tierOf` that
      started returning `undefined` would otherwise make the whole sweep pass
      over nothing.
- [ ] 1.5 **Prove it fails.** Loosen the comparison to `<=` and watch it stay
      green (it must not — that is the current state); then restore, and break
      one honest game's generator acceptance deliberately and watch it go red.
      A guard nobody has seen fail is a guard nobody has seen work.
- [ ] 1.6 Tier the cost. Full sweep is ~150 s at four seeds; the gate slice
      samples through `seedBudget`, the matrix runs under `PUZZLES_SLOW_TESTS`.
      State in the doc comment what the gate slice still covers, per
      `testing/slow.ts`'s own rule.

## 2. Undead

- [ ] 2.1 **Decide which of two things is true**, by reading rather than
      assuming: does Undead's generator fail to enforce its stated grade, or does
      `cappedSolveFor` disagree with the grade the generator computed? The
      measurement (`lowestSolvingCap` = 0 on boards the menu calls Normal) is
      consistent with both, and they need opposite fixes.
- [ ] 2.2 Fix accordingly. If the generator is the problem, its accept test must
      require the ladder to *need* the Normal rung, not merely to reach a
      solution within it. If small sizes genuinely cannot carry Normal, the
      honest answer is `validateParams` refusing with a reason — the shape
      `grade-difficulty-tiers-honestly` established for Bricks' Tricky, and
      already permitted by the "generates every declared tier, or refuses it
      with a reason" assertion.
- [ ] 2.3 Re-found Undead's differential fixtures rather than re-recording them
      (`AGENTS.md` § "Upstream policy"): state, in the change, what property
      replaces the moved bytes. A fixture unchanged by a generator correction
      means the correction did not reach generation — check that before
      accepting a green run.
- [ ] 2.4 Undead ships a `hint()`, so `hint-resume.test.ts` and the six other
      hint guards already cover the corrected boards. Re-run them and say so;
      do not add a per-game duplicate.

## 3. Record what the measurement decided about the vision

- [ ] 3.1 The generators comply 282/285 by hand. Record in `ts-engine` that the
      accept-loop *correctness* case is measured and near-zero, so a future
      proposal to have the framework own the strip/accept loop must argue
      economy and not correctness — with this figure and its date attached, as a
      measurement rather than a claim (`AGENTS.md` § "A count written in prose").
- [ ] 3.2 Mark the `guarantees.md` "tiers bind" row shipped, in place, citing
      this change — `docs/framework-rdd/` is fiction and a shipped row may not
      read as future (repo-layout spec, "Design-fiction docs are labeled and
      quarantined"). The live contract goes in
      `docs/games/solver-and-generator.md`.

## 4. Close

- [ ] 4.1 `npm run gate`. Run the app on Undead at each tier and confirm the
      Normal boards now feel like Normal boards.
- [ ] 4.2 Owner acceptance for the Undead half only (boards a player is dealt at
      a named difficulty). The guard half is an internal contract — archive it
      with the same self-driven initiative it was created with.

## Findings

_(none yet — not started)_
