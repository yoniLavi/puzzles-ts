# establish-refactor-baseline — tasks

## 1. The harness

- [ ] 1.1 Add `jscpd`, `madge` and `knip` as devDependencies. Add **nothing
      else** — D4 records what was evaluated and rejected.
- [ ] 1.2 Write `scripts/metrics.sh`: runs jscpd (min-tokens 60, excluding
      `*.test.ts`, `__snapshots__`, `__fixtures__`), madge `--circular`, knip,
      and `biome lint --reporter=json` for complexity, writing each tool's raw
      output into `metrics/<YYYY-MM-DD>/`.
- [ ] 1.3 Add `npm run metrics`. It is **not** wired into `scripts/gate.sh` or
      `.husky/pre-commit`.
- [ ] 1.4 Emit a short `metrics/<date>/summary.md` from the raw output:
      duplication %, cross-game clone lines, cycle count, knip haul, and the
      complexity distribution (count over threshold, median, p90, p95, max).

## 2. The baseline

- [ ] 2.1 Run `npm run metrics` on the tree as it stands and commit
      `metrics/2026-08-01/` (or the implementation date) as the baseline.
- [ ] 2.2 Confirm the numbers reproduce the review's findings: ~2.0% duplication,
      ~2,180 cross-game clone lines, 20 cycles, 814 functions over complexity 15.
      A material divergence means the harness is configured differently from the
      review and must be reconciled before it is trusted as a baseline.
- [ ] 2.3 **Verify the complexity-255 saturation** (D3). Read Biome's rule
      implementation or probe it with a synthetic deeply-nested function. If it
      saturates, record the affected functions as "≥255" in the summary and never
      as a measured maximum.

## 3. The complexity ratchet

- [ ] 3.1 Enable `complexity/noExcessiveCognitiveComplexity` in `biome.json` with
      `maxAllowedComplexity` set from the measured distribution, not from Biome's
      default of 15.
- [ ] 3.2 Suppress the functions that exceed the chosen threshold **individually
      and with a reason**, rather than raising the threshold to clear them — the
      suppression list is the work queue for later rounds, and a threshold raised
      to fit the worst case measures nothing.
- [ ] 3.3 Confirm `npm run gate` wall-clock is unchanged within noise (the rule
      runs inside the existing biome step).

## 4. The free deletions

- [ ] 4.1 Remove the 35 unused biome suppression comments the linter already
      reports as having no effect.
- [ ] 4.2 Triage knip's findings: the unused file (`public/unsupported.js` —
      **check the HTML entry points first**, a file referenced only from a
      `<script>` tag is a knip false positive, not dead code), the unused
      `workbox-routing` devDependency, and the five unused `vite-plugins/
      extra-pages.ts` exports.
- [ ] 4.3 Declare knip's three unlisted dependencies (`@lit/reactive-element`,
      `tinyglobby`, `vitest-environment-happy-dom`) properly in `package.json`,
      or record why each is legitimately transitive.
- [ ] 4.4 Re-run `npm run metrics`; commit the post-deletion snapshot so the
      first ratchet values are the post-deletion ones.

## 5. Close out

- [ ] 5.1 Add a short "Refactoring metrics" section to
      `docs/porting/game-port-playbook.md` pointing at `npm run metrics` and the
      ratchet discipline (D2), per the live-wiki rule.
- [ ] 5.2 Run the full gate. Confirm green.
