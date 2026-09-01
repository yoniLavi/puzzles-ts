# build-pipeline Specification Delta — scope-the-gate-to-what-changed

## MODIFIED Requirements

### Requirement: The pre-commit gate minimises wall-clock without dropping checks

The pre-commit gate SHALL run all five checks (`tsc -b --noEmit`, biome,
`npm run probe -- --verify`, `vitest run`, `vite build`) and block a commit on
any failure — with the single documentation-only exception scoped below —
while being orchestrated to reduce wall-clock: the fast checks
(`tsc`, then biome, then the probe-anchor check) run first as a fail-fast
prefix, and the two heavy, mutually-independent checks (`vitest run` and
`vite build`, which share no inputs or outputs) SHALL run **concurrently**,
making the gate's wall-clock ~max(vitest, build) rather than their sum.

The probe-anchor check (`scripts/feedback-probe.mjs --verify`, **0.02–0.03 s**
user CPU measured over three runs — `npm run probe -- --verify` is ~0.2 s, which
is npm's own overhead, so the gate invokes node directly) verifies
that every case in the local-feedback corpus still **applies** — its anchor is
present and unique in the module it names. It runs no tests and asserts nothing
about the corpus's *result*.

That distinction is the whole of it, and it is load-bearing in both directions:

- The corpus is built from verbatim excerpts of engine source, so a refactor of
  a probed line silently stops the case matching. The harness then measures a
  smaller corpus and **reports success**, which reads exactly like health. The
  full run is ~20 minutes and deliberately outside the gate, so nothing else
  would notice.
- The probe's **rate** SHALL NOT be gated or ratcheted. A gated feedback number
  invites tests written against the number rather than against behaviour, which
  the `repo-layout` requirement it serves explicitly forbids. A survivor is a
  finding to read; only a case that no longer applies is a failure.

The gate's biome step SHALL check formatting and import order as well as lint
rules (the read-only form of `biome check`), so a file that is lint-clean but
unformatted cannot be committed. Gating only `biome lint` left the tree
lint-clean but never format-clean, so the first `biome check --write` run
reformatted ~150 unrelated files and buried the real diff; the fixer command
(`npm run check`) is not a substitute, because nothing requires it to be run.

The biome step SHALL be scoped by role, since a commit can only make a file
unformatted by touching it:

- The **automatic per-commit hook** SHALL check only the staged files
  (`biome check --staged`), so it inspects exactly the files the commit
  introduces and does no redundant work on an already-clean tree.
- **CI and the manual `npm run gate`** SHALL check the whole tree (`biome ci`)
  as the backstop. This is deliberate and SHALL NOT be scoped down: CI is the
  only gate a `--no-verify` commit passes through, and the whole-tree pass is
  also what forces a tree-wide reformat when biome itself is upgraded and
  restyles files no single commit touched.

**The heavy checks SHALL likewise be scoped by role, and only for a commit that
cannot affect them.** The automatic per-commit hook MAY skip `vitest run` and
`vite build` when **every** staged path is documentation that is neither a test
input nor a build input; one staged path outside that set SHALL run the whole
gate. CI and a manual `npm run gate` SHALL run everything, so the branch's
guarantee is unchanged — the same backstop argument as the biome scope, and
permitted for the same reason.

The set of skippable paths SHALL be asserted rather than assumed: a test SHALL
fail if any test, source or build-side module acquires a **read** of a path in
that set, so the exception stops being safe *and says so* rather than silently
skipping a check that has become real. That assertion SHALL key on the shape of
a read and not on the paths' names, since this repo's documentation is cited in
prose throughout its sources. `help/` SHALL NOT be skippable: it is a
`vite build` input and `help-coverage.test.ts`'s subject.

Selecting *individual tests* by what a commit changed is a different question
and is NOT authorised by this requirement. The cross-game guards here reach
their subjects through `import.meta.glob(..., "?raw")` rather than through
imports, so a graph-based selection may omit exactly the guards that exist to
catch a change to one game. Such a scheme SHALL first demonstrate that its
selection reaches those guards.

No correctness check may be removed, weakened, or moved off the per-commit path
to buy speed (scoping the hook to staged files is not a weakening — the
whole-tree backstop in CI and `npm run gate` still guarantees nothing unformatted
survives on `main`), and `vite build` SHALL remain in the gate (it is the only
step that exercises the production build, where two prod-only regressions have
shipped undetected). Any vitest pool/isolation tuning adopted to reduce per-file
module-load overhead SHALL preserve the `repo-layout` requirement that "the test
suite is deterministic under parallel load" — verified by a green full run
repeated under the new configuration (including under file-order shuffle, which
stresses the shared-module-state that non-isolated pools expose) — or be
reverted.

The gate SHALL NOT make its concurrency conditional on machine load. It once
probed the 1-minute load average and serialised on a busy box, because
oversubscription starved timeout-bound tests past their per-test deadlines. That
rationale was retired with the per-test timeouts themselves (one 600s ceiling in
`vitest.config.ts`, no per-test timeouts), so contention now makes a test
*slower*, never *failed* — and the probe only cost time, reading "busy" on a
deliberately-loaded box and putting the build on the critical path against a
danger that no longer exists. Reliability remains the gate's first duty; it is
bought by not gating tests on the clock rather than by hoarding cores.

The gate's orchestration SHALL live in a single script (`scripts/gate.sh`)
invoked by both `.husky/pre-commit` and `npm run gate`, so the hook and the
manual command cannot drift; the per-commit-vs-backstop biome scope is selected
by an environment toggle the hook sets, not by a second copy of the gate.

#### Scenario: The independent heavy steps run concurrently

- **WHEN** the pre-commit gate runs after `tsc` and biome pass
- **THEN** `vitest run` and `vite build` execute concurrently, regardless of
  machine load
- **AND** the commit is rejected if either the tests or the production build
  fails

#### Scenario: A staged unformatted file is rejected by the hook

- **WHEN** a commit stages a file that satisfies every lint rule but is not
  formatted (or has unsorted imports) to the repository's biome configuration
- **THEN** the per-commit hook's staged biome check fails in the fail-fast
  prefix and the commit is blocked, before the heavy checks are spent
- **AND** an unformatted file that is NOT staged does not block the commit
  (it is outside the commit's blast radius)

#### Scenario: The whole-tree backstop still catches a bypass

- **WHEN** an unformatted file reaches `main` via a `--no-verify` commit, or a
  biome upgrade restyles files no single commit touched
- **THEN** the whole-tree `biome ci` in CI (and in a manual `npm run gate`) fails
- **BECAUSE** the per-commit scope is a per-commit optimisation, not a relaxation
  of the guarantee that `main` stays formatted

#### Scenario: A speed change never weakens the gate

- **WHEN** a pool/isolation setting is changed to speed up `vitest run`
- **THEN** the full suite is shown to remain green and deterministic under the
  new setting (repeated runs, including under file-order shuffle)
- **AND** if it does not, the setting is reverted rather than shipped

#### Scenario: A refactor moves a line the probe corpus anchors on

- **WHEN** a commit changes an engine line that a probe case quotes as its anchor
- **THEN** the gate fails in ~0.2 s naming the case, and the case is re-anchored
  (or retired) as part of that commit
- **BECAUSE** an anchor that no longer applies makes the harness measure a
  smaller corpus and report success — the failure mode this project keeps
  naming, where a silent cap reads as health. Re-anchoring is also the moment a
  human decides whether the case still states the defect it claims to.

#### Scenario: A documentation-only commit skips the heavy checks

- **WHEN** every path staged for a commit is documentation that no test and no
  build input reads
- **THEN** the per-commit hook runs the fast prefix and skips `vitest run` and
  `vite build`
- **AND** it says so, naming what it skipped and where the full gate still runs

#### Scenario: One source file cancels the exception

- **WHEN** a commit stages documentation together with any other path
- **THEN** the whole gate runs, because the exception is an all-or-nothing test
  on the staged set rather than a per-file filter

#### Scenario: A skippable path acquires a reader

- **WHEN** a test, source or build-side module begins reading a path the gate
  may skip
- **THEN** a test fails, naming the file and the path
- **BECAUSE** the exception's whole basis is that those paths reach nothing, and
  a check skipped for a path that has become real is a dropped check reporting
  success

