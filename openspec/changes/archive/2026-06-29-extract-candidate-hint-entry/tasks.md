# Tasks: Extract the shared candidate-elimination `hint()` entry wrapper

> Behaviour-preserving. Gate: per-game hint suites (the refusal branches and error
> strings are asserted there) + `hint-resume.test.ts`.

- [x] 1.1 `candidateHint(state, ui, findMistakes, buildSteps)` in
  `engine/candidate-hint.ts`: completed-check, mistake refusal, `autoPencil ?? true`,
  empty-plan refusal, the three shared error strings. Returns `HintResult`.
- [x] 1.2 Unit-test the three refusal branches + the success pass.
- [x] 1.3 Replace `hint` in keen/towers/unequal/solo with a one-line `candidateHint` call;
  re-run each game's hint suite (no wording/snapshot change).
- [ ] 1.4 Full gate green → owner acceptance → commit + archive.
