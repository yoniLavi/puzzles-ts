# Change: Align random spec with the umbrella-flip world

## Why

The `random` capability spec was written for the original
`port-random-to-typescript` and `wire-random-to-wasm` changes. At
the time, `USE_TS_RANDOM` was the only flag, it defaulted OFF, and
it was the random module's job to define its own toggle semantics.
That world ended when `add-use-ts-leaves-umbrella-flag` introduced
the umbrella and `flip-ts-leaves-default-on` flipped it ON.

The random spec is now out of date in two specific ways:

1. It asserts that `USE_TS_RANDOM` defaults OFF. Today the umbrella
   defaults ON, per-module flags inherit, so `USE_TS_RANDOM`
   defaults ON. Direct factual contradiction with the
   `build-pipeline` spec.

2. It overlaps with `build-pipeline` on flag-default semantics that
   are now centrally owned. The "Default build keeps C implementation"
   scenario doesn't belong in random — it belongs (and lives) in
   `build-pipeline` where the umbrella's default-on behaviour is
   defined.

This change narrows the random spec to its actual scope (the bridge
mechanics, the byte-fidelity contract, and the per-seam invariants
specific to `random.c`) and points readers at `build-pipeline` for
the default and umbrella semantics.

## What Changes

- **`random` spec** — MODIFY the "Build flag toggles between C and
  TypeScript implementations" requirement so it no longer asserts a
  default value; instead, it describes only what the `USE_TS_RANDOM`
  per-module flag *means* (bridge linked iff truthy) and defers to
  `build-pipeline` for default + umbrella behaviour. Drop the
  "Default build keeps C implementation" scenario (now covered by
  `build-pipeline`'s "Default build is hybrid TS+C" / "Explicit
  umbrella OFF gives pure C"). Keep the "Flag-on build routes to
  TypeScript" and "Same game ID, same board" scenarios — they're
  random-specific bridge mechanics that still hold.
- **No code changes.** This is a docs/spec alignment only.

**Out of scope**:

- Touching any other random-spec requirement. The TS impl
  correctness, bridge mechanics (handle table, state encoding), and
  pre-commit test gates all stay as-written.
- Changing the build-pipeline spec. It already owns flag defaults
  authoritatively.

## Impact

- **Affected specs**: `random` only — one requirement reworded, one
  scenario dropped.
- **Affected code**: none.
- **Risk**: zero. The implementation already matches the new wording;
  this change just makes the spec stop lying about it.
- **Verification**: `openspec validate --specs --strict` passes after
  archive.
