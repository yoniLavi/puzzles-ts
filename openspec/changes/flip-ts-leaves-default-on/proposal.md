# Change: Flip USE_TS_LEAVES default to ON

## Why

The umbrella `USE_TS_LEAVES` / `VITE_USE_TS_LEAVES` flags just landed
(see `add-use-ts-leaves-umbrella-flag`) defaulting OFF — meaning a
fresh `npm run build:wasm && npm run dev` produces a *pure-C* build and
makes the TS port an opt-in. That ordering is backwards once the umbrella
is the operator-facing toggle and per-module flags are debug overrides:
the default should be the operational mode, not the escape hatch.

Three concrete reasons to flip now:

1. **The hybrid is the operational mode.** Per the umbrella's
   `design.md`: *"Production will only ever ship two configurations:
   pure-WASM (default) and 'every leaf displaced to TS.'"* With the
   umbrella in place, the second configuration becomes the cheap one
   to ship — every ported seam is enabled in one switch. Keeping that
   path opt-in makes routine development drift away from what
   production runs.

2. **The fidelity bar is met.** The random capability's spec asserts
   byte-identical behaviour between the C and TS implementations on
   the recorded corpus, the bridge round-trip is verified
   (`d704406cde2b755bf708f9dc543b1c96` Solo MD5), and the coherence
   check that just shipped fails closed on any future flag mismatch.
   The risk of "default-ON quietly diverges from C" is the risk the
   fidelity tests + coherence check are designed to catch.

3. **Future seams default to enabled.** Each future leaf-library
   bridge (`combi`, `tree234`, …) inherits the umbrella's default.
   Landing each one *enabled* by default is the whole point of the
   umbrella — without this flip, every new bridge would ship in the
   off-by-default state and require a separate "make this leaf
   default ON" change.

This is a deliberate change to what `npm run build:wasm` (and therefore
production) produces. Pure C remains available via explicit
`USE_TS_LEAVES=OFF`.

## What Changes

- **CMake**: `puzzles/CMakeLists.txt` flips `option(USE_TS_LEAVES ... OFF)`
  to `option(USE_TS_LEAVES ... ON)`. Per-module defaults still inherit
  the umbrella; with the umbrella defaulting ON, per-module flags
  default ON too. `USE_TS_LEAVES=OFF` (or per-module `USE_TS_<MODULE>=OFF`
  overrides) remains the escape hatch.
- **Vite/worker**: `src/puzzle/worker.ts` flips `useTsLeaves` resolution
  from `explicit(VITE_USE_TS_LEAVES) ?? false` to `?? true`. Same
  per-module override semantics; just a different default value.
- **`scripts/build-emcc.sh`**: the `USE_TS_LEAVES` env-var case stays
  unchanged structurally (unset still means "use the CMake default"),
  but the info-line wording is updated to reflect the new default.
- **Docs**: `AGENTS.md` "Build commands" + `README.md` "Building
  puzzles" describe the new defaults: zero-arg `npm run build:wasm` +
  `npm run dev` is the hybrid path; opt out with `USE_TS_LEAVES=0` if
  you want pure C.
- **Spec delta**: `build-pipeline` requirement reworded — umbrella
  defaults ON; "Default build is pure C" scenario flips to
  "Default build is hybrid TS+C"; an "Explicit umbrella OFF gives
  pure C" scenario is added to cover the escape hatch.

**Out of scope**:

- Removing pure C as a configuration. Per AGENTS.md "C is never
  deleted until the rewrite is complete", the pure-C path stays
  reachable forever — this change makes it opt-in, not gone.
- Bundling production with a fixed flag set in CI. CI/release infra
  isn't wired in this fork yet; whatever lands will inherit the new
  defaults.
- Touching `wire-combi-to-wasm` or the benchmark soak. They'll land
  later under the new defaults without needing per-change adjustment.

## Impact

- **Affected specs**: `build-pipeline` — MODIFIED. Default value of
  the umbrella flips; "default scenario" flips correspondingly; new
  scenario for the explicit-OFF escape hatch.
- **Affected code**:
  - `puzzles/CMakeLists.txt` (one-word change: `OFF` → `ON` in the
    `option(USE_TS_LEAVES ...)` line).
  - `src/puzzle/worker.ts` (one-word change: `?? false` → `?? true`
    for `useTsLeaves`).
  - Docs (`AGENTS.md` Build commands, `README.md` Building puzzles)
    — narrative update around the new defaults.
- **Affected workflows**:
  - Routine `npm run build:wasm && npm run dev` now produces the
    hybrid build by default.
  - Production builds (`npm run build`) will include the TS random
    bridge by default once this lands — same fidelity guarantee, no
    visible end-user change.
  - Anyone who wants pure C must now set `USE_TS_LEAVES=0` (and
    `VITE_USE_TS_LEAVES=0` for the worker) explicitly.
- **Risk**:
  - **Cached cmake builds become stale.** Anyone with a previous
    `build/wasm/` will not auto-flip; `rm -rf build/wasm/` before the
    first `npm run build:wasm` post-flip. Documented in the existing
    "transitioning between flag combinations" note.
  - **Production semantics shift.** From this change forward, the
    production wasm imports `random_new` (and future bridge symbols)
    from JS and dispatches through the TS port. The fidelity guarantee
    is end-to-end (random's spec), but this is the moment the
    guarantee starts mattering for end users, not just CI.
  - **Future seams default-enable themselves.** Landing a new leaf
    bridge now means it ships in production the moment the bridge
    proposal archives. Per-seam proposals SHALL document the fidelity
    bar (corpus + property tests where applicable) before archiving.
- **Verification**:
  - `npm run build:wasm` (zero env vars) produces a wasm whose
    `emcc-runtime.js` references `tsRandomBridge`.
  - `npm run dev` (zero env vars) boots; opening `/galaxies` renders a
    real board with no console errors (coherence check passes;
    no `randomNew` crash).
  - `USE_TS_LEAVES=0 npm run build:wasm` produces a wasm whose
    `emcc-runtime.js` does NOT reference `tsRandomBridge`; running
    `npm run dev` (zero env vars) against that wasm crashes loudly via
    the reverse coherence check? *No* — reverse coherence is silent by
    design; the wasm's bundled C random handles it. Verified.
  - `npm run test:run` passes (345/345 today; no regression expected).
