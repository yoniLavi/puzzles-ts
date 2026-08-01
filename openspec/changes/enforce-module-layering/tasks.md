# enforce-module-layering — tasks

Depends on `establish-refactor-baseline` (the cycle metric it calibrates).

## 1. The one real cycle

- [ ] 1.1 Read `unruly/solver.ts` and `unruly/state.ts` and decide where
      `validateCounts` and `validateRows` belong: they are imported *by* `state`
      *from* `solver`, while `solver` imports state values back.
- [ ] 1.2 Move them to whichever module owns the concept, or to a third module if
      neither does. Prefer the smallest move that removes the edge.
- [ ] 1.3 Run Unruly's tests. Differential and snapshots **unmodified** — moving
      two functions cannot change a verdict.

## 2. Calibrate the cycle metric

- [ ] 2.1 Make the cycle check report **runtime** cycles only. Either configure
      madge to respect type-only imports, or post-process its output by
      classifying each edge (an edge is type-only if the import is
      `import type ...` or every named binding is `type`-prefixed).
- [ ] 2.2 Verify the calibrated check reports **0** after §1, and that it still
      reports the unruly cycle when run against the pre-fix commit — a check that
      reports zero because it detects nothing is worthless.
- [ ] 2.3 Record in `scripts/metrics.sh` why the raw count differs from the
      calibrated one, so a future reader seeing "madge says 19" does not
      re-litigate it.
- [ ] 2.4 Ratchet runtime cycles at 0.

## 3. Choose the layering tool

- [ ] 3.1 Write the four rules out concretely (see proposal) and count how much
      configuration each option needs.
- [ ] 3.2 Decide: an in-repo test in the style of `catalog-registry.test.ts` and
      `asset-integrity.test.ts`, or `dependency-cruiser`. State the reason.
      Default to the test — it needs no dependency, runs in the existing vitest
      step, and this repo already asserts cross-cutting invariants that way.

## 4. Encode the rules

- [ ] 4.1 No game imports another game.
- [ ] 4.2 `engine/` does not import `games/`, **except** `engine/testing/
      hint-games.ts`, named explicitly with a comment saying why (it is the
      test-only hint enrollment file every hinting port adds itself to).
- [ ] 4.3 `engine/` and `games/` do not import `screens/`, `dialogs/` or
      `components/`.
- [ ] 4.4 `preflight.ts` imports nothing that breaks its Baseline 2023 gate.
- [ ] 4.5 **Verify each rule fails when violated.** Temporarily introduce a
      violation of each and confirm the check catches it, then revert. A layering
      rule that has never failed is a layering rule that may not work — and this
      one's whole value is that it fires years from now, when nobody remembers
      writing it.

## 5. Close out

- [ ] 5.1 Re-run `npm run metrics`; commit the snapshot.
- [ ] 5.2 Full gate green.
- [ ] 5.3 Note the layering rules in `docs/porting/game-port-playbook.md`, so a
      new port learns the boundary from the guide rather than from a CI failure.
