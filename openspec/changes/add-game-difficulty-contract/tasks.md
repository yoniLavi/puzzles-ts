# add-game-difficulty-contract — tasks

> **Re-scoped 2026-08-05.** This change was scaffolded on 2026-08-01 with two
> justifications, and the second has expired: *"`grade-difficulty-tiers-honestly`
> has to write the same fix 26 times"* described a change that has since landed
> and been archived (2026-08-04) — and it needed **four** games, not 26. The live
> reason is the one in the proposal: a shared `(generate, solveAtCap)` registry
> so cap-monotonicity is testable across all 28 tiered games instead of the four
> that hand-wrote it, keeping those four fixed tiers honest and unblocking
> `add-subsets-difficulty-tiers` / `add-sticks-difficulty-tiers`.

## 1. The contract

- [x] 1.1 Add `DifficultyContract<Params>` and `DifficultyVerdict` to
      `src/engine/difficulty.ts`, and the optional `difficulty?:` hook to
      `Game` in `engine/game.ts`. Optional, like `hint`/`findMistakes` before it,
      so the 29 untiered games need no edit.
- [x] 1.2 Add `solvableAtExactlyTier(game, params, desc)` — reports whether the
      board genuinely needs its tier. **Production** code: this is what
      `add-subsets-`/`add-sticks-difficulty-tiers` apply, and what
      `grade-difficulty-tiers-honestly` had to spell out four separate times.
- [x] 1.2a Do **not** specify it as "solve twice". Where a game's tiers are nested
      rungs of one fixpoint, both answers come from a single pass with the cheap
      rung first — Clusters, where that ordering made the generator faster than it
      was before it had tiers (`add-clusters-difficulty-tiers` D3). Take the game's
      verdict; let the game choose how many passes produce it.
- [x] 1.3 Unit-test the helper against a fake game before any real game uses it
      (`engine/fake-game.ts` is the existing double).

## 2. Implement it, easiest first

- [x] 2.1 **Magnets first** — it already has the hand-written monotonicity test
      from `adopt-shared-deduction-fixpoint`, so its adapter can be validated
      against a known-good result before the pattern is repeated 27 times.
- [x] 2.2 Delete Magnets' bespoke test once the cross-game guard covers it. Two
      tests asserting one property is how they drift apart. Rome's and Salad's
      hand-written versions are the same call: three phrasings of one property
      already differ in strength (Magnets sweeps every cap, Rome checks only the
      top, Salad folds it into a generation test).
- [x] 2.3 The remaining 27, in any order. Each adapter is written against the
      **solver's own documented return contract** (each solver header states its
      `-1 / 0 / 1` meanings — they are not uniform, which is exactly why the
      verdict type is a union).
- [x] 2.4 Do **not** rename the params field (see design D3). The real obstacle
      is not the `diff` (25) / `difficulty` (3) name split but that **eight games
      type it as a string union or enum** (Galaxies, Keen, Mathrax, Singles,
      Spokes, Towers, Undead, Unequal), each with a private `diffToLevel` — so
      `withTier` must go through the game, not around it.
- [x] 2.5 Each adapter also owns "build this game's solver input from a desc",
      which is where the seven different solver input shapes (`State`, a board
      struct, a reusable `SolverScratch`, a solver class) get normalised.
      **Never reuse a live `SolverScratch`**: `grade-difficulty-tiers-honestly`'s
      first Ascent gate did, and its retained `foundEndpoints` deliberately
      *weakens* the solver, so the gate under-rejected and left side effects.

## 3. The guards

- [x] 3.1 One cross-game file iterating every game declaring `difficulty`.
- [x] 3.2 **Cap-monotonicity**: lowest cap that solves ⇒ every higher cap solves.
- [x] 3.3 **Every declared tier is reachable**: generation succeeds at each.
- [x] 3.4 **The declared tiers match the game's own difficulty `paramConfig`
      choices** — *not* its `DIFF_*` constants, which cannot carry that weight
      (Solo has 8 constants and 6 tiers; Galaxies 5 names and 2 tiers; Singles a
      `DIFF_MAX` and a `DIFF_ANY`; Salad a `DIFF_HOLESONLY` at −1). A `DIFF_*`
      constant is sometimes a deduction rung and sometimes a solver verdict.
- [x] 3.5 **Derive the enrolled set from the registry**, not from a list: every
      registered game with a difficulty `paramConfig` item must declare the
      contract. The naming convention already missed Bridges once, and a guard
      blind to a game cannot fire on it.
- [x] 3.6 **Boats declares `nonMonotone`** and the guard asserts its *workaround*
      instead — solving at each tier in turn and taking the first success always
      succeeds. A skipped game is an untested game wearing a comment.
- [x] 3.7 Keep the guard's per-game cost bounded — it generates real boards for
      28 games across every tier. Seed deterministically, cap the sample, and
      obey the "seed-deterministic, never clock-gated" rule (playbook §5.2).
- [x] 3.8 Guard the instrument: assert how many games were *inspected*, not only
      how many offended. Every rule here reports offenders, so an enrollment
      derivation that silently finds nothing would go green having checked
      nothing (`module-layering.test.ts` carries the same guard, for the same
      reason).
- [x] 3.9 **Prove the monotonicity guard fires before trusting it** — remove
      Boats' `nonMonotone` declaration and confirm it fails. The first version
      sampled one board per tier and did **not** fire (Boats' first seed is
      monotone; 7 of 8 are not). Four boards per tier at the gate, twelve under
      `npm run test:slow`. Design D8.
- [x] 3.10 **A tier may relax the puzzle's promise rather than deepen its
      ladder** — Dominosa's "Ambiguous" declares `nonUniqueTiers` and the guard
      swaps to asserting non-uniqueness. Unanticipated; found by the guards.
      Design D7.

## 4. Verify it is a no-op

- [x] 4.1 Every differential fixture unchanged. The contract only *describes*
      what each game already does.
- [x] 4.2 A moving fixture means an adapter misreports its game's solver — a
      defect in this change, not a new baseline.
- [x] 4.3 Full gate green.

## 5. Report what the guards found

- [x] 5.1 **Expect failures.** Cap-monotonicity has never been checked on 24 of
      these games and was false on Boats. Each failure is a shipped bug.
- [x] 5.2 Record each one. **Fix each under its own change**, not here —
      absorbing behaviour changes into a change that claims to be a no-op is how
      a regression gets misfiled.
- [x] 5.3 **The result, stated plainly: 28 tiered games, and every one is monotone
      in its cap** except Boats, which declares itself and passes the workaround
      guard instead. That is a real result, not an absence of looking — the guard
      was proved to fail first (see §3.9).

## 6. Close out

- [x] 6.1 Update `docs/porting/game-port-playbook.md`: a new tiered game declares
      `difficulty` and is enrolled in the guards automatically.
- [x] 6.2 Note in `add-subsets-difficulty-tiers` and `add-sticks-difficulty-tiers`
      that `solvableAtExactlyTier` now exists, so each applies one helper instead
      of re-deriving the acceptance rule.
- [x] 6.3 Re-run `npm run metrics`.
