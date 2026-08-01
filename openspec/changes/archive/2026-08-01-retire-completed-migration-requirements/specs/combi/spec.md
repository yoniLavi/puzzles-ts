# combi Specification Delta — retire-completed-migration-requirements

## MODIFIED Requirements

### Requirement: Characterization corpus is committed to the repository

The repository SHALL contain a JSON corpus under `src/native/combi/__fixtures__/`
capturing input `(r, n)` pairs and their recorded enumerations from the native C
implementation. The corpus SHALL cover the degenerate cases (`r == 0`, `r == n`),
a small canonical case suitable for hand-inspection, at least one case large
enough to exercise the multi-step `i--` rewind in `next_combi`, and at least one
fixture that exercises `reset_combi`.

The committed corpus is now the **frozen oracle**: `retire-c-engine` deleted
`puzzles/combi.c`, the `combi-trace.c` harness that recorded it, the CMake entry
that built that harness, and `scripts/build-native.sh` which drove it. The corpus
therefore can no longer be regenerated and SHALL NOT be re-baselined. This is the
same position as the 48 per-game differentials, and it is deliberate: the fixture
is the record of what upstream produced, and a change to the TS module that
alters its enumeration is a behavioural change to be argued for, not a reason to
re-record.

The module the corpus guards is live — `src/native/combi/index.ts`, imported by
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
