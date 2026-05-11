# Tasks

## 1. Test runner + pre-commit

- [x] 1.1 Add `vitest` as a dev dependency.
- [x] 1.2 Add `npm test` (watch) and `npm run test:run` (one-shot) scripts to `package.json`. Used `vitest run --passWithNoTests` for the one-shot so the gate passes before the first test lands.
- [x] 1.3 Add minimal `vitest.config.ts` so tests pick up `src/**/*.test.ts`.
- [x] 1.4 Rewrite `.husky/pre-commit` to run, in order and blocking on any failure: `npx tsc -b --noEmit` → `npm run lint` → `npm run test:run`. Dropped `npx lint-staged`. Modelled on `/Users/yoni/codeliance/mathliance/.husky/pre-commit`.
- [x] 1.5 Confirmed the hook fires on `git commit` and blocks on a deliberately-bad TS file. Pre-existing tsc errors turned out to all be downstream of missing WASM assets — resolved by running the Docker build once locally (the prereq is now documented). Added `*.tsbuildinfo` to `.gitignore`.

## 2. Characterization harness in `puzzles/auxiliary/` (in-tree)

- [x] 2.1 Read `puzzles/random.c` end to end.
- [x] 2.2 Wrote `puzzles/auxiliary/random-trace.c` and added it to `puzzles/auxiliary/CMakeLists.txt` (both in this repo). Native build dir `puzzles/build/` is gitignored. The program runs a hard-coded set of curated fixtures and emits a single JSON document to stdout.
- [x] 2.3 Curated 6 fixtures covering: mixed bit widths (1, 3, 7, 8, 15, 16, 24, 31), 32-bit boundary (8 calls), `random_upto` with power-of-two and non-power-of-two limits, SHA rollover (25 × 8-bit), `random_copy` independence, `random_state_encode`/`decode` round-trip — 66 calls total.
- [x] 2.4 Built the harness natively via `cmake .. && make random-trace` in `puzzles/build/`, ran it, captured `src/native/random/__fixtures__/corpus.json`. Verified byte-identical output between in-repo and sibling-clone builds.

## 3. TypeScript implementation

- [x] 3.1 Created `src/native/` directory.
- [x] 3.2 Implemented SHA-1 in `src/native/sha1.ts`. Internal to the `random` module; not exported as a public seam yet — misc.c's SHA callers stay on C.
- [x] 3.3 Implemented `src/native/random.ts` mirroring the C `random_state` layout (40-byte seedbuf + 20-byte databuf + pos) and the public API: `randomNew`, `randomBits`, `randomUpto`, `randomCopy`, `randomFree`, `randomStateEncode`, `randomStateDecode`.
- [x] 3.4 JS-vs-C arithmetic: `randomBits` accumulates via multiplication (`ret * 256 + byte`) instead of left-shift, so the 32-bit path doesn't get clobbered by JS bitwise semantics. Final trim is `ret % (2 ** bits)`, which works cleanly for `bits` 1–32 inclusive without ever overflowing JS Number precision.

## 4. Replay test

- [x] 4.1 Wrote `src/native/random/random.test.ts`. Loads the corpus, replays against the TS impl, asserts byte-for-byte equality on every call.
- [x] 4.2 The `sha_rollover` fixture (25 × 8-bit calls) drives the `state.pos >= 20` path. The fixture passes.
- [x] 4.3 `npm run test:run` is green — all 6 fixtures (66 calls) pass.
- [x] 4.4 (Added during implementation): harness gained an explicit `copy` op so the replay snapshot point is in the corpus itself, not inferred from call ordering.

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
