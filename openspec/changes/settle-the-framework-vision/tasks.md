# settle-the-framework-vision — tasks

## 1. Verify before editing

- [ ] 1.1 Re-check each staleness claim against the tree rather than against this
      proposal: that `re-express-the-collection` is archived and its `survey.md`
      records the instruments re-run; that `migration.md` steps 1–3 already carry
      their withdrawal banner; that the README's row 6 still reads as an open
      question. **A doc correction founded on a second-hand claim is the same
      defect one layer out.**
- [ ] 1.2 Count the change ids cited across `docs/framework-rdd/` and confirm
      each resolves to `openspec/changes/<id>` or an archive entry. The README
      measured this on 2026-09-04 (45 of 49 resolving, the other four not change
      ids) and declined a guard on the grounds that no dead citation existed; the
      decline is only honest if somebody re-runs it when the docs move. Report the
      number.

## 2. The README

- [ ] 2.1 Drop the **Readiness** column from the row table; keep the rows, their
      names and their order, since the ordering is the argument.
- [ ] 2.2 State each row's outcome inside its own lesson block, which is where
      the markers already live, and let "what remains" resolve through
      `openspec list` — the mechanism the same page prescribes two sections
      earlier.
- [ ] 2.3 Mark row 6 **done**, citing `2026-09-06-re-express-the-collection`.
      Say what it settled: the owner chose the full sweep, the sweep enumerated
      its own definition of done, and B1–B8 all reported.
- [ ] 2.4 Remove the sentence declaring row 6's shape "the one open question in
      the whole definition end", and say instead what is true — **the definition
      end has reported in full.** Two shipped as helpers, three were withdrawn
      with postmortems, one completed.

## 3. `migration.md`

- [ ] 3.1 Mark § "Order of adoption" complete-or-withdrawn in place: steps 1–3
      withdrawn (already bannered), step 4 done.
- [ ] 3.2 Leave § "Invariants that must not move" standing and unmarked — ids
      byte-stable, narrations byte-identical, snapshots explainable are live
      rules, not fiction — and point the withdrawn section at it, since it is the
      only part of the file a future change still has to obey.

## 4. `guarantees.md`

- [ ] 4.1 Mark the rows that now have guards, each citing its change: Params
      (`declare-params-and-presets`, `params-stability.test.ts`); Technique
      ladder's *tiers bind* (`assert-that-tiers-bind`); the *N boards per preset*
      half (`refuse-honestly-at-every-tier`). Do not mark a row whose guard is
      only proposed — cite the change and say "in flight", or leave it fiction.
- [ ] 4.2 Note against the Presentation row what already exists — the derived
      paint-twice guard for the hint overlay, and the mistake overlay's ledger —
      so the row is not read as wholly unbuilt.

## 5. `deduction.md` and `presentation.md`

- [ ] 5.1 At the `find`/`apply`/`narrate` claim, record the open question:
      **what does the split buy beyond the widened hint walk?** State the
      measurement (the walk solves boards by hint, so an unnarrated firing fails
      it; widened to every preset by `refuse-honestly-at-every-tier`) and name
      the precedent it rhymes with (row 3, whose benefit had already shipped
      derived from behavior). Do not answer the question here.
- [ ] 5.2 Record against the generator projection what `assert-that-tiers-bind`
      measured — 282 of 285 preset cases already generate on-tier by hand — so
      that the "the only thing the driver can do" argument is read next to the
      figure that undercuts it.
- [ ] 5.3 Point `presentation.md` at `explore-the-tile-loop-inversion` as the
      change that will test it, and mark it as the vision's one remaining
      unfalsified claim.

## 6. Close

- [ ] 6.1 `npm run gate` (a doc-only commit takes the fast path — vitest and the
      build are skipped for `docs/`, but confirm the scope check agrees rather
      than assuming it).
- [ ] 6.2 Archive under self-driven initiative.

## Findings

_(none yet — not started)_
