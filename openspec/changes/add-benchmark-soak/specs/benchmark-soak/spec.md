## ADDED Requirements

### Requirement: End-to-end benchmark soak compares pure-WASM and hybrid builds

The repository SHALL contain a TypeScript benchmark-soak runner under `src/soak/` that drives the WASM puzzles engine over a fixed corpus of `(puzzle, preset, seed)` triples and records canonical outputs per triple. The runner SHALL support both the pure-WASM build (no `USE_TS_LEAVES`) and the hybrid build (`USE_TS_LEAVES=ON`), and a comparison driver SHALL run the corpus under both modes and assert byte-identical canonical outputs.

Canonical output per triple SHALL consist of three SHA-256 hex digests:

- `gameId` — the game ID string the engine emits for that `(puzzle, preset, seed)`.
- `postGenerateStateHash` — SHA-256 of the engine's serialised game state immediately after generation.
- `solveTraceHash` — SHA-256 of the concatenated solver-move sequence (newline-separated). Falls back to `"unsolved"` when the puzzle's solver is unreachable from the engine API, and to `"timeout"` when the solver exceeds the configured per-call timeout.

The committed corpus at `src/soak/__fixtures__/corpus.json` SHALL be recorded against the pure-WASM build. The soak SHALL assert hybrid-build outputs equal the committed corpus row-for-row; pure-WASM-build outputs SHALL also equal the committed corpus (any drift indicates either an upstream-subtree change or a tooling regression, and triggers an explicit re-record review).

#### Scenario: Hybrid build matches the committed corpus

- **WHEN** the soak runs the smoke or full corpus under `USE_TS_LEAVES=ON`
- **THEN** every recorded `(gameId, postGenerateStateHash, solveTraceHash)` triple matches the committed corpus exactly
- **AND** the runner exits with status 0

#### Scenario: Hybrid drift fails loudly

- **WHEN** any row in the hybrid run produces a different canonical output than the corpus
- **THEN** the runner prints a unified diff identifying the divergent triple(s) and which of the three hashes drifted
- **AND** the runner exits non-zero

#### Scenario: Pure-WASM drift indicates upstream change or tooling regression

- **WHEN** the pure-WASM run differs from the committed corpus
- **THEN** the runner prints a diff that distinguishes "pure-WASM has drifted from the recorded corpus" from "hybrid has drifted from pure-WASM"
- **AND** the operator response is to either (a) investigate as a regression, or (b) re-record via `npm run soak:rerecord` and review the diff

### Requirement: Smoke subset runs in pre-commit; full soak runs in pre-push

The husky pre-commit hook (currently running `tsc -b --noEmit` → `npm run lint` → `npm run test:run`) SHALL gain a `npm run soak:smoke` step after `test:run`. The smoke subset SHALL be sized to complete within a strict latency budget (target ≤ 8 seconds; soft warning at 12 seconds; hard failure at 20 seconds) so it remains tolerable as a per-commit gate.

The smoke step SHALL skip non-blockingly when the required WASM build artifacts (`/build/wasm-pure/` and `/build/wasm-hybrid/`) are missing or stale, emitting a stderr warning that names the rebuild incantation. The smoke step SHALL NOT trigger an automatic WASM rebuild.

A new husky pre-push hook SHALL run `npm run soak` (the full corpus). Hard fail on drift; no skip path.

#### Scenario: Pre-commit smoke is green and fast

- **WHEN** a developer runs `git commit` with current WASM artifacts present for both modes
- **THEN** the pre-commit hook runs the existing tsc/lint/tests steps
- **AND** then runs the soak smoke subset
- **AND** the smoke subset completes within the soft latency budget (≤ 12 seconds)
- **AND** the commit proceeds

#### Scenario: Pre-commit smoke is skipped when WASM artifacts are stale or missing

- **WHEN** a developer runs `git commit` without having rebuilt WASM for both modes
- **THEN** the pre-commit hook runs the tsc/lint/tests steps
- **AND** emits a stderr warning identifying the missing artifact directory and the rebuild incantation
- **AND** the commit proceeds (smoke skipped, not failed)

#### Scenario: Pre-commit smoke fails on drift

- **WHEN** the smoke subset detects a divergence between hybrid and the corpus
- **THEN** the hook fails with the diff output
- **AND** the commit aborts

#### Scenario: Pre-push runs the full soak

- **WHEN** a developer runs `git push`
- **THEN** the pre-push hook runs `npm run soak`
- **AND** the full corpus runs against both modes
- **AND** drift fails the push; clean exit allows it

#### Scenario: --no-verify bypasses both hooks

- **WHEN** a developer passes `--no-verify` to commit or push
- **THEN** the soak hook is skipped without further interaction
- **AND** the documented contract is that this is a conscious choice for in-flight branches, not a default

### Requirement: Re-recording the corpus is explicit and reviewable

A developer-facing command SHALL exist (`npm run soak:rerecord`) that regenerates the soak corpus from a freshly-built pure-WASM artifact. The command SHALL print a unified diff between the prior corpus and the new corpus before overwriting the committed file. The diff is the review artifact that lands in the PR; merging it without explanation defeats the gate.

#### Scenario: Re-record prints a diff before overwriting

- **WHEN** a developer runs `npm run soak:rerecord`
- **THEN** the command builds the pure-WASM artifact if needed
- **AND** generates a new corpus
- **AND** prints a unified diff vs. the prior corpus
- **AND** then writes the new corpus to `src/soak/__fixtures__/corpus.json`

#### Scenario: Re-record with no diff is a no-op

- **WHEN** the freshly-generated corpus equals the committed corpus byte-for-byte
- **THEN** the command prints "no diff; corpus unchanged" and exits 0 without rewriting the file
