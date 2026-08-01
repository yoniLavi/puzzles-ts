# enforce-module-layering — tasks

Depends on `establish-refactor-baseline` (which landed the cycle calibration).

## 1. The one real cycle

- [x] 1.1 Diagnosed. `state.ts` imported the validators `validateCounts` /
      `validateRows` from `solver.ts` (for `isComplete`), while `solver.ts`
      imported the cell and difficulty constants back from `state.ts` — values in
      both directions.
- [x] 1.2 **Moving the validators does not work**, and this is worth recording
      because it was the obvious first move: `validateCounts` is built on the
      `Scratch` counts, so extracting it drags the solver's core with it. And any
      arrangement that leaves the *constants* in `state.ts` re-forms the cycle,
      because whatever module holds the validators must import them.
      The fix is therefore to move the **vocabulary**, not the logic: a new
      `unruly/constants.ts` holds the cell values (`EMPTY`/`ONE`/`ZERO`/`Cell`)
      and the difficulty levels, and depends on nothing. `solver.ts`'s remaining
      import from `state.ts` is types only, which `verbatimModuleSyntax` erases,
      so no runtime edge closes the loop.
- [x] 1.3 Unruly's 63 tests pass; **`__fixtures__/` and `__snapshots__/` are
      untouched** — `git status` clean on both, so no verdict moved.

## 2. Calibrate the cycle metric

- [x] 2.1–2.3 Landed with `establish-refactor-baseline`
      (`scripts/metrics-cycles.mjs`). It classifies each edge and treats one it
      cannot classify as a **failure**, not as clean.
- [x] 2.4 Runtime cycles now **0** (raw madge count is still 20; all erased).
      Ratcheted by the test below rather than by the harness, so it runs in the
      gate.

## 3. Choose the layering tool

- [x] 3.1–3.2 **Chose an in-repo test** (`src/module-layering.test.ts`) over
      `dependency-cruiser`. Four rules over a fixed directory layout express
      fine as a test; it needs no new dependency; it runs inside the vitest step
      the gate already pays for; and this repo already asserts cross-cutting
      invariants this way (`asset-integrity.test.ts`,
      `catalog-registry.test.ts`). The cycle check went in the same file, so the
      ratchet is enforced per-commit rather than only when someone runs metrics.

## 4. Encode the rules

- [x] 4.1 No game imports another game.
- [x] 4.2 `engine/` does not import `games/`, except
      `engine/testing/hint-games.ts` — named as a single exact path, not as a
      wildcard over `engine/testing/`, so a second violation cannot hide behind
      the exemption.
- [x] 4.3 `engine/` and `games/` do not import `screens/`, `dialogs/` or
      `components/`.
- [x] 4.4 `preflight.ts` stays inside its Baseline 2023 gate (no top-level
      `await`, no dynamic `import()`, no `import.meta` beyond the
      vite-substituted `import.meta.env`, no relative imports).
- [x] 4.5 **Every rule verified to fail when violated**, by introducing a
      violation, observing the failure, and reverting — all five caught. Plus a
      sixth check that matters more than the other five: a **type-only** cycle
      is introduced and correctly **not** reported, which is what proves the
      calibration is right rather than merely permissive.

## 5. Close out

- [x] 5.1 `npm run metrics` re-run; runtime cycles 0.
- [x] 5.2 Full gate green.
- [x] 5.3 Layering rules noted in `docs/porting/game-port-playbook.md`.

## Findings

1. **The obvious fix for a cycle is often the wrong one.** Extracting the
   *logic* both sides shared (the validators) would have dragged the solver's
   `Scratch` machinery along and left the cycle in place. Extracting the
   *vocabulary* — the constants, which depend on nothing — broke it while moving
   no behaviour at all. When two modules need each other, ask which of them owns
   a leaf that neither really owns.
2. **A rule that documents itself will be read as code by something.** The
   preflight test failed on `preflight.ts`'s own header comment, which lists
   the very constructs it forbids; knip has the identical bug against
   `src/test-setup/icons.ts`, whose docblock explains the `@vitest-environment`
   tag. Strip comments before pattern-matching source, always.
3. **The preflight rule as first written was stricter than the real one.**
   `import.meta.env` is explicitly allowed — vite statically replaces it at
   build time — so a blanket `import.meta` ban would have been a false rule that
   passed only because nothing had yet used the permitted form.
