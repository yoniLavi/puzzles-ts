## Context

This is the pilot seam for the C → TypeScript port (PLAN.md "Seam order"). The decisions captured here will be reused (or explicitly revised) by every later seam. The single biggest unresolved design question — flagged in PLAN.md "Known unresolved questions" — is how an opaque C handle (`random_state *`) should cross the Embind boundary when TypeScript becomes the canonical owner.

Stakeholders: just the project; no external clients. Constraints: byte-for-byte fidelity against the C corpus; default build must keep using C (no behaviour change for un-flagged consumers).

## Goals / Non-Goals

**Goals**
- Pilot the characterize-seam-replace workflow on the smallest meaningful module.
- Establish the file layout, corpus convention, and test pattern that later seams will inherit.
- Pick an Embind handle-ownership pattern that scales — random_state is the easy case (40+20+1 bytes, no nested pointers); the next seams (tree234, dsf) will have richer state and need this to generalise.
- Wire up Vitest and a meaningful pre-commit gate as a first-citizen part of the workflow.

**Non-Goals**
- Replacing SHA-1 for non-random C callers (misc.c). Out of scope; bundled SHA-1 stays internal to random.ts.
- Removing `puzzles/random.c`. Removal happens in a follow-up after the bridge has been live and green for long enough to trust.
- A full benchmark soak (the "third layer" of testing in PLAN.md). The end-to-end manual verification in tasks.md §6 is the proof for this change; soak comes later as its own capability.

## Decisions

### Decision: Source layout for ported modules — `src/native/`

The TS replacements for C modules live under `src/native/`. Each module gets a directory (or file) named for its C counterpart: `src/native/random.ts`, later `src/native/tree234.ts`, etc. Test fixtures live alongside in `__fixtures__/`, replay tests in `*.test.ts`.

**Alternatives considered**: `src/puzzles-engine/` (collides visually with `puzzles/` subtree), `src/wasm-replacement/` (correct but ages awkwardly once the WASM phase ends), nesting under `src/puzzle/` (`worker.ts` is the consumer, but the directory would grow unwieldy).

**Why `native`**: short, neutral, accurate — these are TS replacements for what was native C. Locally reads as "native to TypeScript" and "the native (C) modules being ported". Either reading is fine.

### Decision: Test runner — Vitest

Vitest is the project's first test runner. Run via `npm run test:run` (one-shot, for hooks and CI) and `npm test` (watch, for development).

**Alternatives considered**: `node:test` (zero deps but weaker matcher library, no UI), defer (rejected — replay tests are the fidelity guarantee and need a runner from day one).

### Decision: Pre-commit gate

`.husky/pre-commit` runs, in order, blocking on any failure: `npx tsc -b --noEmit` → `npm run lint` → `npm run test:run`. Lint-staged is dropped from the hook in favour of whole-repo checks (the pattern at `/Users/yoni/codeliance/mathliance/.husky/pre-commit`).

**Why**: replay tests are cheap to run and the project benefits from a tight commit-time fidelity check. Whole-repo `tsc -b --noEmit` catches type regressions early; biome lint blocks before bad code lands. Lint-staged would only check staged files, which misses cross-file type errors.

**Risk**: hook latency. If tests grow slow we can split — keep `tsc` + `lint` in pre-commit, move tests to pre-push. Re-evaluate when a single `npm run test:run` exceeds a few seconds.

### Decision: SHA-1 stays internal to the random module (for now)

SHA-1 is implemented in `src/native/sha1.ts` but only consumed by `random.ts`. `puzzles/misc.c` also calls `SHA_*` — those callers stay on the C SHA. Extracting SHA-1 as its own seam (so misc.c can call into TS too) is a deliberate follow-up, not part of this change.

**Why**: keeps the random.c port a single self-contained piece. Pulling SHA out into its own seam would multiply the bridge surface and dilute the pilot's value as a workflow exercise.

### Decision: Embind handle-ownership — Option A (TS owns, C holds integer handle)

Three options were considered:

- **Option A — TS owns, C holds an integer handle.** TS keeps a `Map<number, RandomState>`; the C side gets back an opaque integer it passes to bridged `random_bits(handle, bits)` etc. Memory lifetime is explicit (`random_free` removes from the map).
- **Option B — C owns the bytes, TS reads/writes via Embind getters/setters.** TS state functions take the C pointer, decode the 61-byte state on each call. No handle table needed. Higher per-call cost.
- **Option C — Shared memory view.** TS gets a `Uint8Array` view directly into the WASM heap at the C-allocated address. Lowest overhead, but ownership semantics across `random_copy`/`random_free` become tricky and easy to get wrong.

**Decision: Option A**, applied to the upcoming `wire-random-to-wasm` change.

Reasons it wins:
- Simplest mental model and the closest match to what medmunds already does for `game_state` in `webapp.cpp` — we're staying on a paved path.
- The TS impl already maintains canonical state in idiomatic JS (Uint8Array fields). Options B and C would require either re-serialising on every call (B) or carefully aliasing WASM memory (C), neither of which buys us anything for a module this small.
- Generalises to the richer state of upcoming seams (tree234, dsf): the integer-handle protocol carries over unchanged; only the JS side's value type changes.

### Decision: Bridge mechanism — `--js-library`, not EM_JS or Embind

The web-app build already uses `em_link_js_library` for `emcclib.js` (drawing glue). We follow that pattern: a new `puzzles/random_bridge.js` (kept in the upstream subtree, but the only edit there) is linked into each puzzle's WASM. It calls into a `Module.tsRandomBridge` object that the worker installs at module pre-init time.

Bridge function shapes (per upstream's `puzzles.h` prototypes):

| C signature                                                        | JS implementation                                                         |
|--------------------------------------------------------------------|---------------------------------------------------------------------------|
| `random_state *random_new(const char *seed, int len)`              | `(seedPtr, len) => handleForState(randomNew(UTF8ToString(seedPtr, len)))` |
| `random_state *random_copy(random_state *st)`                      | `(handle) => handleForState(randomCopy(stateForHandle(handle)))`          |
| `unsigned long random_bits(random_state *st, int bits)`            | `(handle, bits) => randomBits(stateForHandle(handle), bits)`              |
| `unsigned long random_upto(random_state *st, unsigned long limit)` | `(handle, limit) => randomUpto(stateForHandle(handle), limit)`            |
| `void random_free(random_state *st)`                               | `(handle) => releaseHandle(handle)`                                       |
| `char *random_state_encode(random_state *st)`                      | `(handle) => mallocCString(randomStateEncode(stateForHandle(handle)))`    |
| `random_state *random_state_decode(const char *input)`             | `(inputPtr) => handleForState(randomStateDecode(UTF8ToString(inputPtr)))` |

The handle table is `Map<number, RandomState>` keyed by a monotonically increasing 32-bit int. `mallocCString` uses Emscripten's `_malloc` to allocate WASM heap memory the C caller will `sfree`/`free`.

### Decision: Build flag — `USE_TS_RANDOM`, default OFF

A single CMake option in `puzzles/CMakeLists.txt`. When ON:
- `random.c` is excluded from the `core_obj` source list.
- `em_link_js_library(<target> .../random_bridge.js)` is added to each WASM target.
- A compile-time define is passed to `webapp.cpp` if it needs to know (probably not; the C symbols look the same to the rest of the engine).

Default OFF preserves byte-for-byte parity with the pre-change build. The Docker `build-emcc.sh` script gains an env var that maps to the CMake option, so `USE_TS_RANDOM=1 ./Docker/build-emcc.sh` flips it.

A runtime toggle was considered and rejected: it would require both implementations to coexist in the same binary plus a function-pointer indirection. Build-time is simpler and matches how puzzles-web already does WASM configuration.

## Risks / Trade-offs

- **JS number precision for `random_bits(32)`.** JS bitwise ops are 32-bit signed. The C function returns `unsigned long`. Mitigation: use `>>> 0` for unsigned coercion; verify against the corpus that `bits == 32` calls round-trip correctly. Worst case, fall back to `bigint` for the accumulator inside `random_bits`.
- **Endianness in SHA-1 byte/word packing.** The C code is explicitly big-endian (`block[i*4+0] << 24` etc.). The TS port must match exactly. Mitigation: characterization tests catch any drift on the first replay.
- **Embind toolchain learning curve.** Medmunds' existing `webapp.cpp` is the worked example. If the binding shape gets gnarly, fall back to a `--js-library` shim (the same mechanism `emcclib.js` already uses for drawing) as plan B.
- **Pre-commit hook running tests on every commit may slow down rapid iteration.** Mitigation: split tests out to pre-push if `npm run test:run` exceeds a few seconds.

## Migration Plan

This is additive — `puzzles/random.c` is unchanged. The build flag default keeps C as the live implementation. Migration to TS-only is a separate follow-up change (after a stretch of green hybrid builds).

Rollback: flip the flag off, or revert this change. The C code is untouched so there's nothing to restore.

## Open Questions

- Will the Option-A handle table need to be per-worker (since the WASM runs in a Comlink Web Worker)? Probably yes — the worker is the only place that calls into WASM. Confirm during implementation.
- How to surface the build flag: Vite env var (`VITE_USE_TS_RANDOM`), Emscripten compile flag, or runtime toggle in dev tools? Runtime toggle is most flexible for end-to-end verification but adds code. Lean toward Vite env var for the initial implementation.
- Does the Embind binding need an async surface (since Comlink wraps the worker)? Probably not for `random_*` — the calls are synchronous on the worker thread; Comlink handles the await at the boundary.
