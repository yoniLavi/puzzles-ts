# random Specification

## Purpose
The seeded random-number generator that game generation draws on, reproducing
upstream's `random.c` bit for bit so that a seeded game ID feeds the generator
the same random stream in every build, and the committed C-recorded corpus that
holds it to that.
## Requirements
### Requirement: TypeScript random module reproduces C output byte-for-byte

The TypeScript implementation in `src/engine/random/index.ts` SHALL produce byte-identical output to upstream's `random.c` for every call in the characterization corpus. Bit-identical reproducibility is a product requirement: existing game IDs and shared seeds must keep working.

The implementation SHALL expose, at minimum, the public surface used by upstream puzzles: `random_new(seed)`, `random_bits(state, bits)`, `random_upto(state, limit)`, `random_copy(state)`, `random_free(state)`, `random_state_encode(state)`, `random_state_decode(encoded)`.

The TS module SHALL bundle its own SHA-1 internally (currently at `src/engine/random/sha1.ts`).

The module lives under `src/engine/` because it is an engine library — 255 files import it. It was a top-level `src/native/random/` only because the retired bottom-up migration gave every ported seam its own folder next to the engine.

#### Scenario: Corpus replay passes byte-for-byte

- **WHEN** the Vitest replay loads each fixture in `src/engine/random/__fixtures__/` and replays the recorded call sequence against `src/engine/random/index.ts`
- **THEN** every returned value matches the C-recorded value byte-for-byte
- **AND** every `random_state_encode` output matches the C-recorded hex string character-for-character

#### Scenario: random_bits handles the SHA rollover

- **WHEN** the call sequence consumes more than 20 bytes of databuf so that `state.pos >= 20` triggers seedbuf increment and re-hash
- **THEN** the TS impl produces the same post-rollover bytes as the C impl

#### Scenario: random_bits returns 32-bit values without precision loss

- **WHEN** `random_bits(state, 32)` is called
- **THEN** the TS impl returns the same unsigned 32-bit value as the C impl, with no sign extension and no precision loss

#### Scenario: encode/decode round-trip preserves state

- **WHEN** a state is encoded with `random_state_encode` and decoded with `random_state_decode`
- **THEN** subsequent `random_bits` and `random_upto` calls on the decoded state produce the same outputs as on the original

### Requirement: Characterization corpus is committed to the repository

The repository SHALL contain a JSON corpus under `src/engine/random/__fixtures__/` capturing input seeds, call scripts, and recorded outputs from the native C implementation. The corpus SHALL cover varied bit counts (including 32), varied `random_upto` limits (including non-powers-of-two), the SHA-rollover path, `random_copy` independence, and `random_state_encode`/`decode` round-trips.

The corpus is a **frozen oracle** and SHALL NOT be re-baselined: the C build that recorded it is deleted. It is what keeps shared game IDs reproducible across builds, which was always its real job.

#### Scenario: Corpus covers the named edge cases

- **WHEN** the corpus is inspected
- **THEN** at least one fixture exercises `random_bits(state, 32)`
- **AND** at least one fixture exercises a `random_upto` with a non-power-of-two limit
- **AND** at least one fixture exercises enough calls to trigger the `state.pos >= 20` SHA rollover
- **AND** at least one fixture exercises `random_copy` and confirms the copy advances independently
- **AND** at least one fixture exercises `random_state_encode` followed by `random_state_decode`

