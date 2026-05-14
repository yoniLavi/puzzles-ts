## Context

Per-module flags accumulate one per ported seam. With `USE_TS_RANDOM` already shipped and `USE_TS_COMBI` imminent (via `wire-combi-to-wasm`), the right time to lay down an umbrella flag is **now** — before there are six bridges to retrofit. The umbrella is the operator interface; per-module flags become debugging overrides.

The deeper motivation is the AGENTS.md "C is never deleted until rewrite is complete" policy. That policy only works if flipping between hybrid and pure-WASM is one switch. Seven independent switches doesn't qualify.

## Goals / Non-Goals

**Goals**
- Single CMake option + single env var that activate every leaf-library TS bridge at once.
- Per-module overrides survive (turn off one seam without giving up the rest).
- Coherence check at worker init: refuse to run if the C side and the JS side disagree about which flags are live. Fail closed.
- Documentation update so contributors discover the umbrella first, the per-module flags second.

**Non-Goals**
- The combi bridge itself. That's `wire-combi-to-wasm`.
- Removing per-module flags. They stay forever as overrides — the C fallback isn't going away, so neither are the per-module switches.
- Coverage of seam categories beyond leaf libraries. Mid-level shared logic, drawing, per-puzzle, midend will likely each get their own umbrella (`USE_TS_MID`, `USE_TS_DRAWING`, …) or fold into a single mega-umbrella once we know the shape. Not this change.

## Decisions

### Decision: Umbrella defaults per-module flags; per-module overrides apply after

CMake semantics, in `puzzles/CMakeLists.txt`:

```cmake
option(USE_TS_LEAVES "Route every leaf-library call to its TypeScript port" OFF)

# Per-module options default to the umbrella's value but can be overridden individually.
if(USE_TS_LEAVES)
    set(_default_ts_module ON)
else()
    set(_default_ts_module OFF)
endif()

option(USE_TS_RANDOM
       "Route random_* calls to TypeScript (overrides USE_TS_LEAVES for this module)"
       ${_default_ts_module})
# Future: option(USE_TS_COMBI ... ${_default_ts_module})
```

Invocation patterns:
- `cmake -DUSE_TS_LEAVES=ON` — all leaves TS.
- `cmake -DUSE_TS_LEAVES=ON -DUSE_TS_RANDOM=OFF` — all leaves TS except random (i.e., random stays on C).
- `cmake -DUSE_TS_RANDOM=ON` (umbrella off) — only random is TS; other leaves stay on C.
- Default (no flags) — pure C.

**Why**: matches what operators want (one switch for the common case, per-module debug overrides) without making the per-module flags second-class. Reads cleanly in cmake output.

**Alternatives considered**:
- Make `USE_TS_LEAVES` a list (`-DUSE_TS_LEAVES=random;combi`). Rejected: less discoverable than a boolean, and the "all-on" case is by far the operational one.
- Remove per-module flags entirely. Rejected: AGENTS.md C-fallback policy requires the override; also useful for bisecting which seam introduced a regression.

### Decision: Vite side mirrors the same structure

`src/puzzle/worker.ts` reads, in order:

```ts
const useTsLeaves = isTruthy(import.meta.env.VITE_USE_TS_LEAVES);
const useTsRandom = explicit(import.meta.env.VITE_USE_TS_RANDOM) ?? useTsLeaves;
// Future: const useTsCombi = explicit(VITE_USE_TS_COMBI) ?? useTsLeaves;
```

Where `explicit(v)` returns `true`, `false`, or `undefined` (for unset/empty). Per-module env var overrides the umbrella when set.

**Why**: symmetric with the CMake semantics. No new patterns to learn.

### Decision: Coherence check fails closed at worker init

The worker SHALL detect mismatch between what the WASM was compiled with and what the Vite side believes, by inspecting the WASM's imported symbols. If the WASM imports a function name that the Vite side hasn't wired up (e.g. `_ts_random_bridge_new` is imported but `tsRandomBridge` is missing from `Module`), the worker SHALL throw a clear error to Sentry and refuse to handle puzzle calls.

The error template:

```
Build flag mismatch: WASM imports `<symbol>` (compiled with USE_TS_<MODULE>=ON)
but the worker has no matching bridge object (VITE_USE_TS_<MODULE> is unset).
Fix: either rebuild WASM with `USE_TS_<MODULE>=` (off) or set
VITE_USE_TS_<MODULE>=1 in your Vite environment. The umbrella `USE_TS_LEAVES`
+ `VITE_USE_TS_LEAVES` should be set on both sides together.
```

**Why fail-closed**: silent fallback to "C side handles it" would mask a real configuration bug. A loud error is the right default; the cost is a minute of confusion the first time someone forgets `VITE_USE_TS_LEAVES`, vs the cost of shipping a misconfigured production build undetected.

**Detection mechanism**: Emscripten makes the WASM module's import list inspectable. The worker enumerates imports at instantiation time and matches against expected bridge symbols. Concrete implementation lives in the tasks.

**Alternatives considered**:
- Single shared env var (e.g. `TS_LEAVES=1`) read by both sides. Rejected: CMake configure-time and Vite/Worker run-time are decoupled by design (the WASM is an artefact built once, the worker reads env at request time). A single source of truth would force re-running cmake on every dev-server restart.
- Compile a build-stamp into the WASM (e.g. a const string `BUILD_FLAGS=USE_TS_LEAVES=ON`) and read it via Embind. Workable but heavier; the import-list trick is lighter and more direct.

### Decision: Umbrella stays bool, not "leaf set"

`USE_TS_LEAVES=ON` activates *every* per-module flag. There is no `USE_TS_LEAVES=random,combi` form. Per-module precision is delivered by per-module flags.

**Why**: the umbrella's job is "one switch." A list-valued umbrella is just per-module flags with extra steps.

## Risks / Trade-offs

- **The coherence check could fire spuriously during dev-server hot-reload** if a developer changes `VITE_USE_TS_LEAVES` mid-session without restarting vite. Mitigation: document; if it becomes a regular trip-up, add an explicit "reload your dev server" hint to the error.
- **CMake's `option()` interaction with cached values is famously fiddly.** If a previous `cmake` run set `USE_TS_RANDOM=ON` and the next run sets `USE_TS_LEAVES=ON` without re-specifying `USE_TS_RANDOM`, the cached value of `USE_TS_RANDOM=ON` wins — which happens to be the right outcome here, but the inverse case (`USE_TS_RANDOM` was cached `OFF`, now you want `USE_TS_LEAVES=ON` to flip it) won't work. Mitigation: document `cmake --fresh` (or deleting `/build/wasm/`) as the way to reset.
- **Adding `USE_TS_<MODULE>` flags becomes mandatory boilerplate per bridge.** The pattern is small (one `option()` + one `_default_ts_module` reference) and lives in a single cmake file, so it stays tractable. If it ever grows complex, we wrap it in a macro.

## Migration Plan

Additive. Defaults preserve current behaviour. Existing `USE_TS_RANDOM=1 npm run build:wasm` invocations still work. No rebuild required for anyone not using the umbrella.

Rollback: revert this change. Nothing downstream depends on the umbrella's existence yet (combi bridge isn't built).

## Open Questions

- Whether `VITE_USE_TS_<MODULE>` overrides should accept "off" overrides (e.g. `VITE_USE_TS_LEAVES=1 VITE_USE_TS_RANDOM=0` to turn random *off* under the umbrella). The CMake side handles this naturally; the Vite side needs to distinguish "unset" from "explicitly off". The `explicit()` helper in the Decision section addresses it, but the user-facing semantics of `VITE_USE_TS_RANDOM=0` should be confirmed against Vite's env-var parsing.
- Whether the coherence check belongs in `webapp.cpp` (so it runs once at WASM instantiation, before any puzzle calls) or in the worker's puzzle-call wrapper (so it runs lazily). Latter is simpler; former catches mismatches even when no puzzle is opened. Lean lazy; revisit if it bites.
