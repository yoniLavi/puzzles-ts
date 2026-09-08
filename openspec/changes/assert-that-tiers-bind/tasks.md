# assert-that-tiers-bind — tasks

## 1. The guard

- [x] 1.1 Add the assertion to `difficulty-contract.test.ts`, over the `tiered`
      population that file already derives. For each **leaf preset** whose
      `contract.tierOf(params)` is a number, generate `seedBudget(…)` boards and
      require `lowestSolvingCap(...) === tierOf(params)`.
- [x] 1.2 Do **not** route it through `paramsForTier`. Write the reason in the
      doc comment: that helper answers "the cheapest preset valid at this tier",
      which for this property is the wrong key and produced ten false convictions
      across four games before it was re-keyed (proposal § "The instrument").
- [x] 1.3 Skip a tier the game already declares special — `nonUniqueTiers`
      (Dominosa's "Ambiguous" promises the opposite of unique solvability) and
      `nonMonotone` (Boats, whose lowest cap is not a well-defined floor). Derive
      the exemption from those declarations; **add no roster.**
- [x] 1.4 Carry the vacuity guard: count the preset cases actually asserted and
      assert the count is above a floor well below today's 285. A `tierOf` that
      started returning `undefined` would otherwise make the whole sweep pass
      over nothing. → per-game (`checked > 0`) plus a sweep-wide floor of 50.
- [x] 1.5 **Prove it fails.** → reverted the Undead fix and re-ran: red, with
      `undead: "4x4 Normal" claims tier 1 ("Normal") but its board needs cap 0`.
      Restored; green. The guard has been seen to fail on the real defect, not on
      a synthetic one.
- [x] 1.6 Tier the cost. Full sweep is ~150 s at four seeds; the gate slice keeps
      **one preset per declared tier** at one seed, the slow tier walks every
      preset at three. Measured: the whole file runs in **11.9 s**. The slice is
      keyed on tier rather than on count because tier is the axis the property is
      about — dropping to a single preset would stop measuring it.

## 2. Undead

> **Answered by reading, 2026-09-08 — and the answer was the second one.** Task
> 2.1 asked which of two opposite things was true. `gradeMatchesTier` in
> `undead/generator.ts` is honest (Easy = `RUNG_ARC` within
> `EASY_MAX_ARC_PASSES`); the contract's `solveAtCap` runs `RUNG_ARC` with **no
> pass bound**, so it grades every Normal board as Easy-solvable. The generator
> is right and the instrument is wide.

- [x] 2.1 Decide which of two things is true, by reading rather than assuming.
      → the contract, not the generator.
- [x] 2.2 Give `solveAtCap` the pass cap at `DIFF_EASY`. `EASY_MAX_ARC_PASSES`
      moved from `generator.ts` to `solver.ts`, beside the rung constants, and
      both readers import it — one spelling, because a second copy is what the
      defect was.
- [x] 2.3 Check what else consumed the wide grade. → **only the cross-game
      guards.** `solveAtCap` is reached solely through `cappedSolveFor`, which no
      production module calls; the difficulty contract's production readers are
      `difficultyTiers` and `difficultyChoiceItem` (the params form), which never
      touch it. So the blast radius was the monotonicity sweep grading Undead
      against an Easy that was not Undead's — re-run, still green, now for the
      right reason.
- [x] 2.4 **Assert no board moved.** → `git status` after the fix shows three
      source files and **no fixture, no snapshot**; Undead's own 50 tests pass
      unchanged. The fix does not reach generation, which is what it had to prove.
- [x] 2.5 Undead ships a `hint()`; re-ran `hint-resume`, `hint-quality`,
      `hint-overlay` and `difficulty` — 199 tests, all green. No per-game
      duplicate added.

## 3. Record what the measurement decided about the vision

- [x] 3.1 The generators comply 282/285 by hand. Recorded in the `ts-engine`
      delta as "The generator accept loop's correctness case SHALL be argued from
      measurement", with the figure, its date and its change id attached.
- [x] 3.2 `guarantees.md`'s "tiers bind" row struck through and marked SHIPPED in
      place, with the three things it taught that the table did not anticipate.
- [x] 3.3 `docs/games/solver-and-generator.md` § "A tier means exactly its rung"
      gains the two-spellings trap and its Tell, with Undead as the worked
      example and the new guard named.
- [x] 3.4 `docs/games/testing.md` § "How a cross-game guard finds its population"
      gains rule 6 — *ask a question the system is actually asked* — with the
      ten-versus-three measurement and a Tell keyed on `with*`/setter-built
      inputs.

## 4. Close

- [ ] 4.1 `npm run gate`.
- [ ] 4.2 Archive under self-driven initiative. No owner acceptance: nothing a
      player sees changes — Undead's Normal boards were always Normal, and it was
      the grading instrument that said otherwise.

## Findings

**282 of 285 preset cases already bound**, measured over every leaf preset of
every tiered game at four seeds. The three exceptions were all Undead's Normal
presets, and the cause was the difficulty contract rather than the generator.

**The first instrument reported ten violations across four games** (Solo, Group,
Undead, Unequal) because it keyed on `paramsForTier` — the cheapest preset
*valid* at a tier — which asks a question no generator answers. Re-keyed on the
presets a player picks: three, one game, all real. Both halves are now written
into `docs/games/testing.md` rule 6 and the `ts-engine` delta, because the
correction is more reusable than the finding.

**The rule was already normative and already had a helper.** `ts-migration`
§ "A difficulty tier binds the board it generates" and
`engine/difficulty.ts`'s `solvableAtExactlyTier` both predate this change; the
first draft of the proposal was about to add a second copy of the rule. What was
missing was only the check — which is the fifth time this vision has predicted a
framework organ and produced a guard instead.
