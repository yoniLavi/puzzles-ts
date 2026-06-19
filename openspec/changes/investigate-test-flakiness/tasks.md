# Tasks: Reproduce and fix the flaky generator test

## 1. Reproduce
- [ ] 1.1 Loop the full suite under load until it fails (e.g. run
  `npx vitest run` N times, or stress with `--no-file-parallelism` off and CPU
  busy), capturing the failing test, assertion, params, and seed.
- [ ] 1.2 Determine the class: re-run the captured seed/params **in isolation**.
  Passes alone ⇒ timeout/contention; fails alone ⇒ logic. Record which, with the
  raw output.

## 2. Root-cause
- [ ] 2.1 If timeout/contention: measure the slow test's worst-case wall time
  and the generator's worst-case retry count; confirm it crosses the default
  timeout only under saturation.
- [ ] 2.2 If logic: minimise to the failing seed; identify the
  generator/solver edge case (a board the TS solver grades not-uniquely-solvable
  that the generator accepted, or vice versa).
- [ ] 2.3 If shared state: identify the cross-test mutable leak.

## 3. Fix
- [ ] 3.1 Apply the cause-appropriate fix (per the proposal): targeted timeout /
  reduced per-case work / generator iteration cap; OR generator/solver fix +
  failing-seed regression fixture; OR concurrency tuning. Not a blanket
  suite-wide timeout bump.
- [ ] 3.2 Re-run the repro loop to confirm the flake is gone (many consecutive
  green full runs).

## 4. Guard
- [ ] 4.1 `repo-layout` spec delta: the full suite is deterministic; heavy
  generator tests are bounded + seed-deterministic.
- [ ] 4.2 Record the repro recipe in the port playbook (live wiki).
- [ ] 4.3 Full gate green; archive.
