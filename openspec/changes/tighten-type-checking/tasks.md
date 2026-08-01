# tighten-type-checking — tasks

Depends on `establish-refactor-baseline` (the metrics harness records the
before/after).

## 1. Compiler flags

- [ ] 1.1 Enable `noImplicitOverride` (27 errors — smallest, establishes the
      pattern). Fix, don't suppress.
- [ ] 1.2 Enable `noPropertyAccessFromIndexSignature` (52 errors).
- [ ] 1.3 Enable `exactOptionalPropertyTypes` (108 errors). Expect this one to
      surface real intent questions: `{ x?: number }` and
      `{ x: number | undefined }` mean different things, and the port blurred
      them. Where a property genuinely may be *present and undefined*, widen the
      type rather than deleting the `| undefined`.
- [ ] 1.4 Work module by module, **lowest fan-in first** — leaves before roots —
      so downstream churn is not re-fixed.
- [ ] 1.5 Record the `noUncheckedIndexedAccess` refusal as a comment in
      `tsconfig.json`, naming the 9,028-error measurement and pointing at
      `establish-refactor-baseline` design D5.

## 2. The type-aware audit

- [ ] 2.1 Run `typescript-eslint` with exactly four rules
      (`no-unnecessary-condition`, `no-unnecessary-type-assertion`,
      `prefer-optional-chain`, `prefer-nullish-coalescing`) against `src/`,
      excluding tests. Capture the JSON output into `metrics/`.
- [ ] 2.2 **Split the findings before fixing any of them**: the 38 "types have no
      overlap" plus 15 "always falsy" go on a bug-triage list; the ~205 others
      are tidying.

## 3. Dead-branch triage — the substance of this change

- [ ] 3.1 For each of the ~53 dead branches, determine which it is:
      **(a)** a guard made redundant by a type that was later tightened → delete;
      **(b)** a check that was *meant* to fire and cannot → **fix the condition**.
- [ ] 3.2 Do not batch-fix. Each (b) is a behaviour change and needs its own
      reasoning, its own test, and a line in the change's findings log.
- [ ] 3.3 Pay particular attention to the clusters the audit found in
      `native/engine/midend.ts` (8), `native/games/undead/solver.ts` (8),
      `native/engine/latin.ts` (5) and `native/engine/slide-planner.ts` (5) —
      engine and solver code where a never-firing check has the widest blast
      radius.
- [ ] 3.4 Write the findings log into the change directory as `findings.md`:
      one row per dead branch, its verdict, and what happened. This is the
      artefact that justifies the change; a diff alone cannot show that a
      deletion was *checked* rather than assumed.

## 4. Tidying

- [ ] 4.1 Apply the auto-fixable findings (`prefer-nullish-coalescing`,
      `prefer-optional-chain`, `no-unnecessary-type-assertion`) with `--fix`.
- [ ] 4.2 Review the resulting diff **as a whole**, not per file — a mechanical
      fixer's mistakes are visible as a pattern and invisible one hunk at a time.
- [ ] 4.3 Confirm biome's formatter is content with the fixer's output (two
      tools rewriting the same lines is the usual source of gate churn).

## 5. The CI decision

- [ ] 5.1 Decide whether the four type-aware rules join CI permanently, on the
      evidence of what §3 found. State the decision and its reason.
- [ ] 5.2 If **yes**: add to CI only (not the per-commit hook — it needs a full
      type-check and would put `tsc` on the fast-fail path twice), and update the
      `build-pipeline` spec delta accordingly.
- [ ] 5.3 If **no**: fold the run into `scripts/metrics.sh` so each refactoring
      round re-measures it, and delete the CI delta from this change's spec.

## 6. Close out

- [ ] 6.1 Re-run `npm run metrics`; commit the snapshot.
- [ ] 6.2 Run the full gate, plus the differentials for any game whose behaviour
      a §3.1(b) fix changed.
- [ ] 6.3 Report the bug count found. If it is zero, say so — "53 dead branches,
      all genuinely redundant" is a real and reassuring result, and it is
      different from not having looked.
