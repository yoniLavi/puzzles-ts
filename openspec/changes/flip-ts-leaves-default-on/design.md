## Context

The umbrella `USE_TS_LEAVES` flag landed in `add-use-ts-leaves-umbrella-flag`
defaulting OFF — a conservative initial value chosen to keep the
umbrella change "additive; defaults preserve current behaviour exactly"
(its own `design.md`). With the umbrella now established and the
coherence check shipping, the conservative default has done its job;
the operational default should now match the umbrella's intent.

This is a small change (two literal flips: `OFF`→`ON` in CMakeLists,
`?? false`→`?? true` in worker.ts) but a meaningful one — it changes
what production ships by default.

## Goals / Non-Goals

**Goals**
- `npm run build:wasm && npm run dev` produces the hybrid TS+C build
  by default. Routine development matches production.
- `USE_TS_LEAVES=0` (and `VITE_USE_TS_LEAVES=0` on the worker side)
  remains the escape hatch for pure C.
- Future leaf-library bridges (`combi`, `tree234`, …) inherit the
  new "default-enabled" semantics automatically.

**Non-Goals**
- Removing pure C as a configuration. AGENTS.md "C is never deleted
  until the rewrite is complete" still holds — pure C stays reachable
  via explicit OFF.
- Bundling a production release with a fixed flag set. No CI/release
  infra to touch here.
- Adding new fidelity tests. The existing random capability's bar
  (recorded corpus + Solo round-trip MD5 + per-module property tests
  where applicable) is what the default-ON path stands on.

## Decisions

### Decision: Flip both halves together; coherence check remains the safety net

CMake default flips ON; Vite default flips ON. The coherence check
(`assertWasmBridgesCoherent` in `src/puzzle/worker.ts`) continues to
fail closed on any flag-set disagreement. After the flip, the common
"both halves agree" case is the *default* path, so the coherence check
fires in the *unusual* case (someone partially flipped one half). That
matches the design intent: the check is the regression guard, not the
routine path.

**Alternative considered**: flip only the Vite side, leave CMake at
OFF. This would mean default `npm run dev` boots with a worker that
*would* dispatch to TS — but the wasm is C-side, so the bridge sits
unused. The "reverse coherence — Vite says TS, WASM says C — degrades
silently" scenario covers this; it's not broken, but it's also
operationally weird (worker installs a bridge it never uses). Rejected:
inconsistent halves are exactly what the umbrella exists to prevent.

### Decision: Per-module defaults inherit the new umbrella default

`USE_TS_RANDOM` is defined as `option(USE_TS_RANDOM "..." ${_default_ts_module})`
where `_default_ts_module` mirrors `USE_TS_LEAVES`. With the umbrella
defaulting ON, `_default_ts_module` is ON, so per-module flags default
ON too. No need to touch the per-module option lines themselves —
they already inherit correctly.

This means any future `option(USE_TS_COMBI ... ${_default_ts_module})`
also defaults ON without further work. The umbrella's job — one
switch — keeps working.

### Decision: Production semantics flip with this change, not later

The user-facing implication of this change is that production builds
(via `npm run build`, which depends on `build:wasm` having been run)
will ship the TS random module. This is the moment the random
capability's fidelity guarantee (byte-identical to C, verified by
corpus replay) starts mattering for end users, not just for CI green.

The umbrella's own `design.md` framed this exact transition: *"the
benchmark soak (separate change) needs that one switch to compare
hybrid vs pure-WASM cleanly."* That comparison is what gives the flip
its safety net when the benchmark soak lands. Until then, the
existing random tests + the coherence check are the bar.

This is captured as a per-seam invariant in the proposal's "Risk"
section: any future leaf-library bridge proposal must document its
fidelity bar before archiving, because archiving means the bridge
ships default-ON.

## Risks / Trade-offs

- **Cached cmake builds.** `option()` honours previously-cached values,
  so a stale `build/wasm/` from before this change will keep producing
  pure-C output until reset. Mitigation: `rm -rf build/wasm/` (already
  documented for the inverse direction).
- **Discoverability.** Pure C is now opt-in rather than the default.
  Someone debugging "is this a TS-port regression or upstream-C
  behaviour?" must remember `USE_TS_LEAVES=0` to bisect. Mitigation:
  the README + AGENTS.md call out the escape hatch explicitly.
- **Future bridges raise the bar.** Each new leaf-library bridge that
  archives is automatically in the default-shipped set. This is
  intentional (umbrella's purpose) but the seam-port pattern's
  fidelity checklist needs to be the gate: corpus replay green +
  property tests where applicable + coherence-check probe added to
  `FORWARD_MISMATCH_PROBES` in worker.ts. The umbrella's design.md
  named the coherence-check probe step; that pattern carries forward.

## Migration Plan

Two literal flips + docs. No code structure changes. Existing
`USE_TS_RANDOM=1 npm run build:wasm` invocations keep working
(they're now redundant by default).

Rollback: revert the commit. The umbrella infrastructure stays;
only the default value reverts. Zero risk to the umbrella itself.

## Open Questions

None. The umbrella's own `design.md` already settled the major
trade-offs (per-module overrides, coherence-check direction,
fail-closed semantics); this change just exercises them at the
default position.
