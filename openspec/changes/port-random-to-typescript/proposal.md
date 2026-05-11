# Change: Port random.c to TypeScript (pilot seam)

## Why

`random.c` is the natural first seam in the C → TS port (see PLAN.md "Seam order"). It's small (~350 lines including a self-contained SHA-1), it's pure (state machine; no I/O, no allocator coupling beyond `snew`/`sfree`), every puzzle uses it, and its byte-identical reproducibility is a **product** requirement — existing game IDs and shared seeds must keep working on the TS build. If we can't ship this one cleanly within a small handful of working days, the larger plan needs reconsidering before we commit to further seams.

Beyond the unit itself, this change is the **pilot for the seam-replacement workflow**: it establishes the characterization-test pattern, the corpus-storage convention, the Embind handle-ownership pattern for opaque C state, and the build-flag mechanism for toggling between C and TS implementations. Every subsequent seam will follow the patterns this change sets down.

- **Add Vitest** as the project's first test runner (Vite-native, jest-compatible API). Add `npm test` and `npm run test:run` (one-shot) scripts.
- **Characterization harness in `../puzzles/`** — a small C program that exercises the public random API (`random_new`, `random_bits`, `random_upto`, `random_copy`, `random_state_encode`, `random_state_decode`) over a curated set of seeds and call sequences, emitting a JSON corpus.
- **Corpus committed to this repo** under `src/native/random/__fixtures__/` (or equivalent). Inputs + expected outputs.
- **`src/native/random.ts`** — TypeScript implementation, including a self-contained SHA-1, that replays byte-identically against the corpus.
- **Vitest replay test** that loads the corpus and asserts byte-for-byte equality against the TS impl.
- **Embind bridge in `webapp.cpp`** (and supporting Emscripten glue) so the WASM build can route `random_*` calls to the TS impl instead of `puzzles/random.c`. A **build/runtime flag** toggles which implementation is live; default stays C until the bridge is confirmed green end-to-end.
- **End-to-end verification**: with the flag on, run a sampling of puzzles through the dev server and confirm no behavioral regression. Both pure-WASM (flag off) and hybrid (flag on) builds stay green.
- **Pre-commit hook upgrade** — replace `npx lint-staged` in `.husky/pre-commit` with a blocking sequence modelled on `/Users/yoni/codeliance/mathliance/.husky/pre-commit`: `tsc -b --noEmit` → `npm run lint` → `npm run test:run`. Lint-staged is dropped in favour of whole-repo checks (the mathliance pattern); biome runs in non-writing mode so failures block rather than silently auto-fixing. Knip is **not** introduced here (no dead-code rule in this repo yet); it can land in a follow-up if useful.

**Out of scope** (deferred to follow-ups):
- Displacing SHA-1 for **non-random** callers. `puzzles/misc.c` also uses `SHA_*`. The TS impl bundles its own SHA-1 internally; the C SHA-1 stays for misc.c and any other consumers until a separate seam picks it up.
- Deleting `puzzles/random.c`. Removal happens in a follow-up after the bridge has been live and green for a stretch.

## Impact

- **Affected specs**: `random` (new capability).
- **Affected code**:
  - `src/native/random.ts` (new), `src/native/random/__fixtures__/` (new corpus), `src/native/random/random.test.ts` (new).
  - `webapp.cpp` (Embind bindings), Emscripten build config (build flag), Vite/test config (Vitest setup).
  - `puzzles/random.c` — **untouched** in this change. C and TS coexist behind the flag.
- **Affected workflows**: introduces `npm test` (Vitest) and rewrites `.husky/pre-commit` to enforce tsc + lint + tests before every commit (modelled on `/Users/yoni/codeliance/mathliance/.husky/pre-commit`). `lint-staged` removed from the hook path.
- **Risk**: the Embind handle-ownership pattern (opaque C struct ↔ TS object) is the first time we cross that bridge. PLAN.md flags it as an unresolved question. Mitigated by keeping the C impl in place behind a flag until the TS path is proven.
