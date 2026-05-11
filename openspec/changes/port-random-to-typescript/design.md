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

### Decision (deferred): Embind handle-ownership for random_state

Three options on the table. We'll spike the simplest first; if it works for random_state it likely works for later seams too.

- **Option A — TS owns, C holds an integer handle.** TS keeps a `Map<number, RandomState>`; the C side gets back an opaque integer it passes to bridged `random_bits(handle, bits)` etc. Simplest mental model; matches what medmunds already does for `game_state` in `webapp.cpp`. Memory lifetime is explicit (`random_free` removes from the map).
- **Option B — C owns the bytes, TS reads/writes via Embind getters/setters.** TS state functions take the C pointer, decode the 61-byte state on each call. No handle table needed. Higher per-call cost.
- **Option C — Shared memory view.** TS gets a `Uint8Array` view directly into the WASM heap at the C-allocated address. Lowest overhead, but ownership semantics across `random_copy`/`random_free` become tricky and easy to get wrong.

**Default choice for the spike**: Option A. It's the pattern most likely to generalise to the richer state of tree234/dsf. Re-evaluate after implementation; if A turns out clunky for a future seam, the cost of revisiting is bounded to this one module.

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
