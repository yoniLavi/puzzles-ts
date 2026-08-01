# audit-test-suite-strength — tasks

## 1. Set it up, scoped

- [ ] 1.1 Add Stryker (`@stryker-mutator/core` + the vitest runner) as a dev
      dependency. Nothing else.
- [ ] 1.2 Config scoped to the seven highest-leverage engine modules first:
      `midend.ts`, `save.ts`, `latin.ts`, `deduction-fixpoint.ts`,
      `border-grid.ts`, `dsf.ts`, `grid.ts`.
- [ ] 1.3 Run it detached under `nice`, with a bounded timeout. Do **not** run it
      from the pre-commit gate or CI.
- [ ] 1.4 **Sanity-check the harness before trusting a result.** Introduce one
      deliberate bug in a covered engine module and confirm the suite catches it.
      A mutation run reporting a high score because the tests never executed is
      the exact failure mode this change exists to detect — and this session
      already produced two instruments that passed while measuring nothing.

## 2. Triage survivors

- [ ] 2.1 Each survivor is a specific claim: *"this line could be wrong and all
      6,478 tests still pass."* Classify each as
      **(a)** a missing assertion → write the test;
      **(b)** genuinely unreachable → the code may be removable, but check it
      against `tighten-type-checking`'s finding first (that change proved every
      one of 53 "unreachable" branches was in fact live and the analysis wrong);
      **(c)** an equivalent mutant → record and move on.
- [ ] 2.2 Do not chase the score. Fixing (a) is the work; (c) is noise and the
      percentage that includes it means nothing.

## 3. Report the shape, not the number

- [ ] 3.1 **Where do survivors cluster?** That is the transferable result. If they
      cluster in code the differentials are supposed to protect, the fixture net
      is thinner than the project believes, and that changes how the next
      refactor is allowed to justify itself as a no-op.
- [ ] 3.2 Specifically check the snapshot-protected render paths. The repo's own
      rule — "pair every snapshot with a few targeted assertions so a careless
      `-u` can't erase the guarantee" — has never been verified as load-bearing.
- [ ] 3.3 State plainly what was **not** covered: the 57 games' solvers are out of
      scope here. A partial run reported as complete is the "no silent caps"
      failure.

## 4. Decide what, if anything, persists

- [ ] 4.1 Decide whether the config is kept for periodic re-runs (folded into
      `scripts/metrics.sh` as an opt-in step) or removed with the findings kept.
      State the reason either way.
- [ ] 4.2 **No ratchet on the mutation score.** A number that invites maximising
      leads to tests written against mutants rather than behaviour.
- [ ] 4.3 If the engine pass is informative, scaffold a follow-up naming the
      specific games worth mutating. If it is not, say so — "the engine's tests
      are load-bearing" is a real result and closes the question.

## 5. Close out

- [ ] 5.1 Record the findings in the change directory, as
      `tighten-type-checking/findings.md` did — the triage is the artefact, since
      a diff cannot show that a survivor was *considered*.
- [ ] 5.2 Full gate green.
