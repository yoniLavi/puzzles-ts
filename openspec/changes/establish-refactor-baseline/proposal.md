# establish-refactor-baseline

## Why

The migration plan's next step is "a round or two of refactoring on the
TypeScript-only codebase, so the work below lands on cleaner code". Refactoring
without a baseline is how you discover afterwards that you cannot tell which
intervention paid — and, worse, how a metric silently re-erodes once the session
that improved it ends.

**A generic C→TS cleanup plan was reviewed against this repo on 2026-08-01 and
most of it did not apply**, because this port was never a transliteration:
`AGENTS.md` has mandated "TS port style: idiomatic throughout" since the
2026-05-18 pivot, enforced per game at owner acceptance. The plan's Phase 1
(delete dead code) and most of Phase 2 (turn on the type system) were done
*during* porting, one game at a time. That finding is itself worth recording,
because the same generic plan will be proposed again.

**What the measurement found instead.** Every load-bearing claim was checked
rather than assumed:

| Metric | Measured 2026-08-01 | Reading |
|---|---|---|
| Duplication (jscpd, min-tokens 60) | **2.01%** lines, 4.36% tokens, 254 clones | Low overall, but concentrated |
| Cross-game clone lines | **2,180** across 151 blocks | The usable part of the above |
| Dead code (knip) | 1 unused file, 1 devDep, 5 vite-plugin exports | ~30 lines; not a phase |
| `any` density | ~0 (`any` appears 22×, nearly all the English word) | `type-coverage` would be a no-op |
| Import cycles (madge) | **20** (16 of a single `index↔render` shape) | Real, cheap to fix |
| **Cognitive complexity** | **814 functions > 15; median 30, p90 83, p95 108** | **The one metric with real signal** |
| Unused biome suppressions | 35 | Free deletion |

The single most useful number is the last row of that table's middle block:
**cognitive complexity is the only metric here that is both bad and actionable**,
and Biome already implements the same Sonar algorithm
(`complexity/noExcessiveCognitiveComplexity`). The reviewed plan proposed adding
ESLint + `typescript-eslint` + `eslint-plugin-sonarjs` to obtain it. That is a
second permanent lint toolchain, on a repo whose gate is already tuned for
wall-clock, to compute a number the installed linter computes for free.

**A baseline is only worth taking if something holds it.** Every number above is
a ratchet candidate: set the threshold to what we actually achieve, never to an
aspiration, so the gate blocks regression without ever blocking work.

## What Changes

- **Add an on-demand metrics harness**, `npm run metrics`, that records
  duplication (jscpd), cycles (madge), dead code (knip) and cognitive complexity
  (biome) into a committed `metrics/` baseline. It is **not** a gate step — it is
  slow, it needs no per-commit freshness, and its value is the diff between
  rounds.
- **Turn on `noExcessiveCognitiveComplexity` as a ratchet**, not at Biome's
  default of 15 (which would report 814 functions and be switched off within the
  hour) but at a threshold set to just above today's worst honest value, lowered
  deliberately by later changes as complexity comes down. The rule's job at this
  stage is *"no new function may be worse than the worst one we have"*.
- **Take the free deletions**: knip's unused file, unused devDependency and
  unused vite-plugin exports; the 35 unused biome suppression comments; and
  knip's three unlisted dependencies declared properly.
- **Record the rejected recommendations with their measurements**, in
  `design.md`, so the next person proposing `type-coverage`, a knip deletion
  phase, or `eslint-plugin-sonarjs` finds the number that says why not.

Explicitly **not** in this change: any behaviour-changing refactor. This change
establishes the instrument and takes only deletions the tools prove safe. The
four refactoring changes it enables (`tighten-type-checking`,
`unify-border-grid-games`, `adopt-shared-deduction-fixpoint`,
`break-module-cycles`) each re-measure against the baseline it lays down.

## Impact

- Affected specs: `build-pipeline` (a new requirement for the metrics harness and
  the complexity ratchet).
- Affected code: `package.json` (four dev dependencies, one script), a new
  `scripts/metrics.sh`, `biome.json` (one rule), `metrics/` (new, committed), and
  the small deletions listed above.
- **The four new dev dependencies are dev-only and never bundled**, so the
  "consider bundle size" constraint is not engaged. They are `jscpd`, `madge`,
  `knip` and nothing else — `type-coverage`, `eslint`, `typescript-eslint`,
  `eslint-plugin-sonarjs`, `dependency-cruiser` and `ts-morph` were all evaluated
  and rejected (see `design.md`).
- **The gate's wall-clock is unchanged.** The complexity rule runs inside the
  biome step that already runs; the metrics harness is not in the gate.
