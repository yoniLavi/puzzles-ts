# derive-the-type-menu-summary — tasks

Scaffolded 2026-09-05 from a defect found by running the app during
`declare-params-and-presets`. **Not ready to implement — task 0 first.**

## 0. Decide how the tier list crosses the worker boundary

- [ ] 0.1 `/opsx:explore`. `augmentation.ts` is main-thread and must not import
      the registry (`module-layering.test.ts` guards it); the worker has the
      game. Choose between sending the resolved tier *name* in `ConfigValues`
      and sending the tier list alongside, and record why in `design.md`.
- [ ] 0.2 Confirm the blast radius is only the `{difficulty:…}` token. The other
      spelled option lists (`{grid-type:…}`, `{strip-clues:…}`) have no second
      source and are not part of this.

## 1. Derive it

- [ ] 1.1 Resolve the difficulty word from `difficultyTiers(game)` rather than
      from a spelled list, for every game.
- [ ] 1.2 Delete the 25 spelled tier lists in `augmentation.ts`.
- [ ] 1.3 Fix the two stale doc comments in that file while rewriting it: the
      British-spelling instruction (AGENTS.md makes American the rule) and the
      "isn't currently possible in the C code" framing (there is no C).

## 2. The guard that was missing

- [ ] 2.1 Assert across the registry that no game's rendered difficulty word can
      differ from `difficultyTiers(game)`, including the tier *count*. Bricks
      renders three words for two tiers today, so the count is part of it.
- [ ] 2.2 Prove the guard fails before trusting it: reintroduce one wrong word,
      watch it go red, restore.
- [ ] 2.3 Vacuity guard: assert how many games the check actually looked at. A
      template-matching scan that finds nothing must fail, not pass.

## 3. Acceptance

- [ ] 3.1 Run the app. For at least three of the 19, open "Custom type…", pick
      a tier, and confirm the header names the tier that was picked.
- [ ] 3.2 Player-visible ⇒ owner acceptance before archiving.

## Findings so far

Measured 2026-09-05 by comparing each `{difficulty:…}` template in
`src/puzzle/augmentation.ts` against `difficultyTiers(game)`: **21 games carry
the token, 19 disagree with the game's real tiers.** The full list is in
`proposal.md`. Reproduce by walking the registry and re-running the comparison —
write the query, not its answer.
