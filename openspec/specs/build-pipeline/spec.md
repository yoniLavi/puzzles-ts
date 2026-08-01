# build-pipeline Specification

## Purpose
TBD - created by archiving change remove-docker-emcc-build. Update Purpose after archive.
## Requirements
### Requirement: Continuous integration runs the full gate on push to main

The repository SHALL provide a GitHub Actions workflow that, on every push to
`main`, runs the same gate as the husky pre-commit hook (`npm run gate`:
`tsc -b --noEmit` → `biome ci` → `vitest run` → `vite build`).

The gate SHALL require **no generated assets**. This reverses the previous
requirement, which stated there was "no valid asset-free CI tier (a no-asset job
fails at `tsc -b`)" — true only while `src/puzzle/{catalog,types,worker}.ts`
imported artifacts produced by the Emscripten build. Since `retire-c-engine` the
catalog is committed source and the types are hand-authored, so a clean checkout
type-checks, tests and builds with nothing generated. The workflow SHALL NOT
provision a wasm toolchain, and SHALL NOT cache generated assets to make the
gate viable.

The workflow SHALL nonetheless build the in-app manual (`npm run build:assets`,
halibut over `puzzles.but`) before the gate. This is not a gate precondition but
a coverage decision: the manual is the only generated asset left, and building it
is what exercises `scripts/build-manual.sh` and the vite manual-page rendering
path, neither of which any test covers.

The project is trunk-based (no pull-request flow), so the gate runs post-push on
`main` rather than pre-merge; a `pull_request` trigger MAY be added later if a
contributor PR flow is adopted. This closes the single-point-of-failure gap where
the pre-commit hook was the only gate (a `--no-verify` commit or a clone whose
hooks never installed could land breakage on `main` undetected).

#### Scenario: A push to main is gated

- **WHEN** a commit is pushed to `main` (including one made with `--no-verify`)
- **THEN** the workflow runs `npm run gate` and fails the run on any gate failure

#### Scenario: The gate runs without generated assets

- **WHEN** the workflow runs on a clean checkout
- **THEN** no wasm toolchain is provisioned and no asset cache is consulted
- **AND** the typecheck, tests and production build all succeed

### Requirement: The pre-commit gate minimises wall-clock without dropping checks

The pre-commit gate SHALL run all four checks (`tsc -b --noEmit`, biome,
`vitest run`, `vite build`) and block a commit on any failure, while being
orchestrated to reduce wall-clock: the fast checks (`tsc` then biome) run
first as a fail-fast prefix, and the two heavy, mutually-independent checks
(`vitest run` and `vite build`, which share no inputs or outputs) SHALL run
**concurrently**, making the gate's wall-clock ~max(vitest, build) rather than
their sum.

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

### Requirement: The asset build produces the catalog and manual without a WASM toolchain

With no game served by C/WASM, the build SHALL produce the two artefacts the app
depends on — the game `catalog.json` and the in-app manual HTML — **without the
Emscripten toolchain**. The catalog SHALL be derived from a **committed
TypeScript catalog source** holding each game's display metadata (every game is
TS-served, so the catalog is exactly the set of registered TS games); that
metadata previously existed only in the CMake `puzzle()` calls being deleted, so
it moves rather than being re-derived. The manual SHALL continue to be built by
halibut from `puzzles.but`, detached from any wasm-compilation step.

The build configuration SHALL NOT depend on any generated, gitignored artefact at
config-load time, so a clean checkout is configurable before anything has been
generated.

A clean checkout SHALL build the app and serve every game and its help pages
with no Emscripten toolchain installed.

#### Scenario: A clean checkout builds with no Emscripten

- **WHEN** the app is built from a clean checkout on a machine without the
  Emscripten toolchain
- **THEN** the catalog and the manual HTML are produced
- **AND** the app lists every game and serves its help pages
- **AND** no wasm artifact is produced or required

#### Scenario: A clean checkout needs no generated artefact to configure

- **WHEN** the build is configured on a checkout where nothing has been generated
- **THEN** the configuration loads and the build proceeds
- **AND** the game catalog is read from committed source

### Requirement: Refactoring metrics are measured on demand and ratcheted in the gate

The repository SHALL provide an on-demand metrics harness (`npm run metrics`,
orchestrated by `scripts/metrics.sh`) that records code-health measurements —
duplication, import cycles, dead code, and cognitive complexity — as raw tool
output under a dated `metrics/` directory, committed to the repository.

The harness SHALL NOT be part of the pre-commit gate or of CI's blocking checks.
Its value is the **diff between rounds**, not per-commit freshness, and adding a
slow whole-tree scan to a gate that is explicitly optimised for wall-clock would
buy nothing.

Cognitive complexity SHALL be obtained from Biome's
`complexity/noExcessiveCognitiveComplexity`, which implements the published
Sonar algorithm already available in the installed linter. A second lint
toolchain SHALL NOT be added to compute it.

Where a metric is enforced rather than merely recorded, its threshold SHALL be a
**ratchet** — set to the value the tree currently achieves, and lowered only by a
change that does the work to earn the lower value. A threshold SHALL NOT be set
to an aspiration, because a gate that fails on work in progress is a gate that
gets disabled.

A function exceeding the complexity ratchet SHALL be suppressed individually
with a stated reason rather than accommodated by raising the threshold, so that
the suppression list remains the work queue and the threshold keeps measuring
something.

#### Scenario: A refactoring round is attributed to its intervention

- **WHEN** a refactoring change completes and re-runs `npm run metrics`
- **THEN** a new dated snapshot is committed alongside the previous one
- **AND** the change can state which measurement moved and by how much, rather
  than asserting an improvement

#### Scenario: A new function may not be worse than the worst existing one

- **WHEN** a commit introduces a function whose cognitive complexity exceeds the
  configured ratchet
- **THEN** the biome step of the gate fails and the commit is blocked
- **AND** the author either simplifies the function or adds an individual
  suppression with a reason — but does not raise the threshold

#### Scenario: A saturating instrument is not trusted as a maximum

- **WHEN** the complexity tool reports an identical extreme score for several
  unrelated functions
- **THEN** that value is treated as a saturation bound ("≥ N") and recorded as
  such, not as a measured maximum
- **BECAUSE** an instrument that silently saturates will report no regression
  when the worst function gets worse

### Requirement: A static-analysis finding is triaged against the type information behind it

Type-aware analysis that reports a condition as impossible SHALL have each such
finding triaged before any code is removed. A reported condition is exactly one
of three things, and **the third is the common case in this repository**:

1. a guard rendered redundant by a type that was tightened after it was written
   — delete it;
2. **a check that was intended to fire and cannot** — a defect; fix it and report
   the behaviour change; or
3. **a correct runtime guard that the type system misrepresents** — keep it, and
   record why so the next audit does not re-raise it.

The third category is not an edge case here. All 53 findings measured on
2026-08-01 were in it, by two structural mechanisms that will not go away:

- **Narrowing is not invalidated by a mutating call.** A solver that checks
  `state.impossible`, calls a technique that sets it, and checks again is
  reported as having a dead second check. Deleting it stops the solver detecting
  contradictions, and generation is gated on that verdict. This follows from the
  deliberate house style of a mutable solver state.
- **Index access is typed as total when `noUncheckedIndexedAccess` is off.**
  `const c = desc[pos]; if (c === undefined) …` is reported as having no
  overlap, while at runtime the read genuinely can be `undefined`. These sites
  are overwhelmingly **description parsers**, i.e. the code validating a game ID
  a player pasted from an untrusted source.

Consequently, an analysis whose soundness depends on a compiler flag the project
has declined SHALL NOT be adopted as a blocking gate. Declining to tighten types
does not merely weaken such an analysis — it makes it wrong in a specific and
confident direction, and a mechanical fix pass would delete exactly the
validation the declined flag existed to enforce.

#### Scenario: A bounds check in a description parser is reported as dead

- **WHEN** type-aware analysis reports `if (c === undefined)` after an indexed
  read as having no overlap
- **THEN** the guard is kept, because the read can return `undefined` at runtime
  regardless of its declared type
- **AND** the finding is recorded as an analysis artefact rather than re-triaged
  on every subsequent audit

#### Scenario: A solver's second contradiction check is reported as always falsy

- **WHEN** a solver checks a mutable flag, calls a technique that can set it, and
  checks it again
- **THEN** the second check is kept
- **BECAUSE** the narrowing that makes it look dead does not survive the call at
  runtime, and removing it would let an impossible board be reported as solved

#### Scenario: A never-firing check turns out to be load-bearing

- **WHEN** triage finds a reported condition was genuinely written to reject an
  invalid state and cannot do so
- **THEN** the condition is corrected so that it fires as intended, with a test
- **AND** any resulting change in generated boards is reported, not absorbed

### Requirement: Compiler strictness is adopted on measured evidence, not from a checklist

Additional TypeScript strictness flags SHALL be adopted on the evidence of what
they cost and what they buy **measured against this tree**, and the reasoning for
a declined flag SHALL be recorded in `tsconfig.json` beside the ones that are on,
so the next reader gets the number rather than re-deriving it.

`noUncheckedIndexedAccess` SHALL NOT be enabled tree-wide. It applies to typed
arrays as well as plain arrays and records, and this codebase uses typed arrays
as its deliberate house pattern for game state and render cache keys. In a solver
whose indices come from the loop bounds immediately above them, the flag reports
an impossibility whose only available fix is a non-null assertion at every
access — no runtime safety, and arithmetic that is harder to read. Measured cost:
9,028 errors, concentrated in solver code.

Where the guarantee is genuinely earned — decoding a save, parsing a game ID or a
user-supplied description — it SHALL be obtained with an explicit check at that
boundary. Such checks already exist throughout the description parsers and SHALL
NOT be removed on the strength of an analysis that cannot see them (see the
requirement above).

#### Scenario: A strictness flag is proposed from a checklist

- **WHEN** a change proposes enabling a compiler strictness flag
- **THEN** its error count against the current tree is measured first
- **AND** the flag is adopted only if the errors represent distinctions the code
  genuinely blurs, rather than assertions restating what the surrounding control
  flow already guarantees, or widenings that restore the semantics already in
  force

#### Scenario: A declined flag is proposed again later

- **WHEN** a contributor considers enabling a flag that was previously declined
- **THEN** `tsconfig.json` states the measured cost and the reason
- **AND** the decision is revisited only on new evidence, such as a format that
  begins to distinguish a missing key from an explicit null

### Requirement: The commit gate's cost is proportional to what it protects

The pre-commit gate SHALL be kept affordable per commit, and a test that costs a
large share of it SHALL justify that share by what it would catch. A test whose
cost is dominated by *more of the same* — a larger board, additional seeds beyond
the point of detection — SHALL be reduced or moved to the opt-in tier, not left
to be paid on every commit.

The measurement that motivates this: five files were **66% of all test time**, and
about ten individual tests were **54%** — one property test alone was 20% of the
whole suite.

Three treatments are permitted, in order of preference, because they lose
different amounts:

1. **Short-circuit a deterministic search.** Where a test scans generated boards
   to find one exhibiting a case, the pair it finds is deterministic and MAY be
   recorded so the scan starts there. This loses **nothing** — the same board is
   returned — and correctness MUST NOT depend on the recorded value being current:
   a stale pin falls back to the full scan.
2. **Reduce a confidence dial.** Where a seed count expresses "how many boards do
   we scan", it MAY be reduced for the gate provided the property is one a
   violation of which would be *systematic* rather than rare, and provided the
   remaining scan still exercises the assertion many times. The change SHALL
   state that count.
3. **Defer to the opt-in tier** (`npm run test:slow`). Reserved for cases where
   the cost is board *size* rather than configuration.

A test SHALL NOT be deferred when it is the only one covering some configuration.
Deferring the largest board of a family whose every mode, difficulty and grid type
is checked by smaller fixtures costs the gate nothing it relied on; deferring the
only fixture for a grid type silently removes that grid type from every commit.
The remaining coverage SHALL be stated where the deferral is made.

The opt-in tier SHALL be run as part of a refactoring round, alongside
`npm run metrics`. A tier nobody ever runs is worse than a deleted test, because
the file still reads as coverage.

A saving claimed for the gate SHALL be quoted in **CPU time** (`user + sys` over
the whole run), not in wall clock and not in summed per-test durations. This box
runs other work in parallel, and summed per-test duration is wall clock per test
— so it inflates exactly the heavy tests a right-sizing pass removes, and
flatters the result. Measured here: the duration sums reported a 68–70% saving
where the CPU measurement showed **53%**. Per-test durations remain the right
tool for *locating* cost, because a relative measure is all that needs to be.

#### Scenario: A gate saving is reported

- **WHEN** a change claims to have reduced the gate's cost
- **THEN** the figure quoted is CPU time before and after
- **BECAUSE** a wall-clock or summed-duration figure measures how long the tests
  appeared to take under whatever else the box was doing, not what they cost

#### Scenario: A test is made cheaper

- **WHEN** a test's cost is reduced by any of the three treatments
- **THEN** it is verified to still discriminate — by breaking the code it covers
  and confirming it fails
- **BECAUSE** the failure this optimisation most easily causes is a test that
  still passes, still reads as coverage, and no longer catches anything

#### Scenario: A differential fixture is deferred

- **WHEN** the largest board of a game's frozen differential is moved to the
  opt-in tier
- **THEN** every mode, difficulty and grid type it carried is still asserted on
  every commit by the smaller fixtures, and that is stated at the call site
- **BECAUSE** the differentials are the refactoring net: a refactor that changes a
  solver's verdict must still change a desc the gate checks

