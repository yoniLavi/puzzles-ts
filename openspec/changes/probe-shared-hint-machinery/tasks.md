# probe-shared-hint-machinery — tasks

## 0. Before writing a single case

- [ ] 0.1 Read `candidate-hint.ts` end to end. A probe case is only worth
      anything if its `why` names a defect in the module's own vocabulary; that
      cannot be done from a diff.
- [ ] 0.2 Run `npm run probe -- candidate-hint` after the first few cases, not
      after all of them — the anchor check is 0.02 s and catches a bad case
      before it becomes twelve bad cases.

## 1. The work

- [ ] 1.1 `candidate-hint.ts` (711 lines, 13 importers). Bias cases toward the
      **claims a hint utters**: a narration whose premise is not actually
      checked is the failure the hint bar names, and it is invisible to a
      snapshot (which records whatever the game emits).
- [ ] 1.2 `slide-planner.ts` (527) — plan stability across recomputes is the
      known hard part (the Inertia postmortem), so probe the monotone potential.
- [ ] 1.3 `loopgen.ts` (297).
- [ ] 1.4 `grid-geometry.ts` (482). State in its test file that it is
      display/input only — never desc, generation or solving — since that is the
      boundary that makes floating point safe here.

## 2. Close out

- [ ] 2.1 Record equivalents with their arguments; do not chase them.
- [ ] 2.2 Report the gate's cost change in CPU time.
- [ ] 2.3 Full gate green.
