# add-game-difficulty-contract — tasks

## 1. The contract

- [ ] 1.1 Add `DifficultyContract<Params>` and `DifficultyVerdict` to
      `src/native/engine/difficulty.ts`, and the optional `difficulty?:` hook to
      `Game` in `engine/game.ts`. Optional, like `hint`/`findMistakes` before it,
      so the 31 untiered games need no edit.
- [ ] 1.2 Add `solvableAtExactlyTier(game, params, desc)` — solves at the
      requested tier and at one below, and reports whether the board genuinely
      needs its tier. **Production** code: this is what
      `grade-difficulty-tiers-honestly` will apply uniformly.
- [ ] 1.3 Unit-test the helper against a fake game before any real game uses it
      (`engine/fake-game.ts` is the existing double).

## 2. Implement it, easiest first

- [ ] 2.1 **Magnets first** — it already has the hand-written monotonicity test
      from `adopt-shared-deduction-fixpoint`, so its adapter can be validated
      against a known-good result before the pattern is repeated 25 times.
- [ ] 2.2 Delete Magnets' bespoke test once the cross-game guard covers it. Two
      tests asserting one property is how they drift apart.
- [ ] 2.3 The remaining 25, in any order. Each adapter is written against the
      **solver's own documented return contract** (each solver header states its
      `-1 / 0 / 1` meanings — they are not uniform, which is exactly why the
      verdict type is a union).
- [ ] 2.4 Watch for the three-way field split (`diff` 13, `difficulty` 12,
      `diffLevel` 1). Do **not** rename the fields — see design D3.

## 3. The guards

- [ ] 3.1 One cross-game file iterating every game declaring `difficulty`.
- [ ] 3.2 **Cap-monotonicity**: lowest cap that solves ⇒ every higher cap solves.
- [ ] 3.3 **Every declared tier is reachable**: generation succeeds at each.
- [ ] 3.4 **The declared tier list matches the game's own `DIFF_*` constants** —
      so a game that gains a tier cannot ship a stale list.
- [ ] 3.5 **Boats declares `nonMonotone`** and the guard asserts its *workaround*
      instead — solving at each tier in turn and taking the first success always
      succeeds. A skipped game is an untested game wearing a comment.
- [ ] 3.6 Keep the guard's per-game cost bounded — it generates real boards for
      26 games across every tier. Seed deterministically, cap the sample, and
      obey the "seed-deterministic, never clock-gated" rule (playbook §5.2).

## 4. Verify it is a no-op

- [ ] 4.1 Every differential fixture unchanged. The contract only *describes*
      what each game already does.
- [ ] 4.2 A moving fixture means an adapter misreports its game's solver — a
      defect in this change, not a new baseline.
- [ ] 4.3 Full gate green.

## 5. Report what the guards found

- [ ] 5.1 **Expect failures.** Cap-monotonicity has never been checked on 25 of
      these games and was false on Boats. Each failure is a shipped bug.
- [ ] 5.2 Record each one. **Fix them under `grade-difficulty-tiers-honestly`**,
      not here — that change already owns "make a tier mean what it says", and
      absorbing behaviour changes into a change that claims to be a no-op is how
      a regression gets misfiled.
- [ ] 5.3 If nothing fails, say so plainly: "26 tiered games, all monotone in
      their cap" is a real and reassuring result, and different from not looking.

## 6. Close out

- [ ] 6.1 Update `docs/porting/game-port-playbook.md`: a new tiered game declares
      `difficulty` and is enrolled in the guards automatically.
- [ ] 6.2 Note in `grade-difficulty-tiers-honestly` that `solvableAtExactlyTier`
      now exists, so it applies one helper instead of re-deriving the rule per
      game.
- [ ] 6.3 Re-run `npm run metrics`.
