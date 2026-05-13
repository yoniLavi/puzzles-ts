# Change: Port combi.c to TypeScript (second seam)

## Why

`combi.c` is the smallest meaningful next seam after `random.c`. It's the textbook lex-order r-of-n combination iterator — 73 lines, four functions, pure state machine, no allocation contract beyond `snew`/`sfree`, no string I/O. A single C consumer (`puzzles/lightup.c`) reads `combi->a[]` after each `next_combi`; nothing introspects `nleft`/`total`.

Beyond the unit itself, this change is the **second pass through the seam-replacement workflow** established by `port-random-to-typescript`. The scaffolding (Vitest, `src/native/<module>/` layout, `__fixtures__/corpus.json` convention, `puzzles/auxiliary/*-trace.c` harness pattern, `scripts/build-native.sh`, pre-commit gate) is already in place. If this seam is materially faster than `random.c` was — i.e. mostly *seam-specific* work with no fresh workflow overhead — that confirms the scaffolding is paying off and we can keep moving up the leaf-library list (dsf → tree234 → …) with confidence.

What this change covers:

- **Characterization harness** at `puzzles/auxiliary/combi-trace.c`, mirroring `random-trace.c`. Drives `new_combi` / `next_combi` over a curated `(r, n)` grid; emits JSON to stdout. Wired into `puzzles/auxiliary/CMakeLists.txt` and built via `scripts/build-native.sh combi-trace`.
- **Corpus** committed to `src/native/combi/__fixtures__/corpus.json`. Inputs + recorded enumerations.
- **TS impl** at `src/native/combi/index.ts` exposing the four-function surface (`newCombi`, `resetCombi`, `nextCombi`, `freeCombi`, or an idiomatic equivalent — decided in `design.md`).
- **Replay test** at `src/native/combi/combi.test.ts` that loads the corpus and asserts byte-for-byte equality.
- **Ported spec** at the same `combi.test.ts` (or a sibling file) translating `puzzles/auxiliary/combi-test.c` into Vitest: the C test becomes the spec.

**Out of scope** (deferred to a follow-up `wire-combi-to-wasm` change, mirroring the random precedent):

- Embind/`--js-library` bridge so `lightup.c` can call the TS impl from WASM. Single consumer makes the bridge straightforward but still its own deliberate cycle of work; see `design.md` for why splitting is the right call.
- Deletion of `puzzles/combi.c`. Removal happens after the bridge has been green long enough to trust.

## What Changes

- Add `puzzles/auxiliary/combi-trace.c` and register it in `puzzles/auxiliary/CMakeLists.txt`.
- Add `src/native/combi/index.ts`, `src/native/combi/__fixtures__/corpus.json`, `src/native/combi/combi.test.ts`.
- Add a new `combi` openspec capability covering the TS module's fidelity contract and the corpus.

## Impact

- **Affected specs**: `combi` (new capability).
- **Affected code**:
  - `puzzles/auxiliary/combi-trace.c` (new), `puzzles/auxiliary/CMakeLists.txt` (one line).
  - `src/native/combi/index.ts` (new), `src/native/combi/__fixtures__/corpus.json` (new generated artifact), `src/native/combi/combi.test.ts` (new).
  - `puzzles/combi.c` — **untouched** in this change. C and TS coexist; the bridge follow-up will wire WASM to TS.
- **Affected workflows**: none new. The Vitest replay just gains another file; the pre-commit gate runs as before. `scripts/build-native.sh` already accepts `combi-trace` as a target name without changes.
- **Risk**: low. The seam is small, the surface is integer-only (no string encoding, no copy semantics, no SHA-rollover edge cases), and the workflow is now well-trodden. The honest unknown is whether the seam-specific work really does dominate now that the scaffolding is amortised — a useful sizing data point for the next ten leaf libraries.
