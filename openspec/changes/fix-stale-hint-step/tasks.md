# Tasks

## 1. Reproduce + root-cause

- [ ] 1.1 Add a dev-only invariant check (behind `import.meta.env.DEV`) that
      logs when a displayed `pencilStrike` step has a mark absent from the
      current pencil — dump grid, pencil, stored plan, index, auto-pencil pref,
      move history. (Towers `render.ts` or the midend hint-display path.)
- [ ] 1.2 Reproduce in the browser on id
      `5:2/4/3/2/1/2/1/3/2/3/3/1/3/4/2/1/3/3/2/2` (try toggling auto-pencil
      mid-solve first — leading suspect). Capture the exact state + move
      sequence that triggers it.
- [ ] 1.3 Confirm the root cause (see `design.md` hypotheses 1–3).

## 2. Failing test

- [ ] 2.1 Write an automated test from the captured state+moves that drives a
      real `Midend` (show/keep/show) and asserts the displayed strike's marks
      are all live in the current state — red before the fix.

## 3. Fix

- [ ] 3.1 Implement the chosen fix (prefer engine-level "validate-at-display",
      design option A), preserving exact-follow plan persistence.
- [ ] 3.2 Audit the other candidate-elimination games (Singles, Range, Filling,
      Unruly) for the same latent staleness; the engine-level guarantee should
      cover them — add coverage.

## 4. Spec + docs

- [ ] 4.1 Add the "a displayed hint step is never stale" guarantee to the
      `ts-engine` Hint System spec (see this change's `specs/ts-engine/`).
- [ ] 4.2 Note the gotcha + the dev invariant check in
      `docs/porting/hint-authoring.md`.

## 5. Verify

- [ ] 5.1 `npm run test:run`, `tsc -b --noEmit`, `biome lint`, `vite build`.
- [ ] 5.2 Browser: the phantom is gone on the reported id; exact-follow still
      keeps the plan; a conflicting move still regenerates.
- [ ] 5.3 `openspec validate fix-stale-hint-step --strict`.
