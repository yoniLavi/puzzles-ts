# ts-migration spec delta

## ADDED Requirements

### Requirement: Migration proceeds top-down, product-value first

The TypeScript migration SHALL proceed top-down: the TS midend and a
clean `Game` interface SHALL be built before any game is ported, and
games SHALL then be ported by user-facing priority (simplest first to
establish the pattern, then the games the owner wants to enhance, then
outward to the rest). Leaf libraries (dsf, tree234, sort, findloop,
etc.) SHALL be ported lazily and idiomatically as ordinary TS
dependencies *when a game being ported needs them* — NOT as
standalone bridged seams with characterization corpora.

The migration SHALL NOT be ordered bottom-up by library-dependency
depth. Delivering user-visible capability early takes precedence over
maximising how much downstream code each port unblocks.

#### Scenario: A game port pulls in only the leaf libs it needs

- **WHEN** a game is ported to TS and depends on a union-find / dsf
  helper
- **THEN** an idiomatic TS equivalent is written as a normal module
  dependency
- **AND** no characterization corpus is recorded for that helper
- **AND** unported games continue using the C implementation via the
  WASM build

#### Scenario: Midend precedes game ports

- **WHEN** the migration begins after this doctrine lands
- **THEN** the first implementation change is the TS midend + `Game`
  interface (`ts-midend-and-game-interface`)
- **AND** no per-game port is attempted before that interface exists

### Requirement: C is a reference and dev-time check, not a byte-oracle

The C source under `puzzles/` SHALL be treated as a readable
reference implementation and a dev-time differential-check source —
NOT as an immutable byte-for-byte fidelity oracle. A TS port is
"done" when the game plays correctly and passes ordinary behavioural
tests, NOT when it reproduces a recorded golden corpus byte-for-byte.

A dev-time differential harness SHOULD be available to generate N
boards from both the C build and the TS port for the same seed and
surface diffs for human review. This is an advisory development aid,
not a gating corpus. Per-game tightening (a stricter check for a game
with hard uniqueness or difficulty-grading constraints) is permitted
but is NOT the default.

The no-upstream-merge stance is retained: `puzzles/` is still a
frozen subtree this project does not track upstream. C is still not
casually edited — but because it is a *reference*, not because byte
parity is a release gate.

#### Scenario: A ported game is accepted without a golden corpus

- **WHEN** a game has been ported to TS and plays correctly under
  manual and automated behavioural tests
- **THEN** it is accepted as done
- **AND** no byte-identical characterization corpus is required for
  acceptance
- **AND** the dev-time differential harness output, if consulted, is
  used as review signal rather than a pass/fail gate

#### Scenario: Deliberate divergence from upstream is allowed

- **WHEN** a feature is added that upstream does not have (quick-save,
  mistake-check, explained hint, a per-game gameplay aid such as
  Galaxies cell↔dot marking)
- **THEN** the divergence is expected and acceptable
- **AND** it is NOT treated as a fidelity regression

### Requirement: Per-game hybrid; C deleted per game

The build SHALL support a per-game hybrid: each game is served either
by its C/WASM implementation or by its TS port, independently of
other games. A game's C source SHALL be deleted once its TS port has
landed and shipped — C deletion is per game, NOT deferred until the
entire collection is ported.

The C/WASM path SHALL remain the runtime for every not-yet-ported
game until that game's TS port lands. The collection is fully migrated
when the last game is ported; only then does `puzzles/` go away
entirely.

#### Scenario: Unported games keep working during the migration

- **WHEN** some games have TS ports and others do not
- **THEN** ported games run their TS implementation
- **AND** unported games run their C/WASM implementation
- **AND** the app presents both uniformly to the user

#### Scenario: C for a game is removed when its port ships

- **WHEN** a game's TS port has landed and shipped
- **THEN** that game's C source is deleted from `puzzles/`
- **AND** the deletion does not wait for other games to be ported

### Requirement: Clean TS save format; future game IDs stay stable

The project SHALL use a clean TypeScript-native save format. Backward
compatibility with the C-serialisation save format and with
historical (pre-pivot) shared game IDs is explicitly NOT required —
those are accepted as expendable.

Going forward, game IDs SHALL remain stable and shareable: the
already-ported bit-identical `random.ts` is retained so that seeds
produce reproducible boards across builds from the pivot onward.

#### Scenario: Old C-format save is not required to load

- **WHEN** a save produced by the pre-pivot C-serialisation path is
  presented to the TS engine
- **THEN** the engine is NOT required to load it
- **AND** this is not treated as a defect

#### Scenario: A shared game ID reproduces its board post-pivot

- **WHEN** a game ID generated by the TS engine is entered on another
  TS-engine build
- **THEN** the same board is produced (random.ts is bit-identical and
  retained)
