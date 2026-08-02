# repo-layout Specification Delta — retire-c-era-leftovers

## MODIFIED Requirements

### Requirement: A shared helper carries the byte-for-byte differential shape

The engine testing utilities SHALL provide `describeDescDifferential` in
`src/engine/testing/differential.ts`: given a fixture list, a `params`
mapper, and a game's `newDesc`, it asserts for each fixture that
`newDesc(params(fixture), randomNew(fixture.seed)).desc` equals the fixture's
recorded C desc (the strongest differential bar — valid only for a faithful
generator over the bit-identical RNG), with an optional `extra` callback for a
follow-on assertion. Games whose gated differential is the byte-for-byte desc shape
SHALL use this helper instead of re-implementing the loop. The solver-agreement
differential shape (decode a C board, run the TS solver, assert the recorded
difficulty) is game-specific and is NOT modelled by this helper.

The C-reference fixtures are **frozen and cannot be regenerated**: the sources,
the per-game `*-trace` harnesses and the Emscripten/CMake build that ran them all
went with `retire-c-engine`. That fact SHALL be stated once, in the shared helper,
rather than repeated per game — and a differential test file SHALL NOT carry a
regeneration recipe, because no such recipe can be executed.

#### Scenario: A game's byte-match differential uses the helper

- **WHEN** a game's gated differential asserts its `newDesc` reproduces the C desc
  byte-for-byte across a fixture set
- **THEN** it calls `describeDescDifferential` with its fixtures, params mapper, and
  `newDesc`, rather than re-declaring the `describe`/`for`/`it`/`expect` loop

#### Scenario: A fixture's provenance is recorded but its recipe is not

- **WHEN** a differential test file documents where its fixture came from
- **THEN** it names the harness that captured it, as history
- **AND** it does NOT carry the commands, because none of them can be run

## ADDED Requirements

### Requirement: A comment stating a procedure is executable, or is marked as history

A comment that tells a reader **to do something** SHALL be executable as written,
or SHALL say plainly that it is a record of something that can no longer be done.
A comment that merely records **where something came from**, or **why something is
absent**, is not a procedure and is kept as-is.

The distinction is the actionable one, and applying "delete every mention of the
retired C engine" instead would lose real information in both directions:

- **Provenance is kept.** `random/index.ts`'s *"TypeScript port of
  `puzzles/random.c`"*, `sha1.ts`'s byte-equivalence claim, and `drawing.ts`'s
  *"copied from upstream's emcclib.js"* name the upstream source a behaviour was
  derived from. Upstream still exists, the derivation is still true, and in the
  last case the comment is the only account of an otherwise arbitrary pixel rule.
  With no C build left to interrogate, a comment recording where a behaviour came
  from is the **only** remaining answer.
- **Absence guards are kept.** The notes recording that `wasmIntegration()` was
  removed from Sentry, that the About dialog's `dependencies.json` fetch is gone,
  and that the Brewfile no longer provisions a wasm toolchain exist to stop the
  machinery being re-added. `retire-c-engine`'s own review recorded that *deleting
  the mechanism is the easy half; the guards are what convey the false picture.*
- **Dead instructions go.** A command block naming a binary, a source tree, a
  build flag or an output directory that no longer exists.
- **False present-tense statements go.** "Production is the unchanged all-WASM
  path"; "Public API to the remote WASM puzzle module".

A partially-repointed procedure SHALL NOT be produced. Where several lines of a
procedure are dead, correcting only the one a path sweep can see is **worse than
leaving it visibly stale**, because it produces something that looks maintained
and fails on its first line.

A file marked "generated — do not edit by hand" SHALL name a generator that
exists. Where the generator has been removed, the file becomes ordinary committed
source and its header SHALL say so, since the alternative leaves a contributor no
legal way to change it at all.

#### Scenario: A change removes the machinery a comment describes

- **WHEN** a toolchain, build or harness is deleted
- **THEN** every comment instructing a reader to invoke it is rewritten as
  history or removed
- **AND** comments recording provenance, or explaining why the machinery is
  absent, are kept

#### Scenario: A dead recipe is repointed rather than retired

- **WHEN** a path sweep would update one path inside a procedure whose other
  steps are also dead
- **THEN** the whole procedure is retired instead
- **BECAUSE** thirty-seven differential headers named an output under
  `src/native/games/`, which a later change moved; rewriting just that segment
  would have left a `cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0` recipe
  looking maintained, against a source tree, a build system and a flag that no
  longer exist

#### Scenario: A generated file outlives its generator

- **WHEN** a file's generator is deleted
- **THEN** the file's header stops claiming it is generated and stops forbidding
  hand edits
- **AND** any invariant the generator used to assert on its output is confirmed
  to be asserted somewhere that still runs
- **BECAUSE** `spectre-tables.ts` read "GENERATED FILE — do not edit by hand"
  over a three-line recipe of which every line was dead, including a
  `scripts/gen-spectre-tables.mjs` that no longer exists — a file nothing could
  regenerate and nobody was permitted to edit. Its three structural invariants
  turned out to be asserted directly by `spectre.test.ts`, so a hand edit that
  breaks one still fails the suite; had they not been, that would have been the
  real finding.

#### Scenario: A comment-only sweep is verified by count, not by green

- **WHEN** a change edits comments across many test files
- **THEN** the test and assertion counts are compared before and after, not
  merely observed to be green
- **BECAUSE** a comment edit that swallowed a `describe` leaves a passing suite
  with fewer tests in it — the same silent-shrink shape the probe's
  discovered-test-file floor guards against
