# build-pipeline spec delta

## MODIFIED Requirements

### Requirement: USE_TS_LEAVES umbrella flag activates every leaf-library TS bridge

The build SHALL support a `USE_TS_LEAVES` CMake option (default ON)
that, when set to ON, activates every per-module `USE_TS_<MODULE>` flag
for any leaf-library bridge that exists. The umbrella is the primary
operator-facing toggle and the default operational mode; per-module
flags remain as debugging overrides. Pure C remains available as the
escape hatch via explicit `USE_TS_LEAVES=OFF`.

This requirement governs the umbrella *mechanics* only. The migration
*strategy* — what gets ported, in what order, and against what
acceptance bar — is owned by the `ts-migration` capability. Under that
capability the migration is **per-game**, not per-leaf-library: the
leaf-library umbrella is retained as working machinery (it correctly
toggles the `random` bridge and the fail-closed coherence check), but
it is no longer the description of how the project migrates. Future
ports do NOT have to add a per-leaf bridge or document a byte-identical
fidelity corpus; acceptance is governed by `ts-migration` (game plays
correctly + dev-time differential spot-check).

Per-module flag precedence: when both `USE_TS_LEAVES` and an individual
`USE_TS_<MODULE>` are specified on the cmake command line, the
per-module value wins for that module. Cached-value interaction
(`cmake --fresh` semantics) is documented in the umbrella's archived
`design.md`.

The host-native wasm build script (`scripts/build-emcc.sh`, exposed as
`npm run build:wasm`) SHALL honour a `USE_TS_LEAVES` environment
variable, mapping it to `-DUSE_TS_LEAVES=ON` or `-DUSE_TS_LEAVES=OFF`
as appropriate.

The Vite/worker side SHALL mirror the same structure via
`VITE_USE_TS_LEAVES`, defaulting to ON when unset. Each per-module
Vite env var (`VITE_USE_TS_RANDOM`, …) defaults to the umbrella's
value when unset; explicit per-module env vars override.

#### Scenario: Default build routes ported leaves through TS

- **WHEN** the project is built with neither `USE_TS_LEAVES` nor any
  `USE_TS_<MODULE>` set
- **THEN** every leaf-library C implementation that has a TS port is
  excluded from `core_obj`
- **AND** the corresponding JS-library bridges are linked into each
  WASM target
- **AND** observable per-game behaviour is correct (validated by
  ordinary behavioural tests and the `ts-migration` dev-time
  differential spot-check, NOT by a byte-identical corpus gate)

#### Scenario: Explicit umbrella OFF gives pure C

- **WHEN** the project is built with `USE_TS_LEAVES=OFF`
- **AND** no per-module `USE_TS_<MODULE>=ON` override is set
- **THEN** every per-module flag defaults to OFF (inheriting the
  umbrella)
- **AND** every leaf-library C implementation is included in `core_obj`
- **AND** no JS-library bridge is linked

#### Scenario: Umbrella ON activates every leaf-library bridge

- **WHEN** the project is built with `USE_TS_LEAVES=ON` explicitly (or
  by default)
- **THEN** every leaf-library C implementation that has a TS port is
  excluded from `core_obj`
- **AND** the corresponding JS-library bridges are linked into each
  WASM target
- **AND** the per-puzzle WASM calls the TS bridge object for every
  covered call

#### Scenario: Per-module override under the umbrella

- **WHEN** the project is built with `USE_TS_LEAVES=ON -DUSE_TS_RANDOM=OFF`
- **THEN** every leaf except `random` is routed to its TS bridge
- **AND** `puzzles/random.c` is included in `core_obj`
- **AND** `random_bridge.js` is not linked

#### Scenario: Per-module flag with umbrella explicitly OFF

- **WHEN** the project is built with `USE_TS_RANDOM=ON USE_TS_LEAVES=OFF`
- **THEN** only `random` is routed to its TS bridge
- **AND** every other leaf stays on C
- **AND** behaviour matches a deliberately-narrow per-seam debugging
  build (e.g. bisecting a regression to the `random` bridge alone)

#### Scenario: Coherence check at worker init refuses mismatched builds

- **WHEN** the WASM was compiled with a `USE_TS_<MODULE>=ON` (so it
  imports the corresponding bridge symbols)
- **AND** the Vite/worker side has no matching bridge object on
  `Module` (the corresponding `VITE_USE_TS_<MODULE>` is explicitly off
  AND `VITE_USE_TS_LEAVES` is explicitly off)
- **THEN** the worker SHALL throw an error containing the missing
  symbol's name and the env-var fix
- **AND** the error SHALL propagate to Sentry
- **AND** no puzzle call SHALL be served

#### Scenario: Reverse coherence — Vite says TS, WASM says C — degrades silently

- **WHEN** `VITE_USE_TS_LEAVES=1` is set (or defaults ON) but the WASM
  was built with `USE_TS_LEAVES=OFF`
- **THEN** the per-module bridge objects on `Module` are unused
- **AND** the WASM uses its bundled C implementation
- **AND** the worker MAY emit a debug log noting the unused bridge,
  but SHALL NOT throw — this configuration is harmless (no symbol
  mismatch)
