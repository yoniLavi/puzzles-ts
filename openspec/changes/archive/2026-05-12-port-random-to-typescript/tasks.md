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

## 5. Embind bridge + build flag — DEFERRED to follow-up change

§5 and §6 are split off into a separate openspec change, **`wire-random-to-wasm`**. Reasons (decided mid-flight, confirmed by the user):
- "TS impl is provably correct" and "TS impl is wired into the running WASM" are two distinct kinds of work; the natural seam falls between them.
- Bridge work has a slow iteration loop (Docker WASM rebuild + manual browser verification) that benefits from its own focused cycle.
- PLAN.md's "first-session task" step 5 explicitly calls for a reflection breakpoint here.

The detailed bridge design lives in `design.md` of this change (Option A — TS owns canonical state, C holds integer handle; `--js-library` mechanism; `USE_TS_RANDOM` CMake option). The follow-up change carries that design into code, the Docker rebuild, and browser verification.

- [ ] 5.1–5.3 → tracked in `openspec/changes/wire-random-to-wasm/tasks.md`.

## 6. End-to-end verification — DEFERRED with §5

Verification only makes sense once the bridge exists.

- [ ] 6.1–6.3 → tracked in `openspec/changes/wire-random-to-wasm/tasks.md`.

## 7. Reflect and wrap

- [x] 7.1 Time spent on this change (TS impl scope only, excluding bridge): approx. 1 working day across one session — well inside PLAN.md's "small handful of working days" bar. Substantial portions of the time were workflow scaffolding (openspec init, Vitest setup, pre-commit gate, Docker WASM build), not seam-specific work. Future seams will inherit those scaffolds and should be measurably faster.
- [x] 7.2 `design.md` updated post-hoc with the locked-in Option A decision, the `--js-library` mechanism, and the explicit C ↔ JS function-shape table — the next seam (and the follow-up bridge change) inherit a worked example.
- [x] 7.3 Re-ran `openspec validate port-random-to-typescript --strict`.
- [x] 7.4 PLAN.md updated with what we learned: faster than expected for the corpus + TS impl half, the bridge work split into its own change, and the patterns established (in-tree harnesses, characterization corpus location, Vitest as the runner).

## 8. Follow-up changes

- `wire-random-to-wasm` — implement §5/§6 against the design captured here.
- (Later) Delete `puzzles/random.c` once the bridge has been live and green for long enough to trust. Tracked as a TODO on the follow-up change.
