# cap-hint-narration-length — tasks

## 1. Measure before choosing

- [x] 1.1 Census every step across 30 games, every tier, walked into the middle
      game: median 84, p75 110, p90 147, longest 280. Counts over 100–250 put
      in front of the owner, who chose 120.

## 2. The linter

- [x] 2.1 `NARRATION_LIMIT` = 120 and the two-way `LONG_NARRATIONS` ledger in
      `hint-quality.test.ts`, the old 300 ceiling now what a ledgered sentence
      is held to; the easiest-preset check it replaces is removed.
- [x] 2.2 Walk as deep as the census. An eight-plan walk was tried first and the
      ledger's own check caught it: Light Up's discount arms never fired that
      shallow, so their live entry read as dead.

## 3. The pass

- [x] 3.1 Shorten every sentence over 120 that can lose words without losing a
      premise: rules preambles to the help, premises the picture shows, fat.
- [x] 3.2 Ledger the rest with reasons: the Latin chain, Clusters' chain,
      Towers' line-full, Salad's border clues, Light Up's discount pair,
      Palisade's quoted exemplar and its two-3s case, Singles' offset and corner
      family, Boats' two-case diagonal, Subsets' owner-requested example.
- [x] 3.3 Keep every per-game guard's intent when moving its pinned wording
      (deixis ties, kind-detection phrases, necessity checks).
- [x] 3.4 Retire Boats' per-game 170 cap; keep Netslide's and Spokes' 120.

## 4. Close

- [x] 4.1 `docs/games/hints.md` § "Keep the narration terse" updated, with
      the four techniques the pass used, in order of how often they applied.
- [x] 4.2 Ran the app (Chrome) and read the first hint in Tracks, Range and
      Undead. It caught what no test did: "already sees all 2 of its white
      cells" reads wrong, and Tracks' clue-is-met arm had the same shape. Both
      now say "both" at 2, as Salad's line counts already did, and Tracks'
      narrate test pins it.
- [ ] 4.3 `openspec validate --all --strict`, then the gate. Owner acceptance:
      the wording is player-visible in 24 games.
