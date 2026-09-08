# retire-tests-that-do-not-earn-their-runtime — tasks

## 0. Measure first — nothing is deleted before this exists

- [ ] 0.1 **Per-file cost.** `vitest run --reporter=verbose` (or the JSON
      reporter) into a dated snapshot under this change. Report wall *and* CPU:
      the suite runs with `isolate: false` and files contend, so wall time alone
      misattributes cost. **File it under the change**, not at the repo root —
      a snapshot left loose reads as a current measurement of a tree that has
      moved on (`docs/games/testing.md` § "Metrics and instruments").
- [ ] 0.2 **Rank by cost and take the head.** The tail is thousands of
      millisecond tests that are not the problem; the question is what the top
      ~30 files are buying.
- [ ] 0.3 **For each of those, answer *what would this catch that nothing
      cheaper would?*** — the `docs/test-strength.md` question, not a guess about
      it. Where the answer is unclear, plant the defect and see: that is what
      `npm run probe` is, and it is cheaper than the argument.
- [ ] 0.4 **Enumerate the coverage each one uniquely holds** — mode, grid type,
      tier, codec branch. This is the list that decides "keep however slow".
- [ ] 0.5 **Audit every existing `describeSlow` / `itSlow` / `seedBudget` site
      out loud.** The slow tier is only coverage if somebody runs it; measure
      what `npm run test:slow` costs today and say whether that is a number a
      person will actually wait for. (One file was 50 minutes on 2026-09-08.)
- [ ] 0.6 **Vacuity guard on the audit itself:** state how many test files were
      ranked and how many were classified. An audit that quietly looked at the
      dozen files somebody remembered is the instrument failure this repo keeps
      finding.

## 1. Classify

- [ ] 1.1 Per file: **keep**, **demote to the slow tier**, or **retire**, each
      with its reason.
- [ ] 1.2 **Record the declines as loudly as the deletions.** The expected
      outcome is that most differentials are kept, and the reasoning for keeping
      an expensive test is the part a future session most needs — otherwise this
      audit gets re-run from scratch every time somebody notices the gate is slow.
- [ ] 1.3 Flag separately anything whose retirement would leave a game's
      generator or solver with **no differential at all**. That is a change in
      what the project can prove about that game; name it to the owner rather
      than deciding it inside a cleanup.

## 2. Execute

- [ ] 2.1 Apply the retirements and demotions. At every changed site, state
      **what still covers the configuration** — `testing/slow.ts`'s existing rule,
      which generalizes from deferral to deletion.
- [ ] 2.2 Delete the `__fixtures__` a retirement orphans. A fixture no test reads
      is worse than a deleted one: it still reads as coverage. (Cheap to find —
      the fixture files are 79 files and 1.1 MB in total, so *size* is never the
      argument; compute is.)
- [ ] 2.3 **Verify by shape** (`AGENTS.md`): every changed line in the diff is a
      deletion, a demotion, or a coverage note. Then read the exceptions.
- [ ] 2.4 Re-run 0.1 and report the delta — the before/after is the finding, and
      it is the only honest way to say the change was worth doing.

## 3. Make the bar durable

- [ ] 3.1 Write the retirement bar into a spec (`repo-layout` or `ts-migration`,
      whichever the audit shows it belongs to): a test earns its runtime by what
      it catches that nothing cheaper would; the gate's composition is out of
      scope; the last cover for a configuration stays.
- [ ] 3.2 `docs/games/testing.md` gains the *how* — how to ask the question, and
      the standing answer for the differentials, so the next session does not
      re-litigate 59 files.
- [ ] 3.3 Check the probe corpus still applies (`npm run probe -- --verify`,
      0.02 s): retiring a test can move a line the corpus anchors on, and the
      failure mode is that the harness silently measures a smaller corpus **and
      reports success**.

## Findings

_(none yet — task 0 not started)_
