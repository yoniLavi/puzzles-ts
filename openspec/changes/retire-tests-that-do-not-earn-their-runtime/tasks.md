# retire-tests-that-do-not-earn-their-runtime — tasks

Results live in [`findings.md`](./findings.md). Measured 2026-09-09.

## 0. Measure first — nothing is deleted before this exists

- [x] 0.1 **Per-file cost.** All 301 files ranked. Wall via the vitest JSON
      reporter (locating only); **CPU via `/usr/bin/time` per file**, which is
      what every figure quoted is. The box ran at load 40–162 throughout — other
      users' jobs — which is why wall was demoted to a ranking instrument.
- [x] 0.2 **Rank by cost and take the head.** Top 10 files = 68% of suite time;
      the head was measured by CPU individually.
- [x] 0.3 **What would this catch that nothing cheaper would?** Answered by
      planting defects, not by argument: zeroing Sixteen's `TANGLE_COST` term and
      mistuning `TANGLES_IN_REACH` both turn `sixteen.test.ts` red in the gate.
      That probe is what the whole deferral rests on.
- [x] 0.4 **Coverage each head file uniquely holds** — recorded per member in
      `hint-resume.test.ts`'s `SEARCH_REACH` ledger for the two games sliced, and
      in `findings.md` §4 for the rest.
- [x] 0.5 **Audit every `describeSlow` / `itSlow` / `seedBudget` site.** Done, and
      it produced the sharpest finding: the deferred tier is **six tests in three
      files**, while `npm run test:slow` re-runs all 8,504 gate tests with the
      heaviest multiplied 3–7.5×. Targeted invocation works and is now documented.
- [x] 0.6 **Vacuity guard on the audit itself.** 301 files ranked, 301
      classified; 51 fixtures checked, 0 orphaned; 57 of 57 games attributed.

## 1. Classify

- [x] 1.1 Per file: keep / demote / retire, with reasons — `findings.md` §§1–5.
- [x] 1.2 **Declines recorded as loudly as the cuts** — `findings.md` §5. All 50
      differentials stay (10.1% of suite time); `sixteen.test.ts`'s three-case
      tangle walk stays despite being the single most expensive file; **nothing
      was deleted outright**, and saying so plainly is the result.
- [x] 1.3 **Nothing left a game with no differential at all**, so there is
      nothing to put to the owner under this heading. No fixture was touched.

## 2. Execute

- [x] 2.1 Applied — two deferrals, both derived rather than listed:
      `hint-resume.test.ts` (a searching game walks its smallest preset in the
      gate) and `hint-quality.test.ts` (its three smallest). Each site states
      what still covers the configuration.
- [x] 2.2 **No fixtures orphaned** — none were retired. The pre-existing state was
      checked anyway (51 fixtures, 0 orphans) so the baseline is known.
- [x] 2.3 **Verified by shape** — the diff is test files, one test-helper module,
      one guide and the change's own artifacts. No production code, no fixtures.
- [x] 2.4 **Re-ran 0.1 and reported the delta** — `findings.md` §4:
      `hint-resume` 149.5 s → 49.3 s CPU, `hint-quality` 61.8 s → 41.4 s CPU,
      **−120.6 s CPU** measured the same way before and after.

## 3. Make the bar durable

- [x] 3.1 **Spec delta written — to `build-pipeline`, not `repo-layout` or
      `ts-migration`.** That spec already owns "The commit gate's cost is
      proportional to what it protects" (`right-size-the-test-gate`), which
      covers deferral only; the retirement bar, the per-game/CPU measurement
      discipline, the tier's invocability and the searching-hint slice are all
      the same concern. Four `ADDED` requirements.
- [x] 3.2 `docs/games/testing.md` § "Right-sizing the gate" gains the targeted
      slow-tier form and a "where the cost actually is" subsection, so the next
      session does not re-litigate 50 differential files.
- [x] 3.3 Probe corpus still applies (`npm run probe -- --verify`).

## Findings

See [`findings.md`](./findings.md). The headline: **the expensive tests and the
porting-era tests are not the same tests, and they are close to disjoint.** The
frozen differentials this change was most afraid of touching are a tenth of the
suite; half of it is three games whose hints plan by searching, amplified by
cross-game guards that recompute a hint after every move.
