# build-pipeline Specification

## Purpose

**How this repository decides that a tree is fit to commit, publish and run —
and what that decision is allowed to cost.**

It governs the gate — defined by `scripts/gate.sh` and listed, with the reason
for each step, in `AGENTS.md` § "Git" — which runs identically in the
pre-commit hook and in CI; the rule that no correctness check may be dropped or
weakened to buy speed, and the narrow scopings that are permitted instead; how a
test earns its place on the per-commit path, and how one is retired or deferred
by measurement rather than by category; the on-demand instruments that are
deliberately *not* gates (`npm run metrics`, `npm run probe`, `npm run diff`) and
must never be ratcheted; the build's independence from any native toolchain; and
the deploy, which publishes the gate's own artifact and is verified against the
deployed origin rather than against `dist/`.

Two things it deliberately does not govern: which *individual* tests a commit
runs (see the gate requirement — graph-based selection is unproven against this
repo's glob-based cross-game guards and is not authorized), and what any single
test asserts, which belongs to the capability spec that test serves.

## Requirements

### Requirement: Continuous integration runs the full gate on push to main

The repository SHALL provide a GitHub Actions workflow that, on every push to
`main`, runs the same gate as the husky pre-commit hook — `npm run gate`, whose
steps are defined by `scripts/gate.sh` and are not restated here (see the
gate requirement below for why).

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

### Requirement: The pre-commit gate minimizes wall-clock without dropping checks

The pre-commit gate SHALL run **every check `scripts/gate.sh` defines** and block
a commit on any failure — with the single documentation-only exception scoped
below — while being orchestrated to reduce wall-clock: the cheap checks run first
as a fail-fast prefix, cheapest first, so a type, lint, formatting or guard
failure costs seconds rather than the whole gate; and the two heavy,
mutually-independent checks (`vitest run` and `vite build`, which share no inputs
or outputs) SHALL run **concurrently**, making the gate's wall-clock
~max(vitest, build) rather than their sum.

**This requirement deliberately does not list the checks, and the reason is that
it used to.** It read "SHALL run all six checks (`tsc -b --noEmit`, biome,
`npm run probe -- --verify`, the spelling guard, `vitest run`, `vite build`)" —
a bare count in the present tense, which `AGENTS.md` § "Method" calls a census
nobody re-runs. By 2026-09-09 the gate ran eleven, the named compiler had been
replaced by `tsgo` thirty-five days earlier, and four more prose copies of the
same list elsewhere in the tree had each rotted differently. **The list has one
executable definition (`scripts/gate.sh`) and one readable one (`AGENTS.md`
§ "Git", which carries the per-step rationale); a spec states the gate's
properties instead.**

Membership is therefore normative *per check*: a guard belongs in the gate
because its own capability requirement says so, and this requirement says only
that the gate runs all of them, fails closed, and is ordered fast-first. That is
also what stops a check being quietly dropped — deleting one now contradicts the
requirement that introduced it, rather than a count in a neighbor's prose.

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
  invites tests written against the number rather than against behavior, which
  the `repo-layout` requirement it serves explicitly forbids. A survivor is a
  finding to read; only a case that no longer applies is a failure.

The spelling guard (`scripts/checks/spelling.mjs`, ~1 s) scans every tracked
file outside the record and other people's words for a British stem, per the
`repo-layout` spelling requirement. It SHALL run in the fast prefix, ahead of
the documentation-only shortcut, because the shortcut skips `vitest run` and a
test may not read `docs/` or `openspec/` at all — so a vitest guard would be
blind to exactly the commits most likely to reintroduce a British spelling.

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
and is NOT authorized by this requirement. The cross-game guards here reach
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
probed the 1-minute load average and serialized on a busy box, because
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

- **WHEN** the pre-commit gate runs after its fail-fast prefix passes
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
- **BECAUSE** the per-commit scope is a per-commit optimization, not a relaxation
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

#### Scenario: A documentation-only commit is still spell-checked

- **WHEN** a commit stages only `docs/`, `openspec/` or the root agent files,
  and one of them carries a British spelling outside an allowance
- **THEN** the spelling guard fails in the fast prefix and blocks the commit,
  before the documentation-only shortcut is reached

### Requirement: Refactoring metrics are measured on demand and ratcheted in the gate

The repository SHALL provide an on-demand metrics harness (`npm run metrics`,
orchestrated by `scripts/metrics.sh`) that records code-health measurements —
duplication, import cycles, dead code, and cognitive complexity — as raw tool
output, committed to the repository.

A **round's** dated snapshot SHALL be committed under the openspec change that
produced it, and SHALL travel into the archive with that change. A snapshot is
evidence for a piece of work, not a standing repository artifact: its value is
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
read by `docs/test-strength.md`, and `metrics/color-inventory.md`, regenerated
by `npm run diff`. A finished round's output left at the root reads as current
measurement of the current tree, which is precisely what it is not.

A snapshot SHALL be accompanied by a note recording that it cannot be
regenerated, and that note SHALL point at something checkable in the files
rather than merely assert it. The 2026-08-01 round's three READMEs cite that
every path inside their own `summary.md` reads `src/native/…`, a tree deleted
the following day — a reader can confirm the claim without trusting it.

The harness SHALL NOT be part of the pre-commit gate or of CI's blocking checks.
Its value is the **diff between rounds**, not per-commit freshness, and adding a
slow whole-tree scan to a gate that is explicitly optimized for wall-clock would
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
   the behavior change; or
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
- **AND** the finding is recorded as an analysis artifact rather than re-triaged
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
- **BECAUSE** the failure this optimization most easily causes is a test that
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
No native toolchain, no system package, and no generated artifact SHALL be
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
manual was the last generated artifact standing. A build that needs a system
package is a build that fails differently on every contributor's machine, and
until now this repository needed one to be complete.

The build configuration SHALL NOT depend on any generated, gitignored artifact at
config-load time.

#### Scenario: A clean checkout builds with nothing installed but Node

- **WHEN** the app is built from a fresh clone on a machine with no `brew bundle
  install`, no Emscripten, and no halibut
- **THEN** `npm install && npm run build` produces the complete app
- **AND** every game and every help page is present in `dist/`
- **AND** nothing is missing or degraded relative to a machine that has those
  tools

#### Scenario: No artifact is generated into the source tree

- **WHEN** the repository is inspected after a build
- **THEN** `src/assets/` holds only committed files
- **AND** `.gitignore` carries no rule for a generated directory under `src/`

### Requirement: The typechecker sees every TypeScript file in the repository

Every `.ts` / `.mts` file in the repository SHALL belong to a TypeScript project
the gate checks. A file outside every project's `include` is checked by nothing —
not the gate, not CI, not `npm run typecheck` — and the only thing that notices
is an editor applying its own fallback options, whose diagnostics then disagree
with the build in both directions.

The build-side files — the vite and vitest configs, the vite plugins, and the
advisory checks that run outside the gate — SHALL be a **separate project** from
the app rather than folded into it, because the app's project is deliberately
browser-shaped (`"types": []`, a DOM lib) and that posture is relied upon: tests
here read source through `import.meta.glob` rather than `node:fs` specifically to
stay inside it. The separation SHALL be by runtime only; every strictness flag
SHALL be identical, so a file does not become more permissive by being a build
file.

This is required because the gap hid live defects rather than merely risking
them. When the build-side files were first checked, the config that renders every
help page and static entry carried a `build.rollupOptions.output.validate`
setting that had had no effect since the bundler changed under it — a rollup
option this project's rolldown-based Vite neither declares nor reads.

Where a build tool's published type is **narrower than its implementation**, the
option SHALL be kept and its type widened at the one property, with the evidence
that the option is live recorded beside it. It SHALL NOT be deleted on the
strength of the type alone, and it SHALL NOT be preserved by asserting the type
of its whole containing object, which stops checking every sibling key. The
distinction is not academic: of the two unknown properties this requirement's
change found, one was genuinely dead and one was a live browser-bug workaround,
and the type said the same thing about both.

#### Scenario: A build-side file gains a type error

- **WHEN** a change introduces a type error in a vite config, a vite plugin, or
  a check under `scripts/checks/`
- **THEN** the gate's typecheck fails

#### Scenario: The app's type world stays browser-shaped

- **WHEN** the build-side project is configured
- **THEN** it is a separate project with a Node runtime
- **AND** the app's project still declares no ambient Node types

#### Scenario: An option the bundler's type does not declare

- **WHEN** the typechecker rejects a build option as an unknown property
- **THEN** whether the tool's implementation still reads it is established
  before anything is changed
- **AND** a dead option is deleted, while a live one is kept with its type
  widened at that property alone and the evidence recorded

### Requirement: Every asset the build emits is precached, or the build fails

The production build SHALL verify that every file it writes to the output
directory appears in the service worker's precache manifest, and SHALL fail
otherwise. Files a page genuinely never loads MAY be excluded, and the
exclusions SHALL be shared with Workbox's own `globIgnores` rather than restated
beside them.

Offline is one of this app's two reasons for existing, and it rests on a single
extension allowlist. **An asset whose extension is missing from that list still
builds and still ships**; it is only absent from the manifest, so it loads
perfectly online and is silently missing offline. Nothing in the type checker,
the linter or the test suite can see it, because nothing is wrong with the file.

This is not hypothetical. `implement-front-page-and-chrome` self-hosted three
IBM Plex `woff2` faces *specifically* so that offline would match online, and
the allowlist had no `woff2` in it; the first run of this check also found that
`favicon.ico` had never been precached either. Two gaps, one of them years old,
neither visible from anywhere else.

The check SHALL run against the **built output** and the **generated service
worker**, not against the configuration, because the configuration is the thing
being checked. It SHALL report the offending file *extensions* rather than the
files, since the fix is always to the allowlist and a list of hashed filenames
buries it. It SHALL fail on its own input count, so a listing that matches
nothing cannot report health. Its exclusion ledger SHALL be held to being
exactly right — an unconditional entry matching no file fails — with entries
that are only emitted under some configurations marked as such, so the check
does not have to be weakened to survive an ordinary local build.

#### Scenario: A new asset type ships outside the offline cache

- **WHEN** the build emits a file whose extension is not in the precache
  allowlist and is not deliberately excluded
- **THEN** the build fails, naming the extension and an example file

#### Scenario: The exclusions are one list

- **WHEN** a file is deliberately kept out of the precache
- **THEN** the same declaration is what Workbox skips and what the check skips

#### Scenario: The check cannot pass over nothing

- **WHEN** the output listing finds implausibly few files
- **THEN** the build fails on the count rather than reporting coverage

### Requirement: The app is published from a green gate, and the publish is verified on the deployed origin

The app SHALL be deployed to a public HTTPS origin, and the deploy SHALL be
gated on `npm run gate` passing for that commit — a build that has not passed
the gate must not reach the URL people use. The publish SHALL reuse CI's gate
job rather than restating it, so the two cannot drift into disagreeing about
what "green" means.

Verification SHALL be performed **against the deployed origin**, not against a
local build, for the four things that fail silently there:

- a route loads by its **clean URL** (`/pegs` served from `pegs.html`) —
  extensionless resolution is host behavior and is a configuration switch on
  some hosts, so it is checked, never assumed;
- the **security headers arrive** as headers, confirmed by inspecting the
  response, not inferred from `dist/_headers` existing in the output;
- the **service worker registers on that origin** and the app opens with the
  network off — registration is scope- and `base`-sensitive, and a local preview
  does not exercise either;
- the **canonical-URL-gated artifacts** (`sitemap.xml`, `robots.txt`) are
  present, since they are emitted only when `VITE_CANONICAL_BASE_URL` is set and
  their absence is invisible.

#### Scenario: A failing gate does not reach the public URL

- **WHEN** a commit lands on `main` whose gate fails
- **THEN** no deploy is published for that commit

#### Scenario: A puzzle route is reachable by its clean URL

- **WHEN** the deployed origin is asked for a puzzle route with no `.html`
  extension
- **THEN** the corresponding page is served

### Requirement: A host that cannot deliver the security headers is a recorded decision

The build emits `dist/_headers` — the Content-Security-Policy, the
cache-control policy for immutable asset paths, and the rest of the security
headers — in the format one specific host reads. A host that cannot set response
headers, or that reads a different format, SHALL NOT be adopted silently: either
the rules are translated into that host's own configuration, or the loss is
stated as a decision with its cost.

The failure this prevents is specific: `_headers` remains present in the build
output whatever host is chosen, so an inert copy of it looks exactly like a
working one. Nothing a visitor can see changes when the CSP stops being
delivered.

The cache-control rules SHALL be translated alongside the CSP when a translation
is needed. Hashed asset paths are `immutable` for a year and the HTML entry
points are not; inverting that ships an app that cannot update itself.

#### Scenario: Adopting a host without header support

- **WHEN** a host is chosen that cannot deliver the emitted headers
- **THEN** the loss is recorded in the change's design with what it costs, and
  the headers are not left looking as though they apply

### Requirement: The content security policy grants only origins the app loads

Every origin named in the CSP SHALL correspond to something the app actually
loads, and an origin that is conditional on configuration SHALL be added
conditionally — as the Sentry origin is added only when `VITE_SENTRY_DSN` is
set.

This is not hypothetical tidiness. The policy inherited from the upstream fork
grants `https://static.cloudflareinsights.com` a `script-src` and
`https://cloudflareinsights.com` a `connect-src` unconditionally, for an
analytics vendor this fork has not chosen and does not load. A policy that
whitelists an unused third-party script origin is strictly weaker than one that
does not, for no benefit.

#### Scenario: An unused vendor origin is not whitelisted

- **WHEN** the app is built with no analytics block configured
- **THEN** the emitted CSP names no analytics vendor origin

### Requirement: The emitted header rules do not grow with the catalog

The `_headers` file the build emits SHALL contain a number of rules that does
not depend on how many puzzles the catalog holds, and the build SHALL fail if
the rendered file exceeds the host's rule limit.

The limit is a parser limit rather than a quota — Cloudflare reads at most 100
rules, identically on Pages and on Workers static assets and identically on
every plan — so it cannot be raised by migrating or by paying, and rules past it
are dropped with no error and no visible change. A file carrying one rule per
puzzle entry page therefore converts that parser limit into a limit on the
number of **games**, which is a constraint the collection must never acquire by
accident.

Nothing about a cache policy depends on the size of the catalog. Where a broad
rule and a narrow rule would otherwise merge, the broad rule SHALL carry the
value the many paths want and the few exceptions SHALL detach and replace it,
rather than the reverse — which is what makes the per-page rule unnecessary.

The rule count SHALL be asserted by the build rather than recorded in a comment,
and the assertion SHALL carry a vacuity guard, since a render producing no rules
would otherwise satisfy a limit check while measuring nothing.

#### Scenario: A build whose header rules would be silently truncated

- **WHEN** the rendered `_headers` file contains more rules than the host will
  parse
- **THEN** the build fails, naming the count and the limit

#### Scenario: Adding a puzzle does not add a header rule

- **WHEN** a puzzle is added to the catalog
- **THEN** the number of rules in the emitted `_headers` file is unchanged

### Requirement: A test is retired or deferred by measurement, never by category

A test SHALL be judged by what it would catch in a refactor that **no cheaper
test would**, and never by the era or the category it belongs to. "It was
written for the port" is not by itself a reason: the frozen `c-reference`
differentials are porting artifacts *and* the strongest net under solver
refactoring, because a change to a solver's verdict changes which boards exist.

Before anything is retired or deferred, the population SHALL be **ranked and
counted** — how many test files were examined, and how many classified — so an
audit cannot quietly look at the dozen files somebody remembered.

Measured 2026-09-09 over all 301 test files, and recorded here because it is the
result a later session would otherwise re-derive: the differentials are **10.1%**
of suite time across 50 files, with the heaviest single one at 11.5 s CPU. The
category most obviously "porting-era" was therefore the cheap half, and retiring
by category would have cut it while leaving the expense untouched.

#### Scenario: A retirement is proposed for a category of tests

- **WHEN** a change proposes to retire tests because of what they were written for
- **THEN** it ranks the population by measured cost first, and answers per file
  what that file uniquely protects
- **BECAUSE** the era a test was written in does not predict what it catches, and
  here the two were anti-correlated

#### Scenario: A configuration would lose its last cover

- **WHEN** retiring or deferring a test would leave a mode, grid type, difficulty
  or board size with nothing asserting it on every commit
- **THEN** the test stays, however slow, unless the change names the test that
  still covers that configuration at the site of the change
- **BECAUSE** a silently removed configuration reads identically to one that was
  never covered

### Requirement: Suite cost is attributed per game, and quoted in CPU

A measurement of what the test suite costs SHALL attribute each cross-game
guard's per-game case to **the game it names**, not to the file or directory the
guard lives in. The guards title their cases `"<gameId>: …"`, which is the join
key.

Attribution by directory reports the cross-game guards as undifferentiated
engine cost and hides which game makes them expensive: measured 2026-09-09,
Sixteen is 17% of suite time by directory and **30%** once its cases inside
`hint-resume.test.ts` and `hint-quality.test.ts` are counted, and three games
account for 52% of all test time.

Every cost figure SHALL be **CPU (`user + sys`)** from `/usr/bin/time` on a
single-file run, **measured on a quiet box, with the load average stated**.
Wall clock on a shared box measures the contention, and it does so *unevenly* —
in the same run one file inflated 5.2× and another 1.6× — so a contended wall
figure distorts the ranking, not merely the total. Summed per-test duration
remains permissible for **locating** cost, and for nothing else.

**CPU is the better instrument, not an immune one, and the reason names the
resource that actually matters.** Corrected 2026-09-09 by re-measuring two files
that no change had touched: `input-parity.test.ts` read 40.5 s under pressure
and **22.4 s** without, `hint-ordinal.test.ts` 25.2 s and **14.8 s** — an
inflation of **1.7–1.8×**, against wall clock's 5×.

The cause is **memory, not cores**. The box has 16 GB of RAM and was 23.9 GB
into swap with ~65 MB free; under paging, `sys` time *is* page-fault time, so
`user + sys` re-imports the contention that switching away from wall clock was
meant to remove. Load average is a proxy for the wrong variable.

A cost measurement SHALL therefore record **free memory and swap in use**
alongside the load average, and SHALL treat a figure taken under paging as an
upper bound rather than a measurement. Three consequences, all learned by
getting this wrong:

- **A ratio between two figures taken under comparable conditions survives; an
  absolute second does not.** The change that wrote this requirement had sound
  per-file percentages and absolute totals ~1.7× high.
- **Recording the conditions is what makes an error recoverable** rather than
  merely suspected, which is why it is a SHALL and not advice.
- **Ask which resource is scarce before choosing the instrument.** The unit was
  correct at every step here (seconds of CPU); what went unexamined was whether
  cores or memory were the constraint, and that is what made three successive
  instruments wrong.

#### Scenario: A suite-cost finding is reported

- **WHEN** a change reports what a test file or a game costs the suite
- **THEN** the figure is CPU time, and the machine's load at the time is stated
- **BECAUSE** the first figure ever recorded for this question was taken at load
  533 and measured the contention

### Requirement: The opt-in slow tier is invokable for one area at a time

`npm run test:slow` SHALL forward its arguments to the test runner, and the
targeted form SHALL be documented where the tier is defined, because the bare
command re-runs the **entire** gate suite as well as the deferred cases and the
widened seed budgets.

Measured 2026-09-09: the deferred tier is **six tests in three files**, while the
command that runs it also runs 8,504 gate tests with the heaviest files
multiplied 3–7.5×. A change that defers work into the tier SHALL therefore say
which targeted invocation exercises it — `npm run test:slow -- <path>` — rather
than relying on a whole-tier run that a person will decline to wait for.

#### Scenario: Work is deferred into the slow tier

- **WHEN** a test or fixture is moved out of the per-commit path
- **THEN** the change names the targeted command that runs it, and the site
  states what still covers the configuration on every commit
- **BECAUSE** a tier nobody invokes is not coverage, and a tier that can only be
  invoked whole is a tier nobody invokes

### Requirement: A cross-game guard bounds its cost on the axis the game varies

Where a cross-game guard walks a game's presets, it SHALL slice them on the axis
that game actually varies, and it SHALL derive any cost exemption from a
property the game already has rather than from a list of game ids.

A hint that plans by **searching** pays for board size twice over — one full
search per move, and more moves to make on a bigger board — while a guard that
recomputes a hint after every move multiplies exactly that. Such games SHALL be
sliced by board size in the gate and walked in full in the slow tier, with the
population derived from the game's own source (`SEARCH_PLANNING_GAMES` reads
each game for a call to the shared slide planner) rather than declared.

The reason a member is sliced, and the test that still covers its largest board
on every commit, SHALL be recorded **per member**, with the derivation asserted
to be exactly the ledger — so a game that later joins the mechanic fails the
guard until someone writes that sentence.

#### Scenario: A game joins the searching-hint population

- **WHEN** a new game's hint calls the shared slide planner
- **THEN** it is enrolled by the derivation automatically, and the ledger's
  equality assertion fails until its entry names what covers its largest board
- **BECAUSE** an exemption roster rots exactly as quietly as the membership
  roster it replaced

### Requirement: Import-graph selection alone is unsound here, and is used only in a union

Selecting which tests a commit runs by walking the **static import graph**
alone (`vitest related`, `vitest --changed`, or any equivalent) SHALL NOT be
adopted. The demonstration the gate requirement asks for has been run and it
fails.

Measured 2026-09-09 with the installed `vitest related`:

- **A game source change** (`src/games/sixteen/index.ts`) selects 33 of 301 test
  files, and omits every cross-game guard that reads game source as *text*
  through `import.meta.glob` while importing nothing from `games/` — among them
  the two palette guards, `palette-override-claims`, `hint-refusal` and
  `note-vocabulary`.
- **A help page change** (`help/games/sixteen.md`) selects **nothing at all**,
  while three guards exist to check those files — including
  `help-coverage.test.ts`, which holds the help directory and the catalog to
  each other in both directions.

The cause is structural rather than incidental, and it follows from a rule this
project holds deliberately: a cross-game guard finds its population by reading
**what a game is**, including its own source text, never a manifest. 26 test
files therefore reach their subjects through `import.meta.glob(..., "?raw")`,
and a file read as text forms no import edge. The design that makes these guards
impossible to forget is the same design that makes them invisible to import-graph
selection.

**What has changed is that the missing channel turned out to be derivable.**
Every `import.meta.glob` call in the tree takes a literal pattern — a string, or
an array of strings — so the couplings the graph cannot see can be enumerated
statically. The graph is therefore permitted **as one term of a union** with a
glob-reach channel, never on its own; the union is specified in "The pre-commit
hook may run a selected subset of the suite".

A scheme that selects on what a test **actually read at runtime** remains
acceptable too. Any such scheme SHALL be accepted only against the two
experiments above, and SHALL treat an unclassifiable change as "run everything"
rather than "run nothing".

This requirement bounds *test selection* only. It does not restrict the gate's
existing role-scoping — biome staged-versus-whole-tree, and the
documentation-only shortcut — which are permitted because their safety is
asserted rather than assumed.

#### Scenario: A test-impact selector is proposed

- **WHEN** a change proposes to run only the tests downstream of a commit
- **THEN** it is run against a game source change and a `help/` change, and
  adopted only if it selects the glob-based guards for both
- **BECAUSE** the guards this project most relies on are exactly the ones a
  static graph cannot see, and switching them off is silent

#### Scenario: A commit touches only help pages

- **WHEN** a selector reports no tests for a change under `help/`
- **THEN** the selector is rejected rather than the guards skipped
- **BECAUSE** `help/` is a build input and `help-coverage.test.ts`'s subject,
  which is why it is already excluded from the documentation-only shortcut

### Requirement: The pre-commit hook may run a selected subset of the suite

The **automatic per-commit hook** MAY run only the test files a commit can have
broken. CI and a manual `npm run gate` SHALL continue to run the whole suite, so
the guarantee on `main` is unchanged — the same backstop argument that already
scopes biome to staged files in the hook and to the whole tree in CI.

The selection SHALL be the **union of two channels**, because neither is
sufficient alone:

1. the static import graph, via `vitest list --changed`;
2. every test whose `import.meta.glob` pattern reaches a staged path.

The glob channel SHALL match by the pattern's **literal base directory** — the
prefix before its first wildcard — rather than by evaluating the pattern. A
matcher for Vite's glob syntax is a component that can be subtly wrong, and
being subtly wrong here means silently not running a guard; matching by base
directory can only ever select *more* tests.

The selector SHALL **fail closed**, resolving to the whole suite whenever: a
staged path lies outside the directories it models, the union is empty, or
anything at all goes wrong.

A test SHALL NOT reach its subject through a channel the selector cannot model.
A guard SHALL assert this by reading the tree — failing on a computed
`import.meta.glob` pattern, or on a direct filesystem read from a test inside the
gate's `include` — and SHALL be shown to fail before it is trusted.

#### Scenario: A commit changes a help page

- **WHEN** only files under `help/` are staged
- **THEN** the guards that glob `help/` are selected and run
- **BECAUSE** the import graph alone selects nothing for such a change, which is
  the defect that made graph-only selection unusable

#### Scenario: A commit touches a file the selector does not model

- **WHEN** a staged path lies outside the modeled directories — a config file, a
  template, a script
- **THEN** the whole suite runs
- **BECAUSE** a wrong "everything" costs minutes and a wrong subset costs a guard

#### Scenario: A test acquires an unmodeled read channel

- **WHEN** a test is written with a computed glob pattern, or reads the
  filesystem directly
- **THEN** the guard fails the build and names the file
- **BECAUSE** the coupling would otherwise be invisible to the selector, and the
  commit that broke it would pass without ever running it

### Requirement: The gate rejects a test whose every assertion is conditional
The gate SHALL fail on a test whose every assertion sits behind a condition
without the test also asserting how many cases it examined, and the check SHALL
carry a floor on the test files and the tests it scanned.

A test that cannot fail passes forever while asserting nothing, and nothing in
the suite notices, because a green test and a vacuous one are the same
observation. Measured during `tidy-the-code-after-the-port`: thirteen games
carried one, found only because an agent planted a defect in each game and
watched for red.

**Which shapes are guarded SHALL be decided by measuring against that corpus, not
by how confident a shape looks.** Measured 2026-09-12 by running each candidate
over every one of those games' test files as they stood at the tidy commit's
parent and again at the commit: "both sides of an assertion are one expression"
caught **0 of 13** and reported five sites, all of them sound determinism checks;
"a bound the type guarantees" caught **0 of 13** and reported eleven, all already
reviewed by an earlier change; "every assertion conditional" caught **5 of 13**.
Only the third is built.

A condition means an `if`, and equally `if (…) continue;` or `if (…) return;` —
the same guard written the other way round. Reading only the first spelling is
the wrong-key failure `AGENTS.md` § "A scan that keys on a name" describes; it
sees four of one game's five reason scans and misses the fifth.

#### Scenario: a test scans for a case and finds none

- **WHEN** a test's assertions run only inside a conditional
- **THEN** the gate fails unless the test also asserts the number of cases it
  examined, outside that conditional
- **AND** a fixture that stops producing the case then fails rather than passing
  silently

#### Scenario: a test has already written its own vacuity guard

- **WHEN** a scan returns on finding its case and ends in an unconditional
  `throw`, or an `if`/`else` asserts on both branches
- **THEN** the guard is silent, because one of those paths always runs
- **AND** the exemption is derived from the syntax rather than held in a roster

#### Scenario: a test genuinely cannot count what it examined

- **WHEN** the healthy state of the system is that the condition never fires
- **THEN** the test is carried in the guard's ledger with the reason, keyed on
  its title rather than its line, so the entry survives edits above it
- **AND** the ledger is asserted exactly equal to the guard's findings, so an
  entry that stops being needed fails as loudly as a new offender

#### Scenario: the guard is proven before it is trusted

- **WHEN** the guard runs
- **THEN** it first checks itself against fixtures for every shape it claims to
  catch and every exemption it claims to make, and fails if any behaves wrongly
- **AND** a guard about tests that cannot fail is therefore never one itself
