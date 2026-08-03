# build-pipeline Specification

## Purpose
TBD - created by archiving change remove-docker-emcc-build. Update Purpose after archive.
## Requirements
### Requirement: Continuous integration runs the full gate on push to main

The repository SHALL provide a GitHub Actions workflow that, on every push to
`main`, runs the same gate as the husky pre-commit hook (`npm run gate`:
`tsc -b --noEmit` → `biome ci` → probe-anchor check → `vitest run` →
`vite build`).

The gate SHALL require **no generated assets**. This reverses the original
requirement, which stated there was "no valid asset-free CI tier (a no-asset job
fails at `tsc -b`)" — true only while `src/puzzle/{catalog,types,worker}.ts`
imported artifacts produced by the Emscripten build. Since `retire-c-engine` the
catalog is committed source and the types are hand-authored, so a clean checkout
type-checks, tests and builds with nothing generated. The workflow SHALL NOT
provision a wasm toolchain, and SHALL NOT cache generated assets to make the
gate viable.

**The workflow SHALL provision no native tool at all.** It previously carried an
apt install of halibut and a `npm run build:assets` step, on the reasoning that
the manual was the only generated asset left and building it was the only thing
exercising `scripts/build-manual.sh` and vite's manual-page rendering path. Both
the script and that rendering path are deleted with the manual, so the coverage
argument has no subject: the job is `npm ci` and the gate.

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

#### Scenario: The workflow installs no system package

- **WHEN** the workflow's steps are inspected
- **THEN** the only setup is `actions/setup-node` and `npm ci`
- **AND** no `apt-get`, `brew` or other native-tool provisioning step is present

### Requirement: The pre-commit gate minimises wall-clock without dropping checks

The pre-commit gate SHALL run all five checks (`tsc -b --noEmit`, biome,
`npm run probe -- --verify`, `vitest run`, `vite build`) and block a commit on
any failure, while being orchestrated to reduce wall-clock: the fast checks
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

### Requirement: Refactoring metrics are measured on demand and ratcheted in the gate

The repository SHALL provide an on-demand metrics harness (`npm run metrics`,
orchestrated by `scripts/metrics.sh`) that records code-health measurements —
duplication, import cycles, dead code, and cognitive complexity — as raw tool
output, committed to the repository.

A **round's** dated snapshot SHALL be committed under the openspec change that
produced it, and SHALL travel into the archive with that change. A snapshot is
evidence for a piece of work, not a standing repository artefact: its value is
the diff between rounds, that diff is read once by the change that ordered the
measurement, and it cannot be regenerated afterwards because it measures a tree
that no longer exists. The same reasoning files an audit's findings under its
change, and filed `retire-c-engine`'s unbuildable C reference sources under the
changes that read them.

This does **not** conflict with `repo-layout`'s rule that a *tool* SHALL NOT
write its output into an `openspec/changes/<id>/` directory. The harness writes
to the stable path `metrics/<date>/`; the change's author then commits the
finished snapshot under the change. The distinction is what each rule is
protecting: a tool's output path must not expire when `openspec archive` renames
a directory, and a one-off measurement must not be left standing at the root
where it reads as current. A snapshot is only filed under a change once it is
final.

A top-level `metrics/` directory SHALL hold only **live instruments** — output
that something still reads. Currently that is `metrics/mutation/report.json`,
read by `docs/test-strength.md`, and `metrics/colour-inventory.md`, regenerated
by `npm run diff`. A finished round's output left at the root reads as current
measurement of the current tree, which is precisely what it is not.

A snapshot SHALL be accompanied by a note recording that it cannot be
regenerated, and that note SHALL point at something checkable in the files
rather than merely assert it. The 2026-08-01 round's three READMEs cite that
every path inside their own `summary.md` reads `src/native/…`, a tree deleted
the following day — a reader can confirm the claim without trusting it.

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

#### Scenario: A refactoring round records its baseline

- **WHEN** a change orders a metrics round
- **THEN** `npm run metrics` writes the raw tool output and a summary
- **AND** the snapshot is committed under that change's directory, not at the
  repository root

#### Scenario: A finished round's snapshot is not left at the root

- **WHEN** a round's work is archived
- **THEN** its dated snapshot is archived with it
- **AND** the top-level `metrics/` directory contains only output that something
  still reads

#### Scenario: The metrics harness is not in the gate

- **WHEN** a commit is made
- **THEN** the pre-commit gate does not run the metrics harness
- **AND** the round-over-round diff remains the harness's purpose

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

### Requirement: The app builds from a clean checkout with no toolchain but Node

A clean checkout SHALL build the complete app — every game, every help page, the
service worker and the PWA assets — with **`npm install` as the entire setup**.
No native toolchain, no system package, and no generated artefact SHALL be
required, at config-load time or at build time.

Nothing is generated any more. The game catalog is committed TypeScript source
(`src/puzzle/catalog-data.ts`), the per-puzzle icons are a committed snapshot,
and the help pages are committed markdown. With the halibut manual deleted there
is no asset build at all: `npm run build:assets`, `scripts/build-manual.sh` and
`Brewfile` are removed, halibut having been the Brewfile's only remaining entry
and the manual its only consumer.

This is the end of a sequence worth recording, because each step looked like a
small cleanup and the property only arrived when the last one landed: the
Emscripten toolchain went with `retire-c-engine`, the CMake tree and the icon
pipeline before it, the generated `catalog.json` became committed source, and the
manual was the last generated artefact standing. A build that needs a system
package is a build that fails differently on every contributor's machine, and
until now this repository needed one to be complete.

The build configuration SHALL NOT depend on any generated, gitignored artefact at
config-load time.

#### Scenario: A clean checkout builds with nothing installed but Node

- **WHEN** the app is built from a fresh clone on a machine with no `brew bundle
  install`, no Emscripten, and no halibut
- **THEN** `npm install && npm run build` produces the complete app
- **AND** every game and every help page is present in `dist/`
- **AND** nothing is missing or degraded relative to a machine that has those
  tools

#### Scenario: No artefact is generated into the source tree

- **WHEN** the repository is inspected after a build
- **THEN** `src/assets/` holds only committed files
- **AND** `.gitignore` carries no rule for a generated directory under `src/`

