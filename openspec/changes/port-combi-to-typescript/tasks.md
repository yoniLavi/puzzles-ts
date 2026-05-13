# Tasks

## 1. Characterization harness in `puzzles/auxiliary/`

- [x] 1.1 Read `puzzles/combi.c` end-to-end and confirm the design.md's curated `(r, n)` grid covers the interesting branches (`r == 0`, `r == n`, the `i--` rewind walk, the `for (j = i+1...)` fixup, the exhausted-iterator path).
- [x] 1.2 Wrote `puzzles/auxiliary/combi-trace.c` mirroring `puzzles/auxiliary/random-trace.c`'s structure. No JSON-string escaper needed — fixture names are ASCII identifiers and combi outputs are integers.
- [x] 1.3 Added `cliprogram(combi-trace combi-trace.c)` to `puzzles/auxiliary/CMakeLists.txt` (alphabetically slotted after `combi-test`).
- [x] 1.4 Built via `./scripts/build-native.sh combi-trace`; captured output into `src/native/combi/__fixtures__/corpus.json`. 158 tuples across 8 fixtures.
- [x] 1.5 Verified tuple counts per fixture match `C(n, r)` exactly: 1, 1, 10, 10, 1, 45, 70, 10. Hand-inspected the lex order of `small_2_of_5` and `hand_inspect_3_of_5`.

## 2. TypeScript implementation

- [x] 2.1 Created `src/native/combi/` directory.
- [x] 2.2 Implemented `src/native/combi/index.ts` as a `Combi` class per the API locked in `design.md`: `next(): boolean`, `reset(): void`, readable `r`/`n`/`total`/`nleft`/`a: readonly number[]`.
- [x] 2.3 Mirrored the C increment loop in `next_combi` exactly — the `while (a[i] == n - r + i) i--;` walk, the `a[i] += 1`, and the `for (j = i+1 ...)` fixup. The C `goto done` first-call branch is expressed as an explicit `if (nleft === total)` guard.
- [x] 2.4 Added `[Symbol.iterator]()` yielding snapshot copies of `a` on each step.
- [x] 2.5 Constructor throws `RangeError` on `n < 1`, `r < 0`, or `r > n`.

## 3. Spec test ported from `puzzles/auxiliary/combi-test.c`

- [x] 3.1 Translated the C test in `src/native/combi/combi.test.ts` — same `"combi R of N, T elements."` header and trailing-space-per-element line shape. Drives the iterator (rather than `next()` + `a`) to exercise the TS-native ergonomics path.
- [x] 3.2 Hand-spelled expected output for both `(3, 5)` and `(2, 5)`.

## 4. Corpus replay test

- [x] 4.1 `src/native/combi/combi.test.ts` loads `__fixtures__/corpus.json` and replays each fixture against the TS impl via `next()` + `[...c.a]`, deep-equaling each tuple and asserting `next()` returns `false` after the final element.
- [x] 4.2 Added `reset_3_of_5` fixture: harness records both passes (`enumeration` and `enumeration_after_reset`); replay walks both via `c.reset()` and also asserts the two recorded passes are identical.
- [x] 4.3 `npm run test:run` is green — 24 tests across the corpus replay (8), spec port (2), and surface checks (8) (and 6 pre-existing random tests, all green).

## 5. OpenSpec hygiene

- [x] 5.1 `openspec validate port-combi-to-typescript --strict` passes.
- [x] 5.2 **Seam-specific elapsed time (excluding scaffolding):** ~25 minutes of focused work across this session — harness write + cmake one-liner + corpus capture + TS impl + test file + a single type-annotation fix. The `port-random-to-typescript` change took ~1 working day; the delta is dominated by the scaffolding (Vitest setup, Docker WASM build, pre-commit hook, fixture-storage convention, in-tree harness pattern) that combi inherits free. Confirms the AGENTS.md hypothesis that seam-specific work would dominate from seam #2 onward; sets a useful baseline for sizing `dsf.c`, `tree234.c`, and the rest of the leaf-library queue.

## 6. Follow-up changes (not in this proposal)

- `wire-combi-to-wasm` — implement the `--js-library` bridge so `lightup.c`'s C calls route to the TS impl, gated by `USE_TS_COMBI`. Mirrors `wire-random-to-wasm`.
- (Later) Delete `puzzles/combi.c` once the bridge has been live and green for long enough to trust.
