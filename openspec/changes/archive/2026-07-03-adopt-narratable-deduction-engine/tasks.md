# Tasks — adopt one narratable deduction engine per logic game

## 1. Phase 1 — shared deduction-fixpoint scaffold (mechanical, no behaviour change)
- [x] 1.1 Add `src/native/engine/deduction-fixpoint.ts`:
      `runDeductionFixpoint({ rungs, maxRung, recorder })` — ordered-rung fixpoint,
      difficulty cap, recorder-gated reason allocation, step-budget tick on the
      recording path only (generator runs unbudgeted). *(Takes `budget?` — the
      derived-from-recorder thing it actually uses; reason-gating stays in the
      per-game techniques. Also `baseGrade`, `beforeRung`, and a top-of-iteration
      `solved` early-out.)*
- [x] 1.2 Converge `filling/solver.ts` onto the runner (same four techniques,
      same order, same verdict). Differential + `filling-hint` stay green.
      *(`FillingSolver.run` — restart-on-first-firing + `solved: nempty===0`.)*
- [x] 1.3 Converge `undead/solver.ts` (the counting/forcing ladder) onto it.
      Differential + `undead` suites stay green. *(The hint recorder
      `recordUndeadDeductions` — counting→sightline→forcing, group-per-firing,
      `solved: anyEmpty`. The `solveDeductive` **grade** ladder is a distinct
      escalating structure — with the `arcPasses` Easy-tier cap — so it stays as
      its own loop; converging it would change its verdict-affecting bookkeeping.)*
- [x] 1.4 Converge `engine/latin.ts` and `pattern/solver.ts` loops onto it (Pattern
      keeps its current techniques + fallback for now — the fallback is removed in
      its own Phase-3 change). All differentials + `hint-resume` stay green.
      *(latin `latinSolverTop` = the canonical call site; Pattern `deduceHintPlan`
      = rungs `[named-technique-scan, fallback-scan]`, guard→step-budget. Pattern's
      order-independent generator worklist `solvePuzzle` is a different algorithm
      and is deliberately left as-is.)*
- [x] 1.5 Unit-test the runner directly (rung ordering, `maxRung` cap, recorder
      on/off equivalence of verdict, step-budget fires on a non-terminating rung).
      *(`deduction-fixpoint.test.ts`, 11 cases.)*

## 2. Phase 2 — the generation policy (spec + guide)
- [x] 2.1 `ts-migration`: the narratable-deduction generation policy (this change's
      spec delta) — authored; applied to the capability spec on archive.
- [x] 2.2 `ts-engine`: the shared-scaffold requirement + "a hint step always names a
      technique — no un-narrated fallback" — authored; applied on archive.
- [x] 2.3 Update `docs/porting/hint-authoring.md` (§1A: no-generic-fallback bar +
      narrate-vs-reject decision rule + shared-runner pointer; §7.2: run ladders
      through the runner) and `game-port-playbook.md` (§2.1 helper): the standing
      bar for a new logic port is one narratable engine over the shared runner; no
      generic hint fallback; choose narrate-everything vs reject-at-generation by
      measured cost.

## 3. Phase 3 — staged per-game flip (each its OWN follow-on change; listed as roadmap)
- [ ] 3.1 **Pattern first** (`remove-pattern-hint-fallback`): enrich the named
      techniques (edge/anchor, run-completion, gluing) to shrink the residual, and
      reframe the leftover `doRow` intersection as an honest deductive *bottom rung*
      ("only these cells agree in every arrangement") — removing the generic
      `forced` "just because" step while keeping every board and the byte-match
      differential (recommended, per design D4). Document the stricter reject
      alternative (forfeit byte-match, retire `doRow`) and the measured per-size
      rejection rate; update the pattern spec.
- [ ] 3.2 **Audit the threaded games** (Range/Singles/Filling/Unruly/Latin family):
      confirm each already narrates every accepted deduction (expected: compliant);
      file a per-game flip only where the audit finds an un-narrated deduction.
- [ ] 3.3 For any game that adopts a rejection gate, record the measured rejection
      rate and the re-graded difficulty tiers in that game's change.

## 4. Close out (this change = Phase 1 + Phase 2 only)
- [x] 4.1 `openspec validate adopt-narratable-deduction-engine --strict` passes.
- [x] 4.2 Full gate green (tsc → biome lint → vitest → vite build, 1955 tests);
      differentials and `hint-resume` unchanged (Phase 1 is behaviour-preserving).
- [ ] 4.3 On owner acceptance, commit + archive; Phase-3 flips proceed as their own
      changes.
