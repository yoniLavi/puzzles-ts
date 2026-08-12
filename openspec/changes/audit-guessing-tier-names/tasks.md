# Tasks

## 1. Read the rungs before touching anything — **done**, [`audit.md`](./audit.md)

- [x] 1.1 `engine/latin.ts`: classify `forcing` by the propagation test, and
      measure the chain length. **Never shorter than 3 implication links**, over
      517 firings in 13 configurations; the short chain a length-split would
      have exempted does not exist, because set elimination has already eaten it
      (design D2).
- [x] 1.2 The Latin games' own hard rungs (Towers, Keen, Unequal, Solo, Group —
      plus Salad and Mathrax, which the proposal missed): the forcing rung is
      what separates `Extreme` from the tier below in every one of them, and the
      cost of moving it is measured per game.
- [x] 1.3 The others the policy names — Spokes, Bricks, Boats, Sticks, Undead —
      **plus six the proposal's list missed**: Map, Dominosa, Clusters, Seismic,
      Solo and Mathrax. Lightup, Pattern, Range, Subsets, Ascent, Pearl, Bridges
      and Rome cleared.
- [x] 1.4 The classification written down as a table: `audit.md` §2, with the
      no-change verdicts (§2a, §2d) carrying their reasons.
- [x] 1.5 Cross-check the instrument: re-solve every board with the rung
      switched off. Agrees exactly in 13/13. Caught a first-run error where the
      counter was measuring the *generator's* trial solves as well as the
      player's deductions (`audit.md` §3).

## 2. Apply the rule literally (owner decision, 2026-08-12 — design D5)

Every propagating rung ends under a tier named `Unreasonable`. Order is
cheapest-first so the pattern is established on a game where the move costs
nothing measurable.

### 2a. The two renames (design D7) — prerequisite for 2b — **done**

- [x] 2a.1 Unequal: `DIFF_NAMES` `Recursive` → `Unreasonable`. Difficulty char
      stays `r`; game IDs, saved games and shared links unaffected.
- [x] 2a.2 Mathrax: the same.
- [x] 2a.3 Every user-visible spelling swept. Two were not where a grep for the
      word would look: Unequal's custom-params dialog **hand-copied** the tier
      list instead of using `DIFF_NAMES` (now `[...DIFF_NAMES]`, so a future
      rename cannot ship a menu and a dialog that disagree), and Mathrax's
      size-3 refusal message names two tiers in prose (now built from
      `DIFF_NAMES`, so it says what the menu says). The help pages needed
      nothing — neither names its tiers.

### 2b. Move the rung up, where an `Unreasonable` tier already exists

Each needs its **viability measurement** (design D6) before it is called done —
the old tier must still generate, in acceptable time, from what is left.

Every one keeps its byte-match oracle through an `upstreamForcingTier` flag set
by that game's differential and nowhere else — the `upstreamLooseGate` / Spokes
shape, *diverge and keep the oracle*. The shared reasoning is written once, on
`LatinSolver.forcing`.

- [x] 2b.1 Mathrax: `diffForcing` `DIFF_TRICKY` → `DIFF_RECURSIVE`. Viability
      2 ms / 7 ms median at its two Tricky presets.
- [x] 2b.2 Keen: `diffForcing` `DIFF_EXTREME` → `DIFF_UNREASONABLE`. 16 ms
      median at the 6x6 preset.
- [x] 2b.3 Group: same move. 141 ms at 8x8. **12x12 Extreme regressed 4.2 s →
      8.5 s median, 63 s max — see 2c.8.**
- [x] 2b.4 Towers: same move. 6x6 Extreme 26 → 52 ms median. **4x4 Extreme
      became ungenerable and is now refused with a reason in `validateParams`**
      (caught by `difficulty-contract.test.ts`, not by the viability probe).
- [x] 2b.5 Unequal: same move (`DIFF_EXTREME` → `DIFF_RECURSIVE`). 13 ms median.
- [ ] ~~2b.6 Map~~ — **reverted; moved to 2c.7.** Map's solver has three gates
      and the forcing chain *is* the Hard one, so emptying it makes Hard
      identical to Normal and the preset generates **0 of 20**. Deleting a tier
      is what D5 forbids; Map needs a new deductive rung first.
- [x] 2b.7 Solo: same move. Survives at **670 ms median / 1.5 s max** (from
      24 ms) — the 98% cost is real but the generator finds the remainder.

### 2c. Rename the top tier, where there is nothing above it

Names picked from [`naming-survey.md`](./naming-survey.md), not by taste:
`Unreasonable` is the only tier word in the collection with a stable meaning —
nine games use it and in every one it is the last tier.

- [x] 2c.1 Salad: `Extreme` → `Unreasonable`; help page updated (it also
      dropped a sentence that read like the tier was ordinary).
- [x] 2c.2 Dominosa: `Extreme` → `Unreasonable` — its top *difficulty* tier;
      `Ambiguous` sits after it but is a different promise (no unique solution),
      not a harder rung.
- [ ] 2c.3 Bricks: `Normal` → `Unreasonable`?? — **needs its own design pass**:
      `Tricky` is declared-but-not-generable above it, so the rename has to
      decide what happens to the declared tier. Do not sweep.
- [x] 2c.4 Undead: `Tricky` → `Unreasonable`. This corrects
      `strengthen-undead-deduction`'s stated conclusion that the ladder needs no
      Unreasonable tier — that change measured the *recursion-only* residual at
      zero, which is sound and holds, but answers a different question from
      whether rung 3 propagates. It does.
- [x] 2c.5 Clusters: `Tricky` → `Unreasonable`; help page rewritten (it claimed
      "neither ever needs a guess", which is what this audit falsifies).
- [ ] 2c.6 Spokes: **needs its own design pass** — *both* `Tricky` and `Hard`
      propagate, and two tiers cannot both be `Unreasonable`. Do not sweep.
- [ ] 2c.7 Map: **needs its own design pass**, and it is the one game where the
      rung cannot simply move. Build the missing deductive rung for `Hard`
      (`solver-and-generator.md` § "Strengthening a solver instead of shipping
      guesswork", the Undead worked example), then re-grade, then move the
      forcing chain to `Unreasonable`. Map's own suite generates `DIFF_NORMAL`
      boards only, so add Hard/Unreasonable generation coverage in the same
      change.
- [ ] 2c.8 Group 12x12 Extreme performance: 4.2 s → 8.5 s median, **63 s max**.
      Custom-params-only, and the baseline was already marginal, but a
      minute-long "New Game" is not shippable. Options: bound the size, find a
      cheaper Extreme rung, or accept with a measured note. Owner call.

### 2d. The narration comes out (design D4, the Galaxies precedent)

**Already true by construction in the five moved Latin games, and that is worth
knowing before writing any code**: every one of them caps its hint at
`Math.min(tier, DIFF_EXTREME)` — deliberately, so a hint never recurses — so
with forcing at `Unreasonable` **no hint in Towers, Keen, Group, Unequal or Solo
can reach the rung on any tier**. Their `case "forcing"` narration arms are now
unreachable.

- [x] 2d.1 Done, and one level deeper than planned: rather than deleting the
      arms alone, `forcing` is gone from `LatinReason` and Solo's reason union
      and the rung **no longer records at all**. Omitting the word from
      `GenericLatinReason` makes a sentence narrating a search a *compile* error
      rather than a convention, and the test that asserted the sentence is now a
      `@ts-expect-error` which fails to compile if the arm returns.
- [x] 2d.2 Salad's own `{ kind: "forcing" }` gone the same way, by disabling the
      rung in `recordSaladDeductions` (the hint's projection) while `saladSolve`
      keeps it — so no board moved.
- [x] 2d.3 **D8 settled by the owner (2026-08-12): consistency wins** — a
      multi-step search with backtracking is non-deductive everywhere, so no
      hint narrates one, Clusters included. Done for **Clusters, Undead, Bricks
      and Dominosa**; each keeps the rung in its *solve* path (the generator
      grades on it) and loses it from the recorder, so no board moved.
      - **Clusters** needed a two-way split rather than a deletion. Its `hint`
        refuses unless the plan verdict is `COMPLETE`, which is what proves no
        placed tile is wrong — so simply removing the rung made it refuse from
        *move one*. The walk now runs the lookahead to compute the verdict while
        recording only the leading single-cell run: **the search may certify a
        position, never teach one.**
      - Measured cost, per size, on the tiers that need it: the hint covers
        **61–74%** of the blanks (median 67–80% per board), never solves one to
        completion, and on **~3%** refuses immediately. `Easy` is 100%
        unaffected.
- [x] 2d.4 The dead machinery went with the narration rather than being left
      unreachable: Clusters' `chain` reason, `ChainStep`, its two what-if
      overlay bits and their render path; Bricks' `nextForcedMoveRecurse`;
      Dominosa's `forcingChain` tag; Undead's `recordForcingPass` and its
      `forcing` reason. A render path for an overlay no hint can emit reads as a
      live capability.
- [x] 2d.5 Bricks' `chain` reason was **also the direct rung's unclassified
      fallback**, narrated as "following the forced consequences" — a sentence
      untrue of the case that still reaches it. Renamed `localBreak` and
      re-narrated as what it is ("would break the board where it is ringed").
      That is the spec's no-un-narrated-fallback rule, found only because the
      guard forced a look at every arm.

### 2e. The differentials — **done for the six moved games**

- [x] 2e.1 No fixture was re-founded, because none had to be: each moved game
      threads an `upstreamForcingTier` flag that its differential — and nothing
      else — sets, so the frozen C byte-match still holds over the generator's
      draw order, every cheaper deduction and the codec, while players get the
      corrected rung. This is `solver-and-generator.md`'s "often you can diverge
      and keep the oracle as a test", the shape Spokes established and Mathrax's
      own `upstreamLooseGate` had already used twice in the same file.
- [x] 2e.2 Two *verdict* assertions did move, and both are honest regradings
      rather than losses: Mathrax's "each C board solves at its own tier" and
      Map's `gradeMap` now run under upstream's rung placement, with a comment
      recording that the board is unchanged and the tier it is *called* is the
      one whose techniques it needs.

## 3. Make the rule checkable

- [x] 3.1 The `ts-engine` delta carries D5's *determined* remedy — rung moves up
      where an `Unreasonable` tier exists, top tier renames where it does not, a
      tier is never deleted — plus the viability and keep-the-oracle scenarios.
      **Still to fold in:** whatever D8 settles about narrating an externalised
      what-if walk.
- [x] 3.2 Promoted into `src/engine/hint-quality.test.ts`. **Proving it fails is
      what made it real**, and it took three corrections:
      1. The first regex matched the *hypothesis* framing (`if this cell
         were …`) and instantly failed Clusters on a sound **single-step**
         refutation. A hypothesis is not the defect; carrying it forward is. Now
         it matches the chain vocabulary only.
      2. Planting a violation in Bricks then left it **green** — because the
         file samples `firstLeaf(presets())`, each game's *easiest* preset,
         and a trial rung is tier-gated so it can never fire there. It was
         guarding nothing on exactly the tiers it exists for. A second block now
         walks **every tier**, with a `checked > 0` guard so a game whose tiers
         all fail to generate cannot pass vacuously.
      3. That block found **three real defects** at once: Bricks' and Dominosa's
         live trial narrations, and a **crash** — Group's hint dereferenced
         `ops[0]` whenever deduction ran out, because
         `firstUnreflectedPlaceIndex` returns `ops.length` for "none" and that
         equals a valid index of `0` on an empty list. A sentinel colliding with
         a real value at the boundary.
      Galaxies keeps its own stricter copy (it also rejects `suppose` / `if it
      were`, which the shared one cannot); the note there says why.

## 4. Close out

- [ ] 4.1 Per-game spec deltas for every tier that moves.
- [ ] 4.2 Revert the measurement scaffold (`audit.md` §5).
- [ ] 4.3 `openspec validate audit-guessing-tier-names --strict`; owner
      acceptance; archive.

## 5. Follow-up scaffolded from the collection-wide survey

- [ ] 5.1 `unify-difficulty-tier-names` — the seven naming defects
      [`naming-survey.md`](./naming-survey.md) §5 found that are **not** about
      guessing: Unruly's top tier called `Normal`; Bridges' singleton `Medium`;
      `Easy` not always the bottom rung (Unequal, Solo, Group put another word
      below it); `Normal` spanning bottom (Salad) to top (Unruly); `Tricky` and
      `Hard` used interchangeably for the same role in 17 and 13 games; and the
      tiers no preset reaches (three of Group's five, plus five other games').
      Every one is player-visible and none is a correctness question, so it
      needs an owner decision on whether consistency is worth the churn before
      it is scoped — item 6 (`Tricky` vs `Hard`) is the large one and is not
      obviously a defect at all.
