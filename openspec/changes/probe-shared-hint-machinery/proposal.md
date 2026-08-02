# probe-shared-hint-machinery

**Scaffolded, not implemented.** Scoped at the end of
`extend-feedback-probe-corpus` so the next session starts from a decision rather
than a survey.

> `openspec validate --strict` fails on this directory, deliberately: it has no
> `specs/` delta, because the work is **expected not to need one** (see Impact)
> and inventing a requirement to satisfy the validator would be exactly the
> padding this project's spec discipline exists to prevent. Validation is not
> gated (nothing in `scripts/gate.sh` or CI runs it), and if the work does turn
> out to amend a requirement — it has three times now — that amendment is the
> finding and gets written then.

## Why

The local-feedback corpus covers 14 engine modules and the ones chosen so far
were picked by two accidents of history: the seven the mutation audit could
afford, the three it wrote tests for, and four picked by importer count. What is
left is genuinely the next tier, and one module dominates it.

`candidate-hint.ts` is **711 lines with 13 importers** — the largest unprobed
module in the engine and the shared machinery behind explained hints, which this
fork treats as a core product value rather than a nicety. A defect there is
exactly the kind this project has said it most wants to avoid: a hint that
*narrates a claim it has not checked*, which is a lie read by a player who
trusts it (the `hint-authoring` bar, rule 5).

Behind it: `slide-planner.ts` (527 lines), `loopgen.ts` (297),
`grid-geometry.ts` (482 — the only floating-point code in the grid leaf, and
display/input only, which is worth stating in its test file either way).

## What Changes

- Probe cases for `candidate-hint.ts` first, then the other three.
- Fix what they find, in each module's own tests.
- Expect some survivors to be **equivalent**, and record the argument rather
  than chasing them — the corpus already carries three.

## What this is deliberately not

**Not extending the probe to the 57 games.** The calculus differs and the
difference is the point: a game's differential sits in its *own directory*, so a
targeted run already includes it and feedback is local by construction. The
argument `audit-test-suite-strength` made against mutating the games applies to
probing them.

**Not a target of 100%.** The rate is a diagnostic. A case argued
behaviour-preserving is a result, not a gap.

## Impact

- Affected specs: none expected. The `repo-layout` requirement this serves
  exists; this is more of the measurement it asks for. If the work amends a
  definition again — it has three times now — that amendment is the finding.
- Affected code: `candidate-hint.test.ts`, `slide-planner.test.ts`,
  `loopgen.test.ts`, a new `grid-geometry` test home, and the probe corpus.
