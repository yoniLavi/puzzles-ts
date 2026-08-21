# Tasks

> **⚠️ The shape of this change moved on 2026-08-12 — read
> [`design.md`](./design.md) D1–D4 before starting.** The proposal assumed the
> walk was a `continuesPrevious` journey; it cannot be, because a what-if
> chain's middle legs are cells the player must *not* play and `HintStep.move`
> is required (D1). The owner's decision (D2) is **one enriched step with an
> arrow path**, not a multi-leg walk and not a new engine affordance — so the
> engine contract is untouched and this is per-game narration and rendering.
> A working prototype and a rendered frame are in
> [`reference/`](./reference/); they are reverted from the tree, not lost.
>
> **⚠️ And it moved again on 2026-08-21 — read [D5](./design.md) too.** The
> arrows in that prototype were measured before being adopted, and a third of
> them assert an implication the deduction does not have. The order is drawn as
> an **ordinal per cell**; the `reference/` frame is kept as the thing that was
> rejected, not as the target.

## 0. Clusters' hint target was the same colour as a blue tile — **done, ahead of this change** (design D4)

- [x] 0.1 `COL_HINT` was `HINT_ACTION` was `BLUE`, and Clusters' `COL_1` is
      `BLUE`, so the hint filled the hypothesis cell in the exact colour of a
      placed blue tile — invisible against its neighbours, and contradicting the
      sentence outright on a firing that concluded *red*. A live rendering bug
      on `main`, not a cost of the arrows, so it was fixed rather than carried.
- [x] 0.2 The collide report was read **before** the fix was chosen, as the
      method requires, and named the pair exactly.
- [x] 0.3 `COL_HINT` is `PURPLE` in Clusters. The usual resolution (cross-game
      role wins, local yields) is unavailable: the local role is a *rule of the
      game*, one of the two colours the player paints and named to them by the
      help page. PURPLE is this repo's established substitute when blue is
      spoken for. Verified: pair gone, no new pair, dark check unchanged,
      snapshot diff exactly two `rgb` values.
- [x] 0.4 **Why nothing caught it, now guarded.** The hint tests asserted
      `op.colour === COL_HINT` — a palette *index*, not a colour — which stays
      green whatever the index resolves to. `colour-collide.test.ts` is the
      non-proxy instrument and is advisory, so it reported the pair and failed
      nothing. Clusters now asserts directly that no hint role resolves to a
      colour the board already uses, and that the three hint roles differ.

## 1. Clusters first — it establishes the pattern most cheaply

- [x] 1.1 Its chain is already captured (`ClustersReason`'s `chain.steps`) and
      already rendered; what was missing is the **order** and the link to the
      break. **The arrow path was measured and rejected — see design D5.** A
      third of its links assert an implication that does not hold; the order is
      drawn as a per-cell **ordinal** instead, and the link to the break needs no
      glyph because the ring is already beside the last number in 140/140
      firings. The highlight type is unchanged (`chain` was already in order).
- [x] 1.2 Narration names the two ends and cites the numbers, and lets the board
      carry the middle. It also keeps *"from it"*: the ordinals answer *when a
      consequence fell*, not *which mark "this cell" is*, so they do not retire
      the deixis tie `disambiguate-hint-deixis` added.
- [x] 1.3 Frames judged at chain length 2, 4 and 6 on 10x10 Tricky. Long jumps
      are the reason arrows lost; the ordinals are unaffected by them. One real
      defect found only by rendering: on a cell that is both numbered and ringed
      — a *common* frame — the doubled ring painted over the digit.
- [x] 1.4 Remove its `PENDING_WALK` entry from `hint-quality.test.ts`.
- [x] 1.5 Guard it: the chain frame asserts the drawn ordinals are exactly the
      set `1..n`, so a chain that numbers only its first cell, numbers from 0 or
      repeats a digit fails. A count, not a "some text was drawn" — the shape a
      snapshot re-baseline cannot erase.

## 2. The Latin family — one shared walk, six games

- [ ] 2.1 `latin.ts` `forcing()`: record the BFS path. The parent pointers exist
      inside the loop; the measurement scaffold in `audit-guessing-tier-names`
      showed how to recover depth from them (recover it from git if useful —
      `git log -S LATIN_FORCING_CHAINS`).
- [ ] 2.2 Extend the `forcing` reason to carry the chain, and narrate it in
      `latin-hint.ts` as a journey through `LatinVocab` so Towers' heights,
      Group's elements and Salad's letters all read correctly.
- [ ] 2.3 **The case split is load-bearing** — the conclusion needs *both*
      branches, and a walk that narrates only the chain has a final leg that does
      not follow from its own premises. State it.
- [ ] 2.4 Towers and Solo keep their own `narrate`; give them the same legs.
- [ ] 2.5 Remove each game's `PENDING_WALK` entry as it lands.

## 3. Guards

- [ ] 3.1 The walk must satisfy the *existing* bars, not just this one: every leg
      terse (`MAX_NARRATION_CHARS`), necessity-voiced, and showing something.
      `hint-quality.test.ts` already checks all three per step.
- [ ] 3.2 `hint-resume.test.ts` — a multi-leg journey must survive recompute; a
      chain re-derived from a changed board must not ping-pong.
- [ ] 3.3 A tier-2.5 render scenario per game family, walked to a middle leg.

## 4. Close out

- [ ] 4.1 `ts-engine` spec delta: the Tactic bar as **D2 revised it** — the chain
      is *shown* (ordered, anchored at both ends) rather than walked leg by leg,
      and the engine gains no display-only step. Say plainly that the stricter
      version was considered and set aside by an owner decision, so a later
      reader does not read `PENDING_WALK`'s retirement as seven walks that were
      never written.
- [ ] 4.2 `PENDING_WALK` is empty; delete the list and its scaffolding comment.
- [ ] 4.3 `openspec validate --strict`; owner acceptance; archive.
