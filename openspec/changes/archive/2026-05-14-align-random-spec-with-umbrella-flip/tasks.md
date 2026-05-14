# Tasks

## 1. Spec edit

- [x] 1.1 Modified the "Build flag toggles between C and TypeScript
      implementations" requirement in the random delta. Drops the
      default-value assertion, defers to `build-pipeline` for default
      and umbrella semantics, keeps the random-specific bridge
      mechanic (USE_TS_RANDOM CMake option + env-var pass-through).
- [x] 1.2 Dropped the now-redundant "Default build keeps C
      implementation" scenario (covered by `build-pipeline`'s
      "Default build is hybrid TS+C" and "Explicit umbrella OFF
      gives pure C").
- [x] 1.3 Kept "Flag-on build routes to TypeScript" (with wording
      tweak to acknowledge the umbrella-inherit path) and "Same game
      ID, same board" scenarios — both random-specific and still
      hold.

## 2. OpenSpec hygiene

- [x] 2.1 `openspec validate align-random-spec-with-umbrella-flip
      --strict` passes.
- [x] 2.2 On archive, `openspec/specs/random/spec.md` reflects the
      narrower requirement; `openspec validate --specs --strict`
      passes 6/6.
