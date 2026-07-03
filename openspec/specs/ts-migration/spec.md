# ts-migration Specification

## Purpose
The authoritative doctrine for replacing the C/WASM puzzle engine with
native TypeScript: top-down and product-value-first ordering, C as a
readable reference and dev-time differential check (not a byte-oracle),
the per-game hybrid with per-game C deletion, a clean TS save format,
and the explicit stance that deliberate divergence from upstream is the
goal. `AGENTS.md` is the readable summary; this spec is the contract.
## Requirements
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
other games.

A game SHALL be registered as TS-served (and its `TS_PORTED` catalog
marker set) ONLY once its TS port has been verified at **full
behavioural parity** with the C build — including rendering,
animation, and input, not merely internal state transitions. Parity
verification SHALL include owner acceptance testing; a green automated
suite is necessary but NOT sufficient (a suite asserting only state
transitions can be fully green while the game does not render). Until a
game is verified at parity it SHALL remain unregistered and run on
C/WASM (the empty-registry path is the fallback mechanism — no new
switch is required).

A game's C source SHALL be deleted only AFTER it has been registered
under the parity rule above — C deletion is per game and follows
parity verification, NOT merely "the port compiles and tests pass".
The C/WASM path SHALL remain the runtime for every not-yet-parity
game until then. The collection is fully migrated when the last game
is ported; only then does `puzzles/` go away entirely.

A shortfall in a ported game's parity (rendering, animation, input,
or behaviour) SHALL NOT be characterised as "cosmetic", "out of
scope", or otherwise deferred without explicit owner approval; it is a
parity regression that blocks registration.

#### Scenario: Unported games keep working during the migration

- **WHEN** some games have TS ports and others do not
- **THEN** ported games run their TS implementation
- **AND** unported games run their C/WASM implementation
- **AND** the app presents both uniformly to the user

#### Scenario: A port that is not yet at parity stays on C

- **WHEN** a game's TS port passes the automated suite but has not
  been owner-verified at full behavioural parity (e.g. rendering or
  animation is incomplete)
- **THEN** it is NOT registered and NOT marked `TS_PORTED`
- **AND** the game continues to run on C/WASM
- **AND** its C source is NOT deleted

#### Scenario: C for a game is removed only after parity registration

- **WHEN** a game's TS port has been verified at parity and registered
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

### Requirement: Narratable-deduction generation policy

Every board a **logic** game generates for a non-`Unreasonable` tier SHALL be
solvable by the *same* narratable techniques that game's explained hint teaches.
The deductive solver and the hint SHALL be two projections of one deduction
engine: the generator runs the technique rungs to a fixpoint with the recorder
off (accepting a board only when the rungs fully solve it — deductive completion
implies uniqueness, so no separate uniqueness pass is required, and the highest
rung used is the difficulty grade), and the hint runs the same rungs with the
recorder on. A hint SHALL NOT fall back to a generic, unexplained step for a
deduction its techniques do not cover (the `ts-engine` Hint-System companion
rule).

A game SHALL meet this by either **narrating every deduction it accepts**
(promoting any catch-all into an honest technique) or **rejecting at generation**
the boards whose solution needs an un-narratable deduction. The choice is
per-game, made against a measured cost:

- A generation gate that rejects boards SHALL be adopted only after measuring
  that its rejection rate does not make a size or difficulty tier unfillable or
  materially slow "New Game."
- Redefining "solvable" as "narratably-solvable" MAY shift a difficulty tier's
  character; a game's tiers SHALL be re-graded after such a flip.

The one sanctioned exception is an explicitly-named `Unreasonable` tier, which MAY
require guess-and-backtrack, MAY keep a minimized backtracking oracle for
uniqueness, and whose hint MAY be non-deductive on those boards. Movement /
objective games (no deductive "why") are out of scope: their hints are heuristic
or `aux`-walks and there is no solver to unify.

Adopting a generation gate MAY change which boards a game generates; where a game
has a byte-match differential against the C reference, that differential MAY be
retired as a consequence (boards are expendable post-pivot; C is a reference, not
a byte-oracle).

#### Scenario: A generated board is solvable by the taught techniques

- **WHEN** a non-`Unreasonable` board is generated for a logic game that has
  adopted the policy
- **THEN** the game's narratable techniques solve it to completion with no
  guessing and no un-narrated fallback deduction

#### Scenario: A costly rejection gate is measured before adoption

- **WHEN** a game would adopt a generation gate that rejects non-narratable boards
- **THEN** its rejection rate and difficulty-tier grades are measured first
- **AND** if rejection would thin a size/tier or materially slow generation, the
  game narrates the deduction honestly instead of rejecting

#### Scenario: Unreasonable is exempt

- **WHEN** a game ships an explicitly-named `Unreasonable` tier
- **THEN** that tier MAY require guessing and its hint MAY be non-deductive there,
  without violating this policy

