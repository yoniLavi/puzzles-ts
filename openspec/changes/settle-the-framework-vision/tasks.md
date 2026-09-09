# settle-the-framework-vision — tasks

## 1. Verify before editing

- [x] 1.1 Re-check each staleness claim against the tree rather than against this
      proposal: that `re-express-the-collection` is archived and its `survey.md`
      records the instruments re-run; that `migration.md` steps 1–3 already carry
      their withdrawal banner; that the README's row 6 still reads as an open
      question. **A doc correction founded on a second-hand claim is the same
      defect one layer out.** — **All three held.** Archived as
      `2026-09-06-re-express-the-collection`, 21/21 tasks, `survey.md` present
      with five instruments each carrying a vacuity number, batches B1–B8 all
      reported (B1 dissolved, B8 ratcheted, six done), instruments re-run at the
      end. The migration banner is there. Row 6 still read as open.
- [x] 1.2 Count the change ids cited across `docs/framework-rdd/` and confirm
      each resolves to `openspec/changes/<id>` or an archive entry. The README
      measured this on 2026-09-04 (45 of 49 resolving, the other four not change
      ids) and declined a guard on the grounds that no dead citation existed; the
      decline is only honest if somebody re-runs it when the docs move. Report the
      number. — **Done, and it found a dead citation. See Finding 1.**

## 2. The README

- [x] 2.1 Drop the **Readiness** column from the row table; keep the rows, their
      names and their order, since the ordering is the argument. — Table replaced
      by an ordered list; strikethrough retained on rows 3–5 per the delta's
      "struck through and kept with its argument".
- [x] 2.2 State each row's outcome inside its own lesson block, which is where
      the markers already live, and let "what remains" resolve through
      `openspec list` — the mechanism the same page prescribes two sections
      earlier.
- [x] 2.3 Mark row 6 **done**, citing `2026-09-06-re-express-the-collection`.
      Say what it settled: the owner chose the full sweep, the sweep enumerated
      its own definition of done, and B1–B8 all reported. — Row 6 lifted out of
      row 5's blockquote into its own block, since it now has its own outcome.
- [x] 2.4 Remove the sentence declaring row 6's shape "the one open question in
      the whole definition end", and say instead what is true — **the definition
      end has reported in full.** Two shipped as helpers, three were withdrawn
      with postmortems, one completed.
- [x] 2.5 *(added)* The "Presentation is **held**" paragraph named no change.
      Pointed at `explore-the-tile-loop-inversion` and marked presentation the
      vision's one remaining unfalsified claim, matching task 5.3.

## 3. `migration.md`

- [x] 3.1 Mark § "Order of adoption" complete-or-withdrawn in place: steps 1–3
      withdrawn (already bannered), step 4 done. — Banner rewritten to open with
      "this section has finished"; each numbered step now carries its own marker,
      so a reader skimming the list sees it without reading the banner.
- [x] 3.2 Leave § "Invariants that must not move" standing and unmarked — ids
      byte-stable, narrations byte-identical, snapshots explainable are live
      rules, not fiction — and point the withdrawn section at it, since it is the
      only part of the file a future change still has to obey. — Anchor link from
      the banner; section left untouched.

## 4. `guarantees.md`

- [x] 4.1 Mark the rows that now have guards, each citing its change: Params
      (`declare-params-and-presets`, `params-stability.test.ts`); Technique
      ladder's *tiers bind* (`assert-that-tiers-bind`); the *N boards per preset*
      half (`refuse-honestly-at-every-tier`). Do not mark a row whose guard is
      only proposed — cite the change and say "in flight", or leave it fiction.
      — *tiers bind* was already marked. The other two marked, each with a note
      below the table. **The N-boards half did not ship as written; see
      Finding 2.**
- [x] 4.2 Note against the Presentation row what already exists — the derived
      paint-twice guard for the hint overlay, and the mistake overlay's ledger —
      so the row is not read as wholly unbuilt. — Done, plane by plane: hint has
      the guard (`hint-overlay.test.ts`), mistake has a ledger that may only
      shrink (`mistake-overlay-coverage.test.ts`, 19 → **17** entries), reference
      has neither.

## 5. `deduction.md` and `presentation.md`

- [x] 5.1 At the `find`/`apply`/`narrate` claim, record the open question:
      **what does the split buy beyond the widened hint walk?** State the
      measurement (the walk solves boards by hint, so an unnarrated firing fails
      it; widened to every preset by `refuse-honestly-at-every-tier`) and name
      the precedent it rhymes with (row 3, whose benefit had already shipped
      derived from behavior). Do not answer the question here. — Recorded, not
      answered, and explicitly marked as not a verdict.
- [x] 5.2 Record against the generator projection what `assert-that-tiers-bind`
      measured — 282 of 285 preset cases already generate on-tier by hand — so
      that the "the only thing the driver can do" argument is read next to the
      figure that undercuts it. — Added at the claim, with Undead's two-spellings
      failure, which is the defect the projection's framing does not name.
- [x] 5.3 Point `presentation.md` at `explore-the-tile-loop-inversion` as the
      change that will test it, and mark it as the vision's one remaining
      unfalsified claim.

## 6. Close

- [x] 6.1 `npm run gate` (a doc-only commit takes the fast path — vitest and the
      build are skipped for `docs/`, but confirm the scope check agrees rather
      than assuming it). — Ran in full: 302 files, 8508 passed, 8 skipped, 222 s,
      `vite build` green. **The prediction was true of the hook and false of the
      command it named; see Finding 3.**
- [x] 6.2 Archive under self-driven initiative.

## Findings

### Finding 1 — the citation guard's revisit condition had already fired, 46 minutes after it was written

Task 1.2 asked for a count. The honest scope was the README's *own* instrument
(`docs/` + `AGENTS.md`), not the narrower `docs/framework-rdd/` the task named,
because the point of re-running a measurement is to re-run *that* measurement.

**Re-measured 2026-09-09**, same key (backticked kebab-case token, ≥3 segments),
16 files: **80 tokens, 74 resolving** — 71 to an open change or a dated archive
entry, 3 to postmortems (`declare-the-gesture-table`, `declare-the-board-model`,
`adopt-the-game-definition-adapter`, whose directories are gone by design).
**Five are not change ids**: the original four plus `puzzle-key-unhandled`, a DOM
event. **One was dead.**

`AGENTS.md` § "Hint quality bar" cited `census-the-hintless-logic-games`. The
README's decline was committed in `548594b4` at **15:21 on 2026-09-04**; at
**16:07 the same afternoon**, `dda81631` rescoped and renamed that change to
`characterize-the-hint-assessment-corpus` — and the commit that wrote the
sentence's replacement left the sentence naming the deleted directory. It stood
five days.

Fixed here (it is a false statement in the brief, which is this change's own
business). The guard is scoped separately as `guard-change-id-citations`, ready,
with the measurement and the instrument correction already taken.

**An instrument correction, recorded because it changed the number.** The first
run reported **twelve** unresolved. Its glob resolved `<id>` against
`openspec/changes/archive/*-<id>` only, so it was blind to citations written with
the date already in them and to withdrawn rows living in `openspec/postmortems/`.
Eleven of twelve findings were the instrument — and the correction ran in the
direction that makes a guard look *more* worthwhile, not less, which is the
uncomfortable direction and the reason to state it.

### Finding 2 — the full-hints invariant shipped on a different axis, and the difference is a budget constraint

`guarantees.md` promised "**N** generated boards per preset walk to completion
through the hint projection". What `refuse-honestly-at-every-tier` shipped widens
the **preset** axis, not N: `hint-resume.test.ts` had walked `firstLeaf` alone, so
the collection's strongest hint guarantee had never seen a Hard board, an
`Unreasonable` board or any mode variant. Widened, it found thirteen refusals
across seven games saying three different things.

Reading `walkedPresets`'s own doc comment, **N is not a knob this suite can afford
to turn up**: raising it over every preset was tried and withdrawn at 50 minutes,
and even the preset widening needed a slice (tier for a tiered game, first-and-last
size for an untiered one, smallest-only for the two search-planning games that were
43% of all test time). Recorded at the row, because a conformance design that
budgets for "N per preset" is budgeting for something that has already been
measured and rejected once.

### Finding 3 — the task's prediction was true of the hook and false of the command it named

Task 6.1 said "a doc-only commit takes the fast path — vitest and the build are
skipped for `docs/`". Checked rather than assumed, and it splits in two:

- **The shortcut is hook-only.** `scripts/gate.sh` § 1d is gated on
  `GATE_PRECOMMIT=1`, so `npm run gate` — the command the task told me to run —
  never takes it, by design: *"CI and a manual `npm run gate` always run
  everything, so nothing reaches `main` without the full gate having seen it."*
  Run here in full: **302 test files, 8508 passed, 8 skipped, 222 s**, with
  `vite build` green in parallel.
- **The allowlist is wider than `docs/`**, and covers this change: `docs/`,
  `openspec/`, `AGENTS.md`, `CLAUDE.md`, `CREDITS.md`, `README.md`,
  `LICENSE.md`. So the *commit* will take the shortcut even though the manual run
  did not.

This is the third place the gate is **scoped by role** rather than by content —
biome (`--staged` in the hook, `ci .` in CI), this shortcut, and the test
selector — and all three make the same argument: narrow what a *commit* costs,
never narrow what protects the branch.

Two details at that site are worth carrying, because they are why skipping vitest
is not a hole. **`help/` is deliberately absent** from the allowlist: it is a
`vite build` input *and* `help-coverage.test.ts`'s subject, so a help page is
never a documentation-only commit. And the shortcut is held honest from the other
side — `src/gate-scope.test.ts` scans for any glob or file read naming `docs/` or
`AGENTS.md`, so the day a test starts reading them, this path "stops being safe
*and says so*". That is derive-don't-declare aimed at a shortcut.
