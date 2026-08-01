# establish-refactor-baseline — tasks

## 1. The harness

- [x] 1.1 Add `jscpd`, `madge` and `knip` as devDependencies. Add **nothing
      else** — D4 records what was evaluated and rejected.
- [x] 1.2 Write `scripts/metrics.sh`: runs jscpd (min-tokens 60, excluding
      `*.test.ts`, `__snapshots__`, `__fixtures__`), madge `--circular`, knip,
      and `biome lint --reporter=json` for complexity, writing each tool's raw
      output into `metrics/<YYYY-MM-DD>/`.
- [x] 1.3 Add `npm run metrics`. It is **not** wired into `scripts/gate.sh` or
      `.husky/pre-commit`.
- [x] 1.4 Emit a short `metrics/<date>/summary.md` from the raw output
      (`scripts/metrics-summary.mjs`).

## 2. The baseline

- [x] 2.1 Ran `npm run metrics`; `metrics/2026-08-01/` committed as the baseline.
- [x] 2.2 Numbers reproduce the review exactly: 2.01% duplication, 2,180
      cross-game clone lines (palisade↔separate 469), 20 raw cycles, 814
      functions over complexity 15.
- [x] 2.3 **Complexity saturation CONFIRMED.** A synthetic function of true
      complexity 300 reports **255**; one of 100 reports 100. So biome's counter
      saturates at 255 and the six solvers all reporting 255 are `>=255,
      unknown`. `metrics-summary.mjs` reports them as `>=255` and excludes them
      from the maximum (highest *measurable* score is 234).

## 3. The complexity ratchet

- [x] 3.1 `complexity/noExcessiveCognitiveComplexity` enabled in `biome.json` at
      **`maxAllowedComplexity: 150`**, chosen from the distribution: 814 functions
      exceed biome's default of 15, 46 exceed 100, 30 exceed 120, **19 exceed
      150**. 150 is the level at which the exception list is small enough to be
      read and maintained; the gate still blocks anything new that is worse than
      today's worst-but-nineteen.
- [x] 3.2 All 19 exceedances suppressed **individually with a specific reason**
      (not by raising the threshold). The list doubles as the work queue and as
      a marker of where the complexity is genuinely algorithmic.
- [x] 3.3 Gate wall-clock unchanged — the rule runs inside the existing biome
      step (whole-tree biome lint ≈ 1.6s).

## 4. The free deletions — two of the three findings dissolved

- [x] 4.1 **Unused biome suppressions: 0, not 35.** The 35 came from the
      measuring config's `recommended: false`, which makes every suppression for
      a disabled rule report as unused. Against the root config there are none.
      Recorded as a caveat in `scripts/metrics.sh` so the harness cannot
      re-manufacture it.
- [x] 4.2 **`public/unsupported.js` is NOT dead** — it is referenced from
      `unsupported.html` via `<script src="/unsupported.js">`, exactly the
      HTML-entry-point false positive this task was written to catch. Left in
      place. `workbox-routing` **was** genuinely unused and is removed.
- [x] 4.3 Unlisted dependencies: `@lit/reactive-element` and `tinyglobby` are
      genuinely imported and are now declared. `vitest-environment-happy-dom` is
      a knip false positive — its vitest integration parses the
      `@vitest-environment` tag out of a **JSDoc comment that merely documents
      the tag** in `src/test-setup/icons.ts`. The source is correct, so the
      exception is in `knip.json` rather than a reworded comment.
- [x] 4.4 Re-ran `npm run metrics` post-deletion; snapshot committed.

## 5. Close out

- [x] 5.1 "Refactoring metrics" section added to
      `docs/porting/game-port-playbook.md`.
- [x] 5.2 Full gate green.

## Findings worth carrying forward

1. **Biome's cognitive-complexity counter saturates at 255** (verified by
   probe). Any instrument may clamp; a stable extreme reading across unrelated
   inputs is the tell.
2. **A measuring config manufactures findings.** Isolating one rule with
   `recommended: false` reported 35 phantom "unused suppressions". Always
   confirm a finding against the config the project actually runs.
3. **knip's dead-file report needs an HTML check.** `public/unsupported.js` is
   reached only from a `<script src>` tag, which knip cannot see.
4. **madge over-reports cycles 19:1 on this tree** — see
   `scripts/metrics-cycles.mjs`. Building that calibration also caught two
   cycles the first hand-analysis had wrongly cleared, because the classifier
   silently returned "no edge found" where it should have said "I could not
   classify this". A classifier that fails quietly toward the reassuring answer
   is worse than none.
5. **The gate honours suppressions; the harness must not.** Adding the 19
   complexity suppressions made the measured maximum fall from 234 to 145 and
   the count from 814 to 795 — the tree had not changed at all. A later round
   would have read that as progress. `metrics.sh` therefore measures a
   suppression-stripped copy of `src/`. Generalises: **an exception granted to a
   policy must never become an exception granted to the measurement**, or the
   baseline records the state of the exception list rather than of the code.
6. **A config's relative globs resolve from the config's own directory.**
   Pointing `--config-path` at `scripts/metrics-complexity.json` silently
   widened the scan from 477 files to 776 (tests included) because
   `!**/*.test.ts` no longer meant what it said. The config is now copied into
   the temp root so biome discovers it in place.
