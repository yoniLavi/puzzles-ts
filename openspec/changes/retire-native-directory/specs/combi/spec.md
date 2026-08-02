# combi Specification Delta — retire-native-directory

## MODIFIED Requirements

### Requirement: TypeScript combi module reproduces C output byte-for-byte

The TypeScript implementation in `src/engine/combi/index.ts` SHALL produce, for every `(r, n)` pair in the characterization corpus, the same lex-ordered enumeration of `r`-element subsets of `{0, 1, …, n-1}` that upstream's `combi.c` produces — element-for-element identical.

The implementation SHALL expose, at minimum, the public surface used by the sole consumer (Light Up's solver): construction from `(r, n)`, advance-to-next, and read access to the current `r`-tuple. The C surface (`new_combi`, `reset_combi`, `next_combi`, `free_combi`) MAY be exposed under idiomatic TS names.

The TS implementation SHALL preserve the C contract that advancing past exhaustion returns the falsy sentinel (NULL in C; `null` or `false` in TS, whichever the API documents) and SHALL NOT throw.

The TS implementation SHALL enforce the C preconditions `r <= n` and `n >= 1` by throwing on construction.

The module lives under `src/engine/` because it is an engine library. It was a top-level `src/native/combi/` only because the retired bottom-up migration gave every ported seam its own folder next to the engine — a whole top-level directory, with its own openspec capability, for an 81-line class with one call site.

#### Scenario: Corpus replay passes element-for-element

- **WHEN** the Vitest replay loads each fixture in `src/engine/combi/__fixtures__/corpus.json` and walks the TS iterator until exhausted
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

The repository SHALL contain a JSON corpus under `src/engine/combi/__fixtures__/`
capturing input `(r, n)` pairs and their recorded enumerations from the native C
implementation. The corpus SHALL cover the degenerate cases (`r == 0`, `r == n`),
a small canonical case suitable for hand-inspection, at least one case large
enough to exercise the multi-step `i--` rewind in `next_combi`, and at least one
fixture that exercises `reset_combi`.

The committed corpus is the **frozen oracle**: `retire-c-engine` deleted
`puzzles/combi.c`, the `combi-trace.c` harness that recorded it, the CMake entry
that built that harness, and `scripts/build-native.sh` which drove it. The corpus
therefore can no longer be regenerated and SHALL NOT be re-baselined. This is the
same position as the 48 per-game differentials, and it is deliberate: the fixture
is the record of what upstream produced, and a change to the TS module that
alters its enumeration is a behavioural change to be argued for, not a reason to
re-record.

The module the corpus guards is live — `src/engine/combi/index.ts`, imported by
Light Up's solver — so this requirement continues to do real work.

#### Scenario: Corpus covers the named edge cases

- **WHEN** the corpus is inspected
- **THEN** at least one fixture has `r == 0`
- **AND** at least one fixture has `r == n`
- **AND** at least one fixture has `r >= 2` and `n >= 8` (exercises the multi-step rewind)
- **AND** at least one fixture records a `reset` operation and asserts the post-reset sequence matches the pre-reset sequence

#### Scenario: The corpus is frozen, not regenerable

- **WHEN** a change alters the TS module's enumeration for a corpus fixture
- **THEN** the replay test fails
- **AND** the resolution is to justify the behavioural change, never to
  re-record the fixture — there is no harness left to record it with
