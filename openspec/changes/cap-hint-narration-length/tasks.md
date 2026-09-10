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
- [x] 4.3 `openspec validate --all --strict`, then the gate: green in
      2c5d8edb (8,744 tests). The gate's probe anchor caught the moved
      `populateText` line, which is now re-anchored on its new wording.
- [x] 4.3a The article trap, found by `extract-hint-strings` once every
      sentence sat in one file: six sentences said "a 8" at an 8 — Keen's
      cage line, Solo's `dup`, Crossing's two shared-digit arms and its
      one-digit note strike, Dominosa's two duplicate-domino arms. Each now
      picks "a"/"an" by the value through the engine's `indefinite`, as the
      shared `dup` arm already did.
- [x] 4.5 The owner-requested review (2026-09-10): four review agents read all
      30 text files against the guide, the help pages and the call sites, and
      every finding was re-checked against the solver before it was acted on.
      About 25 clear defects fixed. False claims: Unruly's `unique`,
      Dominosa's `localDuplicate2` and `mustOverlap`, Unequal's no-bar
      adjacency, the chain's "in line with" when Solo's last link shares only
      a block or diagonal, Boats' board edge and "ships" for boat squares and
      its center count's room, Range's cut vertex, Slant's dead end, Group's
      "You've filled" on givens, Undead's zero total. Degenerate values: "1
      neighbors", "all 2 of", "cells 1 to 2", "the 1 square", "All 2 letters",
      Palisade's clue 0. Grammar: Inertia's dangling appositive, "and" under
      a negation (now "or", through the engine's `joinOr`). Glyphs: Solo and
      Unequal now print a value as the board draws it past 9. A duplicate list
      ("e, e, a, d, h and h") from the shared set arm. Galaxies' and Undead's
      help pages. Periods for Fifteen, Sixteen and Flood, one voice with
      Netslide and Inertia.
- [x] 4.6 The walk measured the wrong population: every tier of the easiest
      preset only, so Adjacent, Killer, X and Number Ball never spoke in it.
      It now also walks every preset once, and the twenty-odd sentences it had
      never heard over 120 were shortened (Solo and Group joined the chain's
      entry, which they had always needed).
- [x] 4.7 Owner decisions, 2026-09-10. Light Up says "can't hold a bulb" where
      it said "crossed out", a mark the game draws as a dot, and "ruled out"
      for squares the player has marked. The shared set arm says "Other cells"
      where it said "Another group of cells", which collided with Group's own
      name for its table; Group's letters stay bare, as the board draws them.
      Palisade's general region bound and Boats' hidden-number sentences, the
      two arms over 120 that no preset reaches, are shortened: Palisade states
      the bound without the side-counting behind it, and Boats folds the hidden
      number into the sentence instead of opening with it.
- [ ] 4.4 Owner acceptance: the wording is player-visible in 24 games. Not
      archived until then. The owner has chosen (2026-09-10) to review it
      **after `extract-hint-strings`**, reading each game's sentences in one
      place rather than across its deduction code.
