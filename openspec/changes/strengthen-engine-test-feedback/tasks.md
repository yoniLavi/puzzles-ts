# strengthen-engine-test-feedback — tasks

Source data: `openspec/changes/archive/*-audit-test-suite-strength/findings.md`
§4b (per-module table) and §4c (survivor triage). The raw report is
`metrics/mutation/report.json`; `mutation-shape.mjs` in that archived change
turns it into the per-module table and the survivor clusters.

## 0. Start from the data, not from the code

- [ ] 0.1 `node <archived>/mutation-shape.mjs metrics/mutation/report.json` and
      read the cluster table. Work clusters, never individual mutants — ~250 of
      the 331 survivors are `ConditionalExpression`/`BooleanLiteral` in
      orchestration plumbing and are mostly equivalent.
- [ ] 0.2 Record the starting local-kill rates so the change can be measured:
      `latin.ts` 9/593 (2%), `grid.ts` 1/40 (3%), `save.ts` 8/54 (15%),
      `midend.ts` 208/531 (39%), `dsf.ts` 14/24 (58%),
      `deduction-fixpoint.ts` 19/27 (70%), `border-grid.ts` 150/168 (89%).

## 1. The two extremes first

- [ ] 1.1 **`grid.ts` — 1/40 local.** Zero survivors, so this is purely a
      feedback fix: it is fully protected by the games and says nothing locally.
      Assert the planar-graph invariants its own doc comment claims (Euler's
      relation for the tilings, incidence consistency, dot dedup by identity),
      not the RNG draw order — that is differential-pinned, and
      `symmetric-blacks.test.ts` records why that boundary is deliberate.
- [ ] 1.2 **`latin.ts` — 9/593 local, 117 survivors.** The largest module and the
      worst locality. Take the `ConditionalExpression` (41) and `EqualityOperator`
      (25) clusters first; expect a meaningful share to be equivalent and say so
      rather than forcing them.

## 2. The statements no test executes

- [ ] 2.1 48 `NoCoverage` mutants, 41 in `midend.ts` over 31 statements. Cheap
      and worth it because several are **player-visible strings**: the `catch`
      arms producing `Invalid parameters: …`, `Could not read save: …`,
      `Invalid saved parameters: …`, and the refusals `This game does not support
      solving` / `… hints`.
- [ ] 2.2 The adapter-facing methods no test calls: `getColourPalette`,
      `darkPalette`, `preferredSize`, `delete`.
- [ ] 2.3 **Check each against `tighten-type-checking`'s finding before assuming
      anything is dead** — that change proved all 53 of its "unreachable"
      branches live. These read as reachable-but-unexercised, so the action is a
      test; confirm that per case rather than in bulk.

## 3. The timeout question

- [ ] 3.1 346 mutants (16%) timed out, **227 in `latin.ts`**. Determine whether
      these are genuine non-termination (a mutated solver looping, which is
      expected and fine) or **contention artefacts** — the box was heavily loaded
      and Stryker's budget is `baseline × 2 + timeoutMS`, with the baseline
      measured on a quieter box.
- [ ] 3.2 It does not change the audit's result — Stryker scores a timeout as
      killed — but it decides how much of the 398 minutes was wasted and what a
      re-run should be budgeted at. Record the answer in the archived findings or
      here, whichever the reader will find.

## 4. Measure, and do not fool yourself

- [ ] 4.1 Re-run `npm run mutation` on the same config and compare local-kill
      rates against 0.2. **Budget ~7 hours** and run it detached and last — it is
      the slowest thing in the repository by an order of magnitude.
- [ ] 4.2 **Every test added is verified to discriminate**, by breaking the line
      it covers and watching it fail. Four real gaps were found this way in the
      audit's own new test files, each of which had passed on first write.
      When mutating by script, make the harness **fail loudly if its edit does
      not apply** — a non-unique anchor silently reports "SURVIVED" and that
      artefact produced two false results before it was caught.
- [ ] 4.3 Report the gate's cost change in **CPU time**, per `build-pipeline`.
      Adding tests is not free and the point of the exercise is a fast suite.

## 5. Close out

- [ ] 5.1 Full gate green.
- [ ] 5.2 State plainly what was left equivalent and why. A survivor deliberately
      not killed is a result; a survivor quietly unmentioned is the silent cap
      this project keeps naming.
