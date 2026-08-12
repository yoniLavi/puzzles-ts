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

- [ ] 2c.1 Salad: `Extreme` → `Unreasonable` (cost of the alternative: 33% of
      the numbers-mode boards; not a preset, so no preset title moves).
- [ ] 2c.2 Dominosa: `Extreme` → `Unreasonable` (order 6 Extreme is a preset).
- [ ] 2c.3 Bricks: `Normal` → `Unreasonable`?? — **needs its own design pass**:
      `Tricky` is declared-but-not-generable above it, so the rename has to
      decide what happens to the declared tier. Do not sweep.
- [ ] 2c.4 Undead: `Tricky` → `Unreasonable`. Note this contradicts
      `strengthen-undead-deduction`'s conclusion that the ladder needs no
      Unreasonable tier — that change measured the *recursion-only* residual at
      zero, which is a different question from whether rung 3 propagates.
- [ ] 2c.5 Clusters: `Tricky` → `Unreasonable`.
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

- [ ] 2d.1 Delete those unreachable arms (`latin-hint.ts` `narrateLatinReason`,
      plus Towers' and Solo's copies). **Ordering:** the shared arm is also used
      by Salad, whose rung has *not* moved yet, so 2c.1 comes first — otherwise
      removing it breaks a live caller.
- [ ] 2d.2 The same for every other game whose hint narrates a rung that has
      moved to `Unreasonable` (Salad's own `{ kind: "forcing" }`, and whatever
      2c leaves).

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

- [ ] 3.1 The `ts-engine` delta (already in this change) states the propagation
      test; amend it to carry D5's *determined* remedy — rung moves up where an
      `Unreasonable` tier exists, top tier renames where it does not, a tier is
      never deleted.
- [ ] 3.2 Promote `galaxies-hint.test.ts`'s speculative-vocabulary check into
      `src/engine/hint-quality.test.ts`, where all 30 hinting games are enrolled.
      **Prove it fails** before trusting it — today it fails Bricks, Clusters,
      Undead and the whole Latin family, which is the point.

## 4. Close out

- [ ] 4.1 Per-game spec deltas for every tier that moves.
- [ ] 4.2 Revert the measurement scaffold (`audit.md` §5).
- [ ] 4.3 `openspec validate audit-guessing-tier-names --strict`; owner
      acceptance; archive.
