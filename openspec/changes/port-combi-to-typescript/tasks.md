# Tasks

## 1. Characterization harness in `puzzles/auxiliary/`

- [ ] 1.1 Read `puzzles/combi.c` end-to-end and confirm the design.md's curated `(r, n)` grid covers the interesting branches (`r == 0`, `r == n`, the `i--` rewind walk, the `for (j = i+1...)` fixup, the exhausted-iterator path).
- [ ] 1.2 Write `puzzles/auxiliary/combi-trace.c` mirroring `puzzles/auxiliary/random-trace.c`'s structure (JSON-on-stdout, fixture table). Each fixture emits `{name, r, n, enumeration: [[...], ...]}`. Reuse `emit_json_string` only if needed; combi has no string outputs.
- [ ] 1.3 Add `cliprogram(combi-trace combi-trace.c)` to `puzzles/auxiliary/CMakeLists.txt`.
- [ ] 1.4 Build via `./scripts/build-native.sh combi-trace`; capture output into `src/native/combi/__fixtures__/corpus.json`.
- [ ] 1.5 Sanity-check the corpus by hand: lex order, expected tuple counts (`(r, n)` → `C(n, r)`), no duplicates.

## 2. TypeScript implementation

- [ ] 2.1 Create `src/native/combi/` directory (alongside `src/native/random/`).
- [ ] 2.2 Implement `src/native/combi/index.ts` as a `Combi` class per the API locked in `design.md`: `next(): boolean`, `reset(): void`, readable `r`/`n`/`total`/`nleft`/`a: readonly number[]`.
- [ ] 2.3 Mirror the C increment loop in `next_combi` exactly (the `while (a[i] == n - r + i) i--;` walk, then increment, then the fixup `for`).
- [ ] 2.4 Add `[Symbol.iterator]()` (yields the `r`-tuple on each step) as TS-native sugar. Not exercised by the corpus replay.
- [ ] 2.5 Match the C `assert(r <= n)` and `assert(n >= 1)` preconditions with TS throws.

## 3. Spec test ported from `puzzles/auxiliary/combi-test.c`

- [ ] 3.1 Translate the C test to TS at `src/native/combi/combi.test.ts` (or a sibling). For a handful of `(r, n)` cases, drive the iterator and accumulate the same lines `combi-test.c` would print (`"combi R of N, T elements."` followed by space-separated tuples). Assert against an inline expected string.
- [ ] 3.2 At least one case is `(r, n) = (3, 5)` — small enough to spell out the expected 10 tuples by hand.

## 4. Corpus replay test

- [ ] 4.1 In `src/native/combi/combi.test.ts`, load `__fixtures__/corpus.json` and replay each fixture against the TS impl. For each fixture, walk `next()` while it returns truthy; on each step, deep-equal the `r`-tuple against `enumeration[i]`. Then assert `next()` returns the falsy sentinel and the enumeration is fully consumed.
- [ ] 4.2 Add a fixture (in §1's harness) that exercises `reset_combi`: enumerate fully, reset, enumerate again, assert the second pass equals the first.
- [ ] 4.3 `npm run test:run` is green — both the spec test (§3) and the corpus replay (§4) pass.

## 5. OpenSpec hygiene

- [ ] 5.1 `openspec validate port-combi-to-typescript --strict` passes.
- [ ] 5.2 After the seam lands and the tests are green, record the seam-specific elapsed time (excluding scaffolding) in a closing note here, for sizing comparison against `port-random-to-typescript`.

## 6. Follow-up changes (not in this proposal)

- `wire-combi-to-wasm` — implement the `--js-library` bridge so `lightup.c`'s C calls route to the TS impl, gated by `USE_TS_COMBI`. Mirrors `wire-random-to-wasm`.
- (Later) Delete `puzzles/combi.c` once the bridge has been live and green for long enough to trust.
