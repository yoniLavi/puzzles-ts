# audit-test-suite-strength — tasks

Full triage in [`findings.md`](findings.md); this file records what was done.

## 1. Set it up, scoped

- [x] 1.1 Added `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` as dev
      dependencies. Nothing else.
- [x] 1.2 `scripts/stryker.config.mjs` (`npm run mutation`), scoped to the seven highest-leverage
      engine modules: `midend.ts`, `save.ts`, `latin.ts`,
      `deduction-fixpoint.ts`, `border-grid.ts`, `dsf.ts`, `grid.ts`.
      **2,168 mutants.**
- [ ] 1.3 Run detached under `nice`. Not in the pre-commit gate, not in CI.
      **In flight at the time of this commit**: dry run succeeded in 19m11s
      (4,466 tests, serially); the mutant phase is at 401/2,163.
      Two settings had to be discovered rather than guessed, and both are
      consequences of the same fact — **Stryker's vitest runner forces
      `pool: "threads"`, `maxThreads: 1`, `maxWorkers: 1`**, so the suite runs
      *serially*: the default 5-minute `dryRunTimeoutMinutes` is far too short
      (raised to 45), and `coverageAnalysis: "perTest"` is not optional but
      load-bearing — without it every mutant re-runs all 6,490 tests.
- [x] 1.4 **Sanity-checked before trusting anything.** Deliberate bugs were
      injected into covered engine modules and the suite run:
      `deduction-fixpoint.ts` `ret < 0` → `ret <= 0` was caught (5 failed);
      `grade = Math.max(grade, r)` → `grade = r` was **not** caught by the
      module's own tests — see findings §3, which is the audit's headline
      result and was found by this very check. The harness measures.

## 2. Triage survivors

- [ ] 2.1 **Partly done — the run is still in flight** (see 1.3). The survivors
      the sanity check and the cheap instruments produced are already classified
      and acted on; the systematic list follows when the run lands.
      **(a) missing assertion →** `deduction-fixpoint.test.ts` gained two:
      the grade must not regress when a hard rung unlocks an easier one, and
      `baseGrade` is a floor rather than a default. The mutant that previously
      needed the whole 116-second suite to die now dies in **116 ms**.
      **(b) unreachable →** checked against `tighten-type-checking`'s finding
      first (that change proved all 53 "unreachable" branches were live).
      **(c) equivalent →** recorded, not chased.
- [x] 2.2 The score was not chased. No test was written against a mutant; each
      new assertion states a behaviour a reader would recognise as the point of
      the code.

## 3. Report the shape, not the number

- [ ] 3.1 **Where survivors cluster goes in findings.md §4** (pending the run), and the transferable
      result is in §3: the guarantee for the shared engine is real but lives
      *several layers away from the code it protects*. An engine module's own
      test file can be green while the module is wrong, with only a game's
      frozen differential noticing. That is adequate as coverage and poor as
      feedback — and it makes the repo's own test-run-economy habit ("run just
      the relevant test files") systematically misleading during engine work.
- [x] 3.2 **Snapshot-protected render paths checked, and the rule holds.**
      99 snapshot-asserting tests in 69 `describe` scopes; **0** where the
      snapshot is the only assertion. Verified load-bearing rather than merely
      present: a real render bug was injected into `crossing/render.ts` and the
      suite run **with `-u`**, so the snapshots re-baselined around it — **5
      tests still failed**. findings.md §1.
- [x] 3.2b **Acted on §5 for the two largest modules with no local test.**
      `wires.ts` (413 lines, 9 importers) gained 25 tests, `symmetric-blacks.ts`
      (151 lines, 7 importers) gained 15 — each stating the rules its own doc
      comment claims, each mutation-checked against the line it covers, and four
      real gaps found that a green first run had hidden. One probe survives *by
      design* and is recorded as differential-pinned, verified rather than
      assumed.
- [x] 3.3 **What was NOT covered, stated plainly.** The 57 games' solvers,
      generators and renderers were **not** mutated — out of scope by design.
      Only the seven named engine modules were. The other ~83 engine modules
      were not mutated either; findings §5 records which of them have no test
      file of their own and what actually covers them. The differentials were
      **sampled** by hand (findings §2), not exhaustively mutated.

## 4. Decide what, if anything, persists

- [x] 4.1 **Decision: keep the config, don't fold it into `metrics.sh`, don't
      gate, don't ratchet.** Reasons in findings.md §6 — chiefly that the three
      feasibility settings are the value being preserved, and that a harness
      taking hours must not be attached to one taking minutes.
- [x] 4.2 **No ratchet on the mutation score**, and none added. The score is not
      recorded as a target anywhere; `thresholds.break` is `null`.
- [ ] 4.3 Follow-up scaffolding — pending the survivor list, which is what
      would name the specific games worth mutating.

## 5. Close out

- [ ] 5.1 Findings recorded as [`findings.md`](findings.md), with the two
      analysis scripts (`snapshot-pairing.mjs`, `mutation-shape.mjs`) beside it
      — the triage is the artefact, since a diff cannot show that a survivor was
      *considered*.
- [x] 5.2 Full gate green.
