# probe-shared-hint-machinery — tasks

## 0. Before writing a single case

- [x] 0.1 Read `candidate-hint.ts` end to end. A probe case is only worth
      anything if its `why` names a defect in the module's own vocabulary; that
      cannot be done from a diff.
- [x] 0.2 Run `npm run probe -- candidate-hint` after the first few cases, not
      after all of them — the anchor check is 0.02 s and catches a bad case
      before it becomes twelve bad cases.

## 1. The work

- [x] 1.1 `candidate-hint.ts` (711 lines, 13 importers). **30 cases,
      14/30 → 30/30.** The gap was whole functions, not branches: `lazyPopulate`,
      `emitObviousCleanStep`, `populateStep` and the entire custom-move-dialect
      path had no local test at all. One survivor was the exact defect an owner
      bug report on Salad found in July — the working pencil fill overwriting
      notes the player had already narrowed, so the plan goes on to teach strikes
      on candidates no longer on their board.
- [x] 1.2 `slide-planner.ts` (527). **20 cases, 12/20 → 18/18 + 2 argued
      equivalents.** One survivor was a defect in the module, not the tests:
      `usedExactSearch` was re-derived at each return and disagreed with itself
      on the same fallthrough — `true` on the partial plan, `false` when the
      heuristic then reached the goal. Now tracked in a variable.
- [x] 1.3 `loopgen.ts` (297). **12 cases, 7/12 → 10/10 + 2 measured
      equivalents**, and two further cases written then **removed** for probing
      *which* loop a seed yields, which is Pearl's differential's guarantee — the
      split is now stated in `loopgen.test.ts`'s header and verified (the
      differential goes to 7 failed under one of them). The local test also
      stopped claiming more than it checked: it asserted degree parity under a
      comment promising *a single closed* loop, and two disjoint rings satisfy
      parity. It counts components now, and the bias protocol — previously
      untouched by any test — has three.
- [x] 1.4 `grid-geometry.ts` (482). **18 cases, 9/18 → 14/14 + 4 equivalents.**
      New home at `src/engine/grid/grid-geometry.test.ts`, whose header states
      the display/input-only boundary (never desc, generation or solving) and
      says where the other two thirds of this module's coverage live.

## 2. Close out

- [x] 2.1 Record equivalents with their arguments; do not chase them. Eight in
      total, in three flavours — argued from the code, argued mathematically
      (ray-cast parity), and settled by measurement where the argument would not
      close. `docs/test-strength.md` §5 carries all of them.
- [x] 2.2 Report the gate's cost change in CPU time. **+33 tests for +1.2 s** of
      in-test CPU (median over three runs of the four files: 128 ms → 1.31 s),
      almost all of it the two brute-force yardsticks — the slide-planner's plain
      BFS and the incentre's integer-lattice sweep. That cost *is* the
      independence: neither shares a line with the code it measures.
- [x] 2.3 Full gate green.
