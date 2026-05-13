# Change: Add benchmark soak (test-discipline layer 3)

## Why

AGENTS.md "Test discipline" defines three layers; only the first two exist. Layer 3 — **benchmark soak**, end-to-end generate-and-solve across every puzzle, comparing pure-WASM vs hybrid TS+C — is the only gate that catches regressions which hide *between* seams. Every individual seam being green is no protection against, say, a `random_bits` consumer in `lightup.c` that drifts subtly when both `random` and a future `combi` bridge are live together. With seam #2 just landed and the AGENTS.md "C is never deleted" policy now committing us to a permanently-comparable hybrid build, the gap is no longer acceptable.

Two halves of this change:

1. **The soak itself**: a TS runner that drives the WASM build over a fixed `(puzzle, preset, seed)` corpus, capturing canonical outputs (game ID, generated state, solve trace), and a comparison driver that runs the corpus under both modes (pure-WASM and hybrid `USE_TS_LEAVES=ON`) and asserts identical outputs.
2. **Integration into the pre-commit gate**: a smoke subset of the soak runs as part of `.husky/pre-commit`, gated on WASM artifacts being present. The full soak runs in pre-push (or eventually CI). See `design.md` for the latency-vs-coverage trade-off — the user directive is "into the pre-commit," and the smoke-subset structure honours that within a realistic latency budget.

This change depends on `add-use-ts-leaves-umbrella-flag` (the soak needs one switch to flip between modes). If the umbrella isn't approved first, the comparison driver becomes much uglier — N per-module flag flips per run, with no single "give me the hybrid build" toggle.

## What Changes

- **New `src/soak/` module**: the TS runner. Entry points: `runSoak({ mode, corpus })`, `compareSoakResults(a, b)`. Canonical output per `(puzzle, preset, seed)` is `{ gameId, postGenerateState, solveTraceHash }` — concrete shape locked in `design.md`.
- **Soak corpus** at `src/soak/__fixtures__/corpus.json`: the static `(puzzle, preset, seed)` triples plus expected canonical outputs (recorded once against the pure-WASM build; the soak then asserts hybrid matches). Tiered into `smoke` (subset for pre-commit) and `full` (everything else).
- **Build-mode driver**: a small npm script (`npm run soak`) that builds WASM under both modes (cached aggressively — incremental rebuild is ~2s once both modes have been built once), runs the soak, diffs.
- **Pre-commit integration**: `.husky/pre-commit` gains a `soak:smoke` step after `test:run`. Skipped with a non-blocking warning if WASM artifacts for either mode are missing or stale (avoids forcing a cold rebuild on every commit). Full soak moves to a new pre-push hook (or equivalent).
- **Puzzle-side surface**: minor additions to `webapp.cpp` (or `puzzles/midend.c` if cleaner) to expose a `solveAndHashTrace(gameId)` Embind method — so the soak can capture a deterministic solve trace without per-puzzle hooks. Falls back to "is solvable?" boolean for puzzles whose solver isn't reachable from the engine API today.

**Out of scope**:

- CI hosting and integration (this fork hasn't settled CI yet — when it does, the soak runs there too).
- A web UI or dashboard for soak results. Stay terminal/JSON-only until the soak is settled.
- Performance benchmarking (timing, memory). The soak is a correctness gate; perf benchmarks come separately.

## Impact

- **Affected specs**: new `benchmark-soak` capability. No edits to `random` or other capabilities — the existing pre-commit requirement under `random` covers tsc/lint/tests; this change adds soak-smoke as a sibling step (documented inside the new capability).
- **Affected code**:
  - `src/soak/` (new directory with the runner, corpus, comparison).
  - `puzzles/webapp.cpp` (small Embind addition for deterministic solve traces).
  - `.husky/pre-commit` (gain soak-smoke step).
  - `.husky/pre-push` (new, or equivalent hook).
  - `package.json` (`npm run soak`, `npm run soak:smoke`).
  - `AGENTS.md` "Test discipline" — note that layer 3 is now built.
- **Affected workflows**:
  - Commits get marginally slower in the happy path (5–15s for the smoke subset, see `design.md` for budget rationale). Slower-but-skipped path when WASM is missing.
  - `git push` gets meaningfully slower (full soak, expected ≤ 2 minutes). Mitigation: `--no-verify` documented as the escape hatch for in-flight branches that consciously want to defer fidelity assertions.
- **Risk**: medium. Two real risks: (1) the canonical-output shape might miss the subtle drift it's meant to catch (mitigation: pick game IDs and state-hashes that surface RNG, solver, and serialization separately); (2) pre-commit latency could grow until developers reach for `--no-verify` reflexively (mitigation: explicit budget, see `design.md` "Risks"; revisit smoke scope if median commit-time exceeds the budget).
- **Dependency**: This change blocks on `add-use-ts-leaves-umbrella-flag` being implemented (it relies on `USE_TS_LEAVES` as the one switch the comparison driver flips). The proposal can be approved before the umbrella lands, but implementation cannot begin until the umbrella is wired.
