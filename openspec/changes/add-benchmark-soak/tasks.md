# Tasks

## 1. Engine-side surface

- [ ] 1.1 Add a `solveAndHashTrace(midend_handle): string` Embind binding in `puzzles/webapp.cpp`. Internal implementation walks the solver, accumulates move strings, returns `SHA-256(concat with newlines)`; returns `"unsolved"` for puzzles whose solver isn't reachable; returns `"timeout"` if the solver exceeds the timeout.
- [ ] 1.2 Add a per-call timeout (configurable; default 5s for smoke, 30s for full). Mechanism TBD — likely a step counter inside the solver loop checked against wall clock.
- [ ] 1.3 Confirm `new_game_id_from_random_seed` is already exposed via Embind (likely yes; verify and document).

## 2. Soak runner

- [ ] 2.1 Create `src/soak/` directory.
- [ ] 2.2 Implement `runSoak({ mode: 'pure' | 'hybrid', scope: 'smoke' | 'full' }): Promise<SoakResult[]>` in `src/soak/runner.ts`. Iterates the corpus, calls into the appropriate WASM build via Comlink, captures `{ gameId, postGenerateStateHash, solveTraceHash }` per triple.
- [ ] 2.3 Implement `compareSoakResults(a: SoakResult[], b: SoakResult[]): SoakDiff[]` — returns the per-row diffs (or empty for identity).
- [ ] 2.4 Implement `assertCorpusMatch(actual: SoakResult[], corpus: SoakCorpus): void` — throws with a readable diff if any row drifts.

## 3. Corpus

- [ ] 3.1 Define `src/soak/__fixtures__/corpus.json` schema: `{ version, smoke: SoakRow[], full: SoakRow[] }` where `SoakRow = { puzzle, preset, seed, gameId, postGenerateStateHash, solveTraceHash }`.
- [ ] 3.2 Hand-pick the smoke triple per `design.md` — 2 puzzles × 1 preset × 3 seeds (including the existing Solo `3x3#786954740169111` canary).
- [ ] 3.3 Generate the full corpus programmatically: enumerate every `gamelist[]` entry × every preset × 5 fixed seeds. Record against the pure-WASM build.
- [ ] 3.4 Add `npm run soak:rerecord` which regenerates the corpus and prints a unified diff against the previous version before overwriting. The diff is the review artifact for the PR.

## 4. Build-mode driver

- [ ] 4.1 Extend `scripts/build-emcc.sh` to accept an out-dir parameter (env var or flag), so the soak can target `/build/wasm-pure/` and `/build/wasm-hybrid/` without colliding with the default `/build/wasm/`.
- [ ] 4.2 Add `npm run soak:build-both` which builds both modes into separate directories (cached, incremental).
- [ ] 4.3 Add `npm run soak` (full) and `npm run soak:smoke` — these load each WASM mode in turn, run the runner, then call `compareSoakResults`.

## 5. Pre-commit and pre-push hooks

- [ ] 5.1 Update `.husky/pre-commit`: after `npm run test:run`, run `npm run soak:smoke`. Smoke step is non-blocking if `/build/wasm-pure/` or `/build/wasm-hybrid/` are missing (warns to stderr with the rebuild incantation).
- [ ] 5.2 Add `.husky/pre-push` running `npm run soak`. Hard fail on drift.
- [ ] 5.3 Document `--no-verify` as the conscious escape hatch for both hooks; not silently encouraged.
- [ ] 5.4 Measure smoke latency. If median exceeds 12s, emit a warning; at 20s, the hook hard-fails with a "scope down" message (the smoke is meant to be cheap).

## 6. Documentation

- [ ] 6.1 Update `AGENTS.md` "Test discipline" to note layer 3 is now built; cite this change.
- [ ] 6.2 Update the AGENTS.md "C is never deleted" deletion-trigger requirement to reference the soak's pass-count contract concretely (replacing "N TBD" with the chosen N).
- [ ] 6.3 Add a brief `src/soak/README.md` describing how to read a soak failure, when to re-record, and how to extend the corpus.

## 7. Tests for the soak itself

- [ ] 7.1 Vitest tests for `compareSoakResults` — synthetic identical/divergent inputs, asserting the diff is correctly computed.
- [ ] 7.2 Vitest tests for the timeout path of `solveAndHashTrace` — feed a known-hard seed, assert the trace records `"timeout"`.

## 8. OpenSpec hygiene

- [ ] 8.1 `openspec validate add-benchmark-soak --strict` passes.
- [ ] 8.2 Block this change's implementation on `add-use-ts-leaves-umbrella-flag` being implemented (or implement steps 1–3 against pure-WASM only, deferring the hybrid comparison until the umbrella lands).
