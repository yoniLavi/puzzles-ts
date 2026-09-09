# measure-test-impact-selection — tasks

- [x] 1. Survey the tooling: `vitest related`/`--changed`, `vitest-affected`,
      `testpick`, Datadog Test Impact Analysis, Nx/Turborepo affected. Recorded
      in `proposal.md` with what each selects on.
- [x] 2. **Experiment 1 — game source.** `vitest related src/games/sixteen/index.ts`
      → 33 of 301 files. Cross-referenced the selection against every test file
      using `import.meta.glob`, and confirmed the missed ones are glob-only (no
      static import of `games/`).
- [x] 3. **Experiment 2 — help page.** `vitest related help/games/sixteen.md`
      → "No test files found", against three guards that read `help/`.
- [x] 4. Record the result as an `ADDED` requirement so the existing conjecture
      ("**may** omit") stops being the only thing on record.
- [x] 5. `docs/games/testing.md` gains a short pointer, so the next person to ask
      finds the answer where they are already reading.

## Deliberately not done

- **No dependency added.** `vitest-affected` is the only tool whose mechanism
  would actually work here (runtime import data) and it has one GitHub star,
  does not list `import.meta.glob` among its coupling channels, and would sit
  inside the gate. `AGENTS.md` forbids bypassing validation; quietly making it
  unsound is the same thing by another route.
- **No change to the gate.** The cheap win was the measurement a day earlier
  (~−25% by deferral), not selection.
