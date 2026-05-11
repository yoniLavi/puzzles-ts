# Tasks

## 1. Test runner + pre-commit

- [ ] 1.1 Add `vitest` as a dev dependency.
- [ ] 1.2 Add `npm test` (watch) and `npm run test:run` (one-shot) scripts to `package.json`.
- [ ] 1.3 Add minimal `vitest.config.ts` (or extend `vite.config.ts`) so tests pick up `src/**/*.test.ts`.
- [ ] 1.4 Rewrite `.husky/pre-commit` to run, in order and blocking on any failure: `npx tsc -b --noEmit` → `npm run lint` → `npm run test:run`. Drop `npx lint-staged`. Model on `/Users/yoni/codeliance/mathliance/.husky/pre-commit`.
- [ ] 1.5 Confirm the hook fires on `git commit` and that all three steps run green on the current tree (we may need to fix any pre-existing tsc/lint findings).

## 2. Characterization harness in `../puzzles/`

- [ ] 2.1 Read `puzzles/random.c` end to end (already done during proposal drafting; re-verify before coding).
- [ ] 2.2 Write a small C program in `../puzzles/auxiliary/random-trace.c` (or similar) that, given a seed and a script of calls (`bits N`, `upto N`, `copy`, `encode`, `decode HEX`), emits a JSON line per call with the output value (or encoded state).
- [ ] 2.3 Curate a corpus of seeds + call scripts that exercises: small/large `bits` counts (8, 16, 31), powers-of-two and non-powers-of-two `upto` limits, the SHA rollover at `pos >= 20`, copy semantics, encode/decode round-trip.
- [ ] 2.4 Run the harness against the native C build; commit the JSON corpus into `src/native/random/__fixtures__/`.

## 3. TypeScript implementation

- [ ] 3.1 Create `src/native/` directory.
- [ ] 3.2 Implement SHA-1 in `src/native/sha1.ts` (internal to the `random` module; not exported as a public seam yet — misc.c's SHA callers stay on C).
- [ ] 3.3 Implement `src/native/random.ts` mirroring the C `random_state` layout (40-byte seedbuf + 20-byte databuf + pos) and the public API.
- [ ] 3.4 Pay particular attention to JS-vs-C arithmetic differences: `random_bits` returns up to 32 bits and the C uses a careful `(1UL << (bits-1)) * 2 - 1` to avoid undefined shift behaviour. The TS impl SHALL produce the same bit-pattern values, using `>>> 0` and bigint as needed.

## 4. Replay test

- [ ] 4.1 Write `src/native/random/random.test.ts`. Load each corpus file, replay against the TS impl, assert byte-for-byte equality on every call.
- [ ] 4.2 Add an explicit test for the `state->pos >= 20` SHA-rollover path (corpus should already cover it; assert it does).
- [ ] 4.3 Run via `npm run test:run` — must be green.

## 5. Embind bridge + build flag

- [ ] 5.1 Decide the Embind handle-ownership pattern (see `design.md`). Likely: TS owns the canonical state, C holds an opaque handle that indirects through Emscripten-exported TS functions.
- [ ] 5.2 Add Embind bindings in `webapp.cpp` (and `emcclib.js` if needed) so the C code's `random_*` calls can be redirected to JS implementations.
- [ ] 5.3 Add a build flag (Emscripten `-D` or Vite env var, depending on what `design.md` settles on) that toggles between the C and TS implementations. Default: C (no behaviour change for the default build).

## 6. End-to-end verification

- [ ] 6.1 Build with the flag on. Run `npm run dev`. Manually open three to five different puzzles in a browser; confirm boards generate, render, and play normally.
- [ ] 6.2 Build with the flag off. Repeat. Confirm no regression in the C-only baseline.
- [ ] 6.3 Pick one puzzle with a known game ID (e.g. shared from the existing app) and confirm the same ID produces an identical board under both flag positions.

## 7. Reflect and wrap

- [ ] 7.1 Document actual time spent vs estimate in the PR description; PLAN.md's "first-session task" step 5 calls for this reflection.
- [ ] 7.2 Update `design.md` post-hoc with which option won and why (so the next seam has a worked example).
- [ ] 7.3 Re-run `openspec validate port-random-to-typescript --strict`.
