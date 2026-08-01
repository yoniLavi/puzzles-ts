# enforce-module-layering

## Why

**The architecture is already right, and nothing holds it there.** Measured on
2026-08-01:

- **0** imports from one game into another game.
- **0** imports from `engine/` into `games/`, apart from one documented test-only
  enrollment file (`engine/testing/hint-games.ts`, which a hinting port adds
  itself to once).
- **0** imports from `engine/` or `games/` into `screens/`, `dialogs/` or
  `components/`.

That is a clean layering — the puzzle engine is genuinely independent of the app
shell, and 57 games are genuinely independent of each other — and it holds today
purely because everyone who has touched it happened to respect it. It is exactly
the kind of property that erodes silently: the first game to import a helper
directly from another game will look like a sensible reuse, and nothing will
object.

**The measured cycle count was 20, and 19 of them are not cycles.** madge reports
import edges; it does not know that `verbatimModuleSyntax` erases
`import type`. Classifying every edge in both directions shows 19 of the 20 have
at least one type-only direction and therefore **do not exist at runtime** — the
16 per-game `index ↔ render` pairs (`render.ts` imports the game's hint type from
`index.ts`, nothing more), plus `command-link ↔ screen`,
`candidate-hint ↔ latin-hint`, `map-data ↔ state`, and `ascent render ↔ ui`.

Exactly **one** is a genuine runtime cycle: `unruly/solver.ts ↔ unruly/state.ts`,
where `state.ts` imports the values `validateCounts` and `validateRows` from
`solver.ts` while `solver.ts` imports values back from `state.ts`.

This matters beyond the one fix. The reviewed cleanup plan's Phase 4 says "C
header inclusion graphs produce cycles that have no logical counterpart; most
resolve by moving a shared type into its own module." **This codebase already did
that** — the type-only import *is* the resolution — and an uncalibrated tool
reported it as 20 outstanding problems. A metric that reports 20 when the answer
is 1 will be ignored, and then it will be ignored on the day it is right.

## What Changes

- **Fix the one real runtime cycle** (`unruly`), by moving the shared validation
  helpers to whichever side owns them, or to a third module.
- **Calibrate the cycle check** so it reports runtime cycles only, and record why:
  a raw madge count is not a runtime-cycle count on a codebase that uses
  `import type` and `verbatimModuleSyntax`. Ratchet it at zero once the unruly
  cycle is gone — a zero that means something is worth far more than a 20 that
  does not.
- **Encode the layering as an enforced rule**, failing CI on violation:
  - no game may import another game;
  - `engine/` may not import `games/` (with the `engine/testing/` enrollment file
    as an explicit, named exception);
  - `engine/` and `games/` may not import `screens/`, `dialogs/` or
    `components/`;
  - `preflight.ts` may not import anything that would break its Baseline-2023
    gate (it already may not use top-level `await`, dynamic `import()` or
    `import.meta`).
- **Decide the tool on the evidence.** `dependency-cruiser` is the plan's
  suggestion and is the obvious fit, but four rules over a fixed directory
  layout may be cheaper as a test — this repo already asserts cross-cutting
  invariants that way (`asset-integrity.test.ts`, `catalog-registry.test.ts`).
  Prefer the test unless the rules outgrow it; a new dev dependency should earn
  its place.

## Impact

- Affected specs: `repo-layout` (the source-tree requirement gains enforcement of
  the layering it already describes).
- Affected code: `unruly/{solver,state}.ts`; a new layering assertion (a test, or
  a `dependency-cruiser` config plus a CI step); `scripts/metrics.sh` cycle
  calibration.
- **No behaviour change.** Unruly's differential and snapshots must pass
  unmodified — moving two functions between modules cannot change a verdict, and
  if it does, something else is wrong.
- This is the smallest of the five refactoring changes and the only one whose
  main deliverable is a guarantee rather than a diff. That is deliberate: the
  `build-pipeline` spec already establishes that the durable artefact of an
  architectural cleanup is the rule that stops it re-eroding.

## Note on scope

The layering above is the one that exists. This change does **not** invent new
boundaries — no "games may not import each other's *types*" (they don't anyway),
no split of `engine/` into sub-layers, no rule about which engine modules may
import which. Those would be designing an architecture rather than recording one,
and the scene-graph postmortem is the standing reminder of what that costs
without downstream pressure.
