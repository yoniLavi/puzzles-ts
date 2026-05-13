## ADDED Requirements

### Requirement: TypeScript combi module reproduces C output byte-for-byte

The TypeScript implementation in `src/native/combi/index.ts` SHALL produce, for every `(r, n)` pair in the characterization corpus, the same lex-ordered enumeration of `r`-element subsets of `{0, 1, …, n-1}` that `puzzles/combi.c` produces — element-for-element identical.

The implementation SHALL expose, at minimum, the public surface used by the sole upstream consumer (`puzzles/lightup.c`): construction from `(r, n)`, advance-to-next, and read access to the current `r`-tuple. The C surface (`new_combi`, `reset_combi`, `next_combi`, `free_combi`) MAY be exposed under idiomatic TS names — concrete shape is captured in `design.md`.

The TS implementation SHALL preserve the C contract that calling `next_combi` past exhaustion returns the falsy sentinel (NULL in C; `null` or `false` in TS, whichever the API documents) and SHALL NOT throw.

The TS implementation SHALL enforce the C preconditions `r <= n` and `n >= 1` by throwing on construction.

#### Scenario: Corpus replay passes element-for-element

- **WHEN** the Vitest replay loads each fixture in `src/native/combi/__fixtures__/corpus.json` and walks the TS iterator until exhausted
- **THEN** the sequence of `r`-tuples produced by the TS impl deep-equals the recorded `enumeration` for that fixture
- **AND** the call that follows the final enumerated tuple returns the documented falsy sentinel

#### Scenario: reset rewinds the iterator

- **WHEN** a `Combi(r, n)` is enumerated to exhaustion, then reset, then enumerated again
- **THEN** the second enumeration produces the same sequence of `r`-tuples as the first

#### Scenario: degenerate r == 0 yields a single empty tuple

- **WHEN** the TS impl is constructed with `r = 0` and any `n >= 1`
- **THEN** the iterator produces exactly one `r`-tuple of length zero, then exhausts

#### Scenario: degenerate r == n yields a single full tuple

- **WHEN** the TS impl is constructed with `r == n`
- **THEN** the iterator produces exactly one `r`-tuple equal to `[0, 1, …, n-1]`, then exhausts

#### Scenario: precondition violations throw

- **WHEN** the TS impl is constructed with `r > n` or `n < 1`
- **THEN** construction throws

### Requirement: Characterization corpus is committed to the repository

The repository SHALL contain a JSON corpus under `src/native/combi/__fixtures__/` capturing input `(r, n)` pairs and their recorded enumerations from the native C implementation. The corpus SHALL cover the degenerate cases (`r == 0`, `r == n`), a small canonical case suitable for hand-inspection, at least one case large enough to exercise the multi-step `i--` rewind in `next_combi`, and at least one fixture that exercises `reset_combi`.

The harness that produces the corpus SHALL live at `puzzles/auxiliary/combi-trace.c` (sibling of `random-trace.c`) and SHALL be registered in `puzzles/auxiliary/CMakeLists.txt` so it builds via `./scripts/build-native.sh combi-trace`.

#### Scenario: Corpus covers the named edge cases

- **WHEN** the corpus is inspected
- **THEN** at least one fixture has `r == 0`
- **AND** at least one fixture has `r == n`
- **AND** at least one fixture has `r >= 2` and `n >= 8` (exercises the multi-step rewind)
- **AND** at least one fixture records a `reset` operation and asserts the post-reset sequence matches the pre-reset sequence

#### Scenario: Corpus regenerates byte-identically from the harness

- **WHEN** `./scripts/build-native.sh combi-trace` is run
- **AND** the resulting `build/native/auxiliary/combi-trace` is executed
- **THEN** its stdout matches the committed `src/native/combi/__fixtures__/corpus.json` byte-for-byte

### Requirement: Upstream combi-test.c is ported to Vitest

The repository SHALL contain a TypeScript translation of `puzzles/auxiliary/combi-test.c` that drives the TS impl over a handful of `(r, n)` cases and asserts the iteration matches an expected hand-spelled output. The C test's output format (`"combi R of N, T elements."` followed by one space-separated line per tuple) SHALL be reproduced so the test reads as a direct translation.

#### Scenario: Ported test covers a hand-spelled (3, 5) case

- **WHEN** the ported test runs `(r, n) = (3, 5)`
- **THEN** the produced output matches the hand-spelled expected output for that case
- **AND** Vitest reports the test passing under `npm run test:run`
