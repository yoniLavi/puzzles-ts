# Tasks

> **Read the sweep table in [`proposal.md`](./proposal.md) first** — it carries
> the per-game verdict and, for the three flagged games, why. Clusters is done
> and is the worked example to copy: the tie is **geometric**, never a colour
> name.

## 1. Clusters — **done, 2026-08-14** (the reported case)

- [x] 1.1 Four of six branches tied the target to the ringed tile by the
      relation the solver guarantees: `contradictionAround` reports the placed
      cell **or one of its four orthogonal neighbours**, so the ringed tile
      really is *this cell's neighbour* and the sentence says so.
- [x] 1.2 The chain branch cannot use that relation — its break is adjacent to
      the **last forced cell**, not the target — so it ties the other way, on
      the fact a reader needs anyway: the chain runs *from* this cell.
- [x] 1.3 The two single-mark branches left alone deliberately: with no second
      mark, "this cell" is unambiguous and a qualifier would be noise.
- [x] 1.4 Guard: *a second mark displayed ⇒ the explanation contains the tie*.
      **Proved to fail** by restoring the reported sentence and watching it go
      red, then reverted.

## 2. The three flagged games

Each needs its **own** geometric check before wording — the Clusters tie works
because adjacency is guaranteed by the solver, and a sentence that claims a
relation the code does not enforce is exactly the failure the hint bar exists to
stop ("every sentence a hint utters is a claim").

- [x] 2.1 **Bricks — done.** Each branch's relation established by sweeping
      **~55k deductions over ~4,800 partial positions** of the fixture boards,
      because a relation asserted in prose and not enforced in code is the
      failure the bar exists to stop. `shadeRun` never leaves the target's row
      and is contiguous through it (runs of 3, 4 *and* 5 occur — "the two ringed
      bricks" would have been false), so *"This cell sits **next to** the ringed
      shaded bricks"*; `classify*Trial` finds its clue by walking `BRICKS_STEPS`
      **from the target**, so *"the ringed 3 **beside** it"*; `below`/`above` are
      the brick-wall supports one row down/up, and `below` holds 1 or 2 cells —
      never 0 — so *"the ringed cell**s** below this one **are its only
      supports**"* with a singular arm. `localBreak` is the one arm with no
      guaranteed relation (`errorCells` reports wherever the validator flagged
      the break) and ties on *"the unringed one"* instead — the sweep never
      reached that arm at all, which is recorded next to it.
- [x] 2.2 **Range — done.** Not three marks but two: only `adjacency` sets
      `blackRefs`, and its sentence was already tied. The other four have exact
      relations: `satisfied`/`overrun` place the target `1 + rl[RUN_WHITE][j]`
      from the clue — *"the next one out past the shaded run"*; `reach` shades
      the whole path behind it — *"along the shaded run **as far as this
      cell**"*; `connect` shades the target's own non-black neighbours — *"the
      shaded cells **around it**"*. `connect`'s dead black-target branch went
      with them: both `ruleConnectedness` call sites record WHITE.
- [x] 2.3 **Lightup — done, and it is the game where the tie could not be
      positional.** Measured: across 133 discount firings the driving clue was
      adjacent to the target **0 times** and collinear with it **0 times**, and
      the ringed dark square collinear **0 times**. What `discountSet`
      guarantees is the *reach* relation, so that is what the sentence names.
      Writing it found **two further defects** in the same pair of sentences:
      the premise *one of them must hold a bulb* was never stated, so the
      conclusion did not follow from the words; and *"only the shaded squares"*
      can light the ringed square is **false in over half of `discountUnlit`'s
      firings**, because `litCells(…, true)` includes the source — the ringed
      square is itself a set member, and being ringed rather than shaded it was
      excluded by the wording. `325` stays. `323` was fixed too though the grep
      could not see it: its corridor is displayed and was unmentioned.
- [x] 2.4 A guard per game, each **proved to fail** before it is trusted — by
      restoring the old sentence and watching it go red, then reverting. Each
      carries the vacuity guards the bar now expects: a `checked` floor *and*
      the set of reason kinds the sweep must have reached, since a guard that
      only ever saw the one already-tied branch measures nothing.

## 3. Do not reach for the colour

- [x] 3.1 The rule goes in the `ts-engine` hint requirement: where a step
      displays more than one mark, its narration SHALL identify the acted-on one
      by a relation, a value or a role word — and SHALL NOT identify it by hue.
      Record *why* the obvious fix is refused, or it will be proposed again:
      colour is not the only cue a player has (scheme flip, colour-blindness),
      and this collection's own palette work already established that a hue's
      appearance is scheme-relative.

## 4. The check the grep cannot do — built, and it is a report, not a gate

- [x] 4.1 `scripts/checks/hint-deixis.test.ts` (advisory, wired into `npm run
      diff`, writes `metrics/hint-deixis.md`). It reads the **frame**: every
      hinting game, every tier, each step's declared mark roles
      (`markRoles`, promoted to `engine/testing/hint-games.ts` beside
      `declaresNoMarks`), each explanation tested for a bare deictic. It found
      `323`, the Lightup sentence the grep could not see.
- [x] 4.2 Vacuity guards (`3,914 steps examined`, `3,045 showing a second
      mark`, both floored) and **every tier**, not `firstLeaf(presets())` —
      `audit-guessing-tier-names` §3.2.
- [x] 4.3 **Why it is not a gate, which is the finding.** It flags **230
      sentence shapes in 20 games**; the review found **no genuine defect the
      grep had missed except `323`**. The false positives are four legitimate
      ties no lexical rule recognises — by **value** (Singles' *"This 3 shares a
      line with the ringed white 3"*), by **line context** (Group's *"In this
      row, c can go in only this cell — every other cell in the row has ruled it
      out"*), by a **continuation leg's antecedent** (Slant's *"The same clue
      forces this square too"*), and above all by **the marks being different
      kinds of thing**: Palisade marks an *edge* against *regions*, Spokes a
      *spoke* against *hubs*, Sticks a *square* against a *clue*, and in each the
      noun already picks the target out. **All four genuine cases mark a cell
      against another cell** — that is the rule a future port should carry, and
      it is now in `hints.md`. Counting *rendered* hint colours instead would
      not separate those either (a spoke and a hub are still two hint colours);
      what rendering would add is the one thing this cannot see, a role declared
      but never drawn.

## 5. Close out

- [x] 5.1 `openspec validate disambiguate-hint-deixis --strict`.
- [x] 5.2 Every changed sentence read **against the running app**, on frames that
      actually show both marks — and it earned its place three times, none of
      which any test would have raised:
      - **Bricks' ringed support is often a *clue*** (the opener rings a `4`;
        `validateGravity` masks a clue to no colour, so a clue supports
        nothing). *"is its only support and is not shaded"* reads as a mark the
        player could go and place, so it is now *"the only thing it could rest
        on, and it isn't a shaded brick"*.
      - **"more than its 0 shaded neighbours"** — a clue of 0 on the opener
        board, and nonsense on sight. Its own sentence now:
        `hints.md` § "Sanity-read at the degenerate extremes".
      - **Range's "Clue 5" named either of two shaded 5s.** A clue lies *inside*
        its own shaded line of sight and that run can hold a second clue of the
        same value — the live 9x6 board had two 13s, both shaded. The value is
        not a name when the value repeats, so this is the case the spec delta
        means by *"the marks need fixing, not the sentence"*: `RangeHint.clue`
        marks the driving clue and its digit draws `COL_HINT` (Light Up's
        recoloured digit, same element-type legend), and the three clue rules
        say *"the highlighted 5"*. Guarded in both directions — the word only
        where the mark is — and the snapshot diff is **two lines on one text
        op**, so nothing else moved.
- [x] 5.3 **Owner-accepted 2026-08-15**, then archived.

## 7. What archiving this change broke, and the guard that came out of it

- [x] 7.1 `openspec archive` replaced the `ts-engine` hint requirement with this
      change's MODIFIED delta, which had been scaffolded from a copy that
      predated `audit-guessing-tier-names` — **134 lines gone**: the entire
      Check / Tactic / Search taxonomy, the tier-naming rules, and four
      scenarios. `validate --strict` passed it, because a partial copy still has
      a SHALL and a scenario. Caught by reading `git diff` after the archive,
      which is not a control. The live spec was repaired by hand (this change's
      three scenarios and its narration paragraphs merged into the *current*
      requirement) and the archived delta carries a warning; the spec diff is now
      **purely additive, 0 deletions**.
- [x] 7.2 `src/openspec-delta-integrity.test.ts` makes it a commit-gate failure:
      a MODIFIED delta must retain every `#### Scenario:` the live requirement
      has. Scenario names are the decidable proxy — prose cannot be diffed, but a
      dropped scenario is exactly what a stale copy produces. Proved against a
      known-answer fixture in both directions, since the tree sweep asserts
      nothing on a day with no active MODIFIED delta.
- [x] 7.3 **It found two more on its first run, plus a third worse than this
      one** — none archived yet, so all three were fixable:
      `add-latin-repeats-support` (2 Salad scenarios),
      `add-slide-keyboard-control` (2 Slide scenarios), and
      `walk-tactic-hint-chains`, which modified this same requirement and would
      have dropped **eleven**. That one is an ADDED requirement now — what
      `OPENSPEC_AGENTS.md` prescribes for a delta that adds a concern rather than
      changing one — so it cannot delete anything. **Three of the four active
      MODIFIED deltas were unsafe**, which retires "usually right" as a defence.

## 6. The exemption this change leaned on, now asserted

- [x] 6.1 The rule says a pair differing **only by hue** needs the marks fixed,
      and Range and Light Up both mark a solid target against a shaded area — so
      the question had to be answered rather than assumed. It is not a hue-only
      pair: `HINT_ACTION` carries ~2.5× the chroma of either wash, and the two
      are 0.408 apart in light and 0.218 in dark. **Weight, not hue**, which is
      what survives a reader who cannot compare hues.
- [x] 6.2 But the guard that keeps it true — `palette.test.ts` § "keeps the three
      hint emphases distinct" — was measuring the **light column only**, the one
      thing `hand-author-dark-palette` established you cannot do. Extended to
      both schemes, and it lands on something real: the tightest of the six pairs
      is `HINT_FILL`/`HINT_EVIDENCE` in **dark**, at **0.124** against a 0.12
      bound (0.147 in light). **Proved to fail** by moving `TEAL`'s dark wash
      from 0.48 to 0.42 — dark goes red at 0.083 while light stays green, which
      is exactly the class of change the old guard could not see. The chroma
      relation is asserted alongside it, in both schemes.
