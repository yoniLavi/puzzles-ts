# derive-difficulty-from-the-technique-ladder — tasks

Scaffolded 2026-09-04. Implemented 2026-09-04.

## 1. Establish the real scope (by reading, not grepping)

- [x] 1.1 Games whose solver runs on the shared runner — read the call, not the
      name. **14**: Group, Keen, Mathrax, Salad, Towers, Unequal (through
      `engine/latin.ts`); Clusters, Filling, Magnets, Pattern, Singles, Spokes,
      Undead, Unruly (directly). Boats and Loopy mention `runDeductionFixpoint`
      in doc comments only, as warned.
- [x] 1.2 Games declaring a contract, via the registry: **29**, not the 28 that
      `difficulty.ts` and two test headers claimed. Corrected in place.
- [x] 1.3 **Overlap: 12** (Filling and Pattern are untiered). Vacuity guard: the
      registry probe reported `registered=57`, and every one of the 29 was
      listed with its tiers rather than counted.

## 2. Expose the ladder's tiers

- [x] 2.1 **Cannot be done, and should not be.** Three independent reasons, in
      the proposal and now in the `ts-engine` spec: the ladder declares tier
      *numbers* and a tier list is *names*; the runner is downstream of the tier
      list and every ladder is built inside a solve from board state; and a tier
      is not always a rung.
- [x] 2.2 Checked, and the answer is the counterexample above: **Undead** offers
      three tiers while its only shared-runner ladder — the hint recorder —
      declares one. The five latin games offer a top tier that is
      `latinSolverRecurse`, outside the fixpoint, and the latin ladder
      synthesizes a rung for it that can never fire.

## 3. Project

- [x] 3.1 `tiers` derived — from the game's difficulty `paramConfig` item
      (`difficultyTiers`), the projection that exists. Removed from
      `DifficultyContract` and from 29 games. Eight games that wrote the names a
      second time in `paramConfig` now spread their own constant instead.
- [x] 3.2 `tierOf` / `withTier` stay per-game.
- [x] 3.3 `solveAtCap` stays per-game — decided on evidence, recorded in the
      spec. Its only shared step across 29 adapters is `newState(p, desc)`; the
      cap passes straight through, and the shared verdict mapping
      (`latinVerdict`) was already extracted.

## 4. Prove it

- [x] 4.1 The derived list equals the hand-written one **for all 29, by an
      existing green guard** rather than by inspection: `difficulty-contract.test.ts`
      asserted `[...tiers]` equals `[...choices]` for every enrolled game and is
      in the commit gate. No disagreement to investigate.
- [x] 4.2 Checked what that file covers before relying on it: 29 games enrolled
      (a floor of 25 guards the instrument), five properties each. Two gaps
      found and closed — nothing proved the derivation had found the *difficulty*
      item, and nothing checked the list for duplicate or blank tier names.
- [x] 4.3 Broken deliberately: dropping the `/^diff/` filter so the finder takes
      the first `choices` item turned 12 tests red across six games, including
      six instances of the new coupling check. Restored.

## 5. Close out

- [x] 5.1 `docs/games/mechanics.md` and `docs/games/solver-and-generator.md`.
- [x] 5.2 `docs/framework-rdd/game-definition.md` — the claim marked in place as
      refuted, per the repo-layout spec.
- [x] 5.3 Full gate, commit, archive.

## Findings

**The proposal's premise was wrong and the change is better for it.** The
duplication it set out to remove was real; the source it named could not remove
it. Following the evidence to `paramConfig` reached 29 games instead of 12, and
deleted a field from the `Game` contract rather than adding a derivation to it.

**A fourth name-keyed scan failed, in the sitting that was warned about three.**
`grep 'latinSolver('` returns Salad alone; the other five call sites are written
`latinSolver<Ctx>(`. The proposal's own warning was about doc comments, and this
was the opposite error — a *generic type argument* between the name and the
paren. `deduction-fixpoint.ts` still claims "the eleven latin-family games"
reach it through `latinSolverTop`; six do. Corrected in place.

**A guard's own comment had rotted into the thing it guards against.** The
removed `tiers === choices` check carried a hand-maintained list of "the eleven
that write the names out twice", naming Bricks, Undead and Unequal — all three of
which had since moved to spreading their shared constant. Eight games genuinely
duplicated, and the comment named three that did not while missing none. A
hand-maintained list inside the guard against hand-maintained lists.

**The removed assertion was weaker than it read.** Asserting `[...tiers]` equal
to `[...choices]` compares two string arrays; it cannot see that they describe
the same params field. Deriving forced the question, and the replacement —
`item.set(p, i)` and `withTier(p, i)` must move the same tier — is what actually
catches a finder that latched onto a mode or symmetry menu. Deleting a check can
be how you notice it was never checking what its name said.
