# strengthen-engine-test-feedback — tasks

Results and triage: [`findings.md`](findings.md). Source data:
`openspec/changes/archive/*-audit-test-suite-strength/findings.md` §4b/§4c and
`metrics/mutation/report.json`.

> **The task list below was written around a metric that turned out to be an
> artefact** (§1 of `findings.md`): Stryker bails on first failure, so
> "killed by its own test file" measures which covering test ran *first*.
> Tasks 0–1 are kept as written, with their outcomes recorded, because the
> correction is the change's main result and deleting the premise would hide it.

## 0. Start from the data, not from the code

- [x] 0.1 Read the cluster table. **Done, and it is what exposed the artefact**:
      building a harness to replay recorded mutants revealed that every one of
      the 1,437 killed mutants has exactly one `killedBy` entry.
- [x] 0.2 Record the starting rates. **Superseded**: the recorded rates were the
      artefact. Re-measured properly with `npm run probe` — `latin.ts` 33%,
      `midend.ts` 41%, `wires.ts` 50%, `dsf.ts` 60%, `border-grid.ts` 71%,
      and `grid.ts` / `save.ts` / `deduction-fixpoint.ts` / `divvy.ts` /
      `symmetric-blacks.ts` already at 100%.

## 1. The two extremes first

- [x] 1.1 **`grid.ts` — nothing to do, and that is the finding.** Its own tests
      catch **6 of 6** planted defects; deleting the `case "cairo":` arm fails
      nine of them in 1.5 s. The 1/40 figure was file execution order —
      `grid-aperiodic-differential`, `grid-desc` and `grid-incentre` all sort
      ahead of `grid.test.ts`.
- [x] 1.2 **`latin.ts` — the real gap, for a different reason.** Not "117
      survivors" but 854 lines and eleven consuming games behind four
      end-to-end tests. Each deduction now has a direct test in its own
      vocabulary (`elim`, `set`, `forcing`, `place`), plus `matching` against a
      brute-force maximum and `latinGenerateRect`'s crop. **5/15 → 14/14.**

## 2. The statements no test executes

- [x] 2.1 The player-visible strings. `loadGame`'s four refusals (only the
      puzzle-id one was covered), `newGameFromId`'s four (two covered), and
      "This game does not support solving / hints" — where returning `undefined`
      means *done* and would tell the player it worked.
- [x] 2.2 The four adapter-facing methods no test called: `preferredSize`,
      `getColourPalette`, `darkPalette`, `delete`. The first draft of this line
      claimed `worker-adapter.test.ts` reached three of them — it does not; it
      only forwards to them — and grepping rather than assuming is what caught
      it. All four now have probe cases and tests.
- [x] 2.3 Checked per case against `tighten-type-checking`'s finding. Two turned
      out **equivalent** rather than untested and are recorded as such
      (`findings.md` §4); the rest were reachable-and-unexercised, as expected.

## 3. The timeout question

- [x] 3.1 **Genuine non-termination**, established from the existing report at
      zero re-run cost. The two modules with no loop at all (`save.ts`,
      `grid.ts`) had **zero** timeouts across 125 mutants, and the rate runs
      *inversely* to covering-set size — the opposite of what contention
      predicts. Table in `findings.md` §5.
- [x] 3.2 Recorded in `findings.md` §5 and in `docs/test-strength.md` §6.
      Budget a re-run at the same ~400 minutes; a quieter box will not help.

## 4. Measure, and do not fool yourself

- [x] 4.1 Re-measured with **`npm run probe`, not Stryker**: a 7-hour re-run
      would re-measure the metric §1 disproved. 43/69 → 70/70 scored (100% on
      every module), 2 excluded as equivalent.
- [x] 4.2 **Every test verified to discriminate**, by planting the defect and
      watching it fail. The harness aborts on a missing or non-unique anchor and
      it fired three times, the first on its very first invocation.
- [x] 4.3 Gate cost reported in CPU time in `findings.md` §6: **+49 tests for
      +4.9 s user CPU (+2.9%)**, wall clock unchanged, measured with
      `/usr/bin/time -l` back to back across a `git stash`. The probe itself is
      ~15 min and is deliberately not in the gate.

## 5. Close out

- [x] 5.1 Full gate green: 252 files, 6,604 tests.
- [x] 5.2 Equivalents stated plainly: `findings.md` §4, two of them, each with
      the argument. Working out the second corrected a comment in
      `border-grid.ts` that its own test already contradicted.
