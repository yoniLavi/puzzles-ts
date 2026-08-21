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

## 2. The Latin family — one shared sentence, six games

- [x] 2.1 `latin.ts` `forcing()`: record the BFS path. One parent-pointer write
      per pushed cell, inside the `recorder` guard, so the generator and solve
      paths are untouched. The array needs no clearing between runs — a parent is
      never *read* for a cell this BFS did not push.
- [x] 2.2 The `forcing` reason carries `chain: ForcingLink[]` and the region the
      conclusion shares with the origin. `narrateForcingChain` in `latin-hint.ts`
      renders it through `LatinVocab`, so Towers' heights, Group's elements and
      Salad's letters read correctly from one sentence.
- [x] 2.3 **The case split is stated**: *"If cell 1 is 5, this cell's row already
      has it; if 2, cell 3 is driven to 5, in line with this cell. Either way…"*.
      Both branches, because the conclusion needs both.
- [x] 2.4 Towers and Solo keep their own `narrate` — for reasons that do not
      apply to this arm (a value qualified in *some* arms; a different region set
      per arm) — so they call the shared sentence with their own vocabulary and
      region name rather than keeping a copy of it. **Solo's own forcing BFS**
      records its chain too, and names row / column / **block** / **diagonal**.
- [x] 2.5 `PENDING_WALK` is empty and deleted, along with its `pendingWalk`
      helper and both call sites.
- [x] 2.6 Not in the plan, done because the alternative was six copies of the
      same bit-packing and the same corner-digit draw: the ordinal is a shared
      mechanism — `OrderedCell.order` → `OverlaySidecar.order` (its own lane;
      `hintMarkBit` already reaches bit 28 in Group, so there is no bit budget to
      borrow) → `drawHintOrdinal` → the new `HINT_ORDER` palette role. Clusters
      was moved onto it too, so the mark means one thing in all seven games.

## 3. Guards

- [x] 3.1 The narration satisfies the *existing* bars: terse
      (`MAX_NARRATION_CHARS`), necessity-voiced, showing something — and it no
      longer trips `SPECULATIVE`, which is what emptying `PENDING_WALK` means.
- [x] 3.2 `hint-resume.test.ts`, `hint-overlay.test.ts` and
      `hint-quality.test.ts` all green across the seven games.
- [x] 3.3 Frames rendered and read at chain lengths 2 / 4 / 6 (Clusters), and for
      Keen and Solo — the two whose corners were most contested (cage clues and
      pencil marks). Then generalised into `hint-ordinal.test.ts`, a cross-game
      guard: an area carrying ordinals carries exactly `1..n`, and the frame
      paints every one **in the ordinal's own colour**.
- [x] 3.4 The guard was **proved to fire** — and its first cut was vacuous. It
      asked whether the text "1" reached the canvas, and passed with Keen's
      ordinal draw deleted outright, because a Keen cell already prints "1" as a
      pencil mark. Removing the wiring and watching it stay green is the only way
      that class is ever caught.
- [x] 3.5 `ORDERING_GAMES` was measured, not assumed, and the assumption was
      wrong twice: **Group** never reaches the rung at its `w = 6` preset (0 of 8
      seeds at every one of its five tiers), and **Solo** needs a bigger board
      than its first preset (4x4) — at 3x3 it fires 8 of 8. Both recorded in the
      guard rather than left implicit.
- [x] 3.6 Advisory instruments compared against a pre-change baseline:
      `colour-collide` **171 → 171** pairs and `colour-dark-check` **64 → 64**
      violations, so the new role neither collides nor misbehaves in dark mode.

## 4. Close out

- [x] 4.1 `ts-engine` spec delta: the Tactic bar as **D2 revised it** — the chain
      is *shown* (ordered, anchored at both ends) rather than walked leg by leg,
      and the engine gains no display-only step. It says plainly that the
      stricter version was designed, costed and set aside by an owner decision,
      so a later reader does not read `PENDING_WALK`'s retirement as seven walks
      that were never written.
      **It is a MODIFIED delta and was re-copied from the live spec at
      implementation time**, not at scaffold time — the scaffolded version was an
      ADDED requirement that would have left the live spec asserting a multi-leg
      journey while the code shipped one step. `openspec-delta-integrity` then
      caught a renamed scenario (a rename archives as a deletion), so the
      scenario keeps its name and only its THEN changed.
- [x] 4.2 `PENDING_WALK` is empty; the list, its helper and its two call sites
      are deleted, and the two doc comments that stated the stricter bar now
      state the revised one.
- [x] 4.3 `openspec validate --strict` passes. `docs/games/hints.md` gained the
      ordinal section and the fourth deixis tie. Owner acceptance and archive
      remain.
