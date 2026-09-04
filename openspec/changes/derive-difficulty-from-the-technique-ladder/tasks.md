# derive-difficulty-from-the-technique-ladder — tasks

Scaffolded 2026-09-04. **Ready to implement.** First of the game-definition
work; nothing blocks it.

## 1. Establish the real scope (by reading, not grepping)

- [ ] 1.1 List the games whose solver runs on the shared runner. **Do not grep
      for `runDeductionFixpoint`** — Boats and Loopy mention it only in doc
      comments explaining why they do *not* use it. Read the call, or key on the
      import plus an actual call expression.
- [ ] 1.2 Intersect with the games declaring a `DifficultyContract` (the
      registry knows: `game.difficulty !== undefined` — the same route
      `difficulty-contract.test.ts` takes, not a source scan).
- [ ] 1.3 State both counts and the overlap. Carry a vacuity guard.

## 2. Expose the ladder's tiers

- [ ] 2.1 A ladder can report its distinct declared tiers, in order. Decide
      where that lives — on the runner, or as a helper over a `DeductionTechnique[]`
      — preferring whichever does not make a game hand the runner its ladder twice.
- [ ] 2.2 The tiers a game *offers a player* may be fewer than the tiers its
      ladder declares (a game may cap below its top rung). Check this against the
      corpus before assuming they are the same list; `difficulty.ts` already warns
      that `DIFF_*` constants mix rungs with solver verdicts.

## 3. Project

- [ ] 3.1 Derive `tiers` where the ladder supports it; keep the hand-written
      form first-class for every other game.
- [ ] 3.2 `tierOf` / `withTier` stay per-game — they are about the params
      record, which the ladder knows nothing about.
- [ ] 3.3 Decide `solveAtCap` on evidence: the capping is shared, the verdict
      mapping is not. Record the decision either way.

## 4. Prove it

- [ ] 4.1 For every in-scope game, the derived tier list equals the hand-written
      one **before** either is removed. A disagreement is a finding to
      investigate, never a reason to adopt the more convenient answer.
- [ ] 4.2 Check what `difficulty-contract.test.ts` actually covers before
      relying on it as the net — the frozen differentials do not see tiers, so
      this is the only guard, and a guard nobody has seen fail is a guard nobody
      has seen work.
- [ ] 4.3 Break the derivation deliberately and watch it go red.

## 5. Close out

- [ ] 5.1 `docs/games/mechanics.md` (declaring) and
      `docs/games/solver-and-generator.md` (grading) — the contract is now
      partly derived; say which half and for which games.
- [ ] 5.2 `docs/framework-rdd/game-definition.md` — mark the shipped half of
      "Params and presets" in place, per the repo-layout spec.
- [ ] 5.3 Full gate, commit, archive.

## Findings

_(none yet — not started)_
