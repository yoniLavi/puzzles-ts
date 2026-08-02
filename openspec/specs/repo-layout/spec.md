# repo-layout Specification

## Purpose
TBD - created by archiving change reorganize-repo-tooling. Update Purpose after archive.
## Requirements
### Requirement: Repo root holds product-level config only

The repository root SHALL hold only files that conventionally belong at
the top level of a Node/TypeScript project: package manifests
(`package.json`, `package-lock.json`), language config (`tsconfig.json`,
`vitest.config.ts`, `vite.config.ts`, `biome.json`), runtime/system
declarations (`.gitignore`, `.gitattributes`, `.husky/`, `Brewfile`,
`.nvmrc`), top-level documentation (`README.md`, `LICENSE.md`,
`CREDITS.md`, `AGENTS.md`, `CLAUDE.md`), and entry-point directories
(`src/`, `public/`, `help/`, `licences/`, `scripts/`, `openspec/`,
`templates/`, `vite-plugins/`, `docs/`).

The build output directory is `dist/`, and it is gitignored. `build/` is not
among the entry-point directories: it was the partition for the Emscripten and
native-harness outputs, `retire-c-engine` emptied it, and it was retained "for
whatever comes next" — which is a slot with no occupant. Listing it while
omitting `dist/` had the spec naming the empty directory and not the real one.

**Configuration for a removed toolchain SHALL be removed with it.** A formatter
config, an ignore rule, an editor setting or a generated index that exists only
to serve a deleted build is not neutral once that build is gone: nothing fails,
and every one of them tells the next reader the toolchain is still here. This
covers, concretely, that the repository holds no C/C++ formatter configuration
(`.clang-format`), no ignore entries for `build/` or the clangd `.cache/` index,
and no editor setting pointing at a source tree that no longer exists.

`puzzles/` is no longer among them. It was the frozen subtree of upstream's C
collection; `retire-c-engine` deleted the C, `rehome-upstream-help-sources`
moved the help sources it was left holding to `help/upstream/` and the MIT
notices to `licences/`, and the directory went with them. A directory named for
a source tree that no longer exists is a false signal, not a neutral one.

Upstream licence notices SHALL live in `licences/`, one file per upstream
project, byte-identical to what that project ships, with a README recording what
each one covers. They are kept verbatim to honour MIT's "included in all copies"
condition, and they are **live build inputs** — the About dialog `?raw`-imports
them and shows them to players — so they are not archive material and SHALL NOT
be filed as such.

`PLAN.md` is no longer a top-level file: its strategic content (Goal,
Lineage, Approach, Test discipline, Seam order, What's been done,
Known unresolved questions, License & attribution) lives in `AGENTS.md`
under the corresponding sections. The Agent-facing documentation
requirement covers the AGENTS.md/CLAUDE.md pair.

Build-helper scripts, plugin source, and Handlebars templates SHALL
NOT live loose at the root. Specifically:

- Vite plugin source SHALL live under `vite-plugins/` (one file per
  plugin, named without the redundant `vite-` prefix, e.g.
  `vite-plugins/extra-pages.ts`).
- Handlebars templates consumed by the Vite pipeline's `renderHandlebars`
  transform SHALL live under `templates/` (currently
  `templates/index.html.hbs`, `templates/puzzle.html.hbs`,
  `templates/_headers.txt.hbs`).
- Static HTML pages that vite consumes as direct rollup inputs MAY stay
  at the root. `unsupported.html` falls in this category: it is listed
  in `rollupOptions.input` and emitted to `dist/unsupported.html`, and
  `vite-plugin-sitemap` enumerates rollup outputs in a way that breaks
  when this input lives under a subdirectory.

Developer-facing prose guides (the *how-to* of porting and feature work,
distinct from the `/help` in-app user docs) SHALL live under `docs/`.

#### Scenario: New top-level files are flagged for review

- **WHEN** a change proposes a new file at the repository root
- **THEN** the file MUST fit one of the categories listed above (config,
  manifest, top-level docs, or entry-point directory)
- **AND** if it does not, the proposal MUST justify why an existing
  subdirectory (`vite-plugins/`, `templates/`, `scripts/`, `docs/`, or a
  new named directory) is not the right home

#### Scenario: No configuration outlives the toolchain it configured

- **WHEN** a toolchain is removed from the repository
- **THEN** its formatter configuration, ignore entries, editor settings and
  generated indexes are removed in the same change
- **AND** `git ls-files .clang-format` returns no rows, there being no C or C++
  in the tree

#### Scenario: Templates are not entry points

- **WHEN** Vite is configured
- **THEN** `templates/*.html` files are not enumerated as Vite multi-page
  inputs by default; they are pulled in explicitly by the
  `extra-pages` plugin or by the `unsupported.html` allowlist
- **AND** moving the templates from the root into `templates/` does not
  change the set of pages emitted to `dist/`

#### Scenario: PLAN.md is not at the root

- **WHEN** the change has landed
- **THEN** `git ls-files PLAN.md` returns no rows
- **AND** the strategic content formerly in `PLAN.md` is discoverable
  by reading `AGENTS.md`

#### Scenario: `puzzles/` is not at the root

- **WHEN** the repository is inspected after the help sources are rehomed
- **THEN** `git ls-files puzzles/` returns no rows
- **AND** the upstream MIT notices are readable under `licences/`

### Requirement: Cloudflare Pages tooling is not maintained in-tree

The repository SHALL NOT ship Cloudflare Pages configuration or local
preview tooling. The CF Pages workflow is disabled in this fork (per
PLAN.md "What's been done"), and the user's current hosting plan does
not include CF Pages.

Specifically:

- No `wrangler.toml` at the repository root.
- No `wrangler` package in `dependencies` or `devDependencies` of
  `package.json`.
- No `preview:pages` (or similarly named) script that invokes
  `wrangler`.

Standard Vite preview (`npm run preview`) covers the local-preview
need for the PWA.

#### Scenario: Wrangler is absent from the repo

- **WHEN** the change has landed
- **THEN** `git grep -i 'wrangler\|cloudflare'` returns no hits in
  tracked files outside `openspec/changes/archive/` (where historical
  proposals may reference removed setups)
- **AND** `npm install` does not pull wrangler into `node_modules/`

#### Scenario: Reviving CF Pages is a new proposal

- **WHEN** a contributor wants to restore CF Pages support
- **THEN** they SHALL open a new openspec change that re-adds
  `wrangler.toml`, the wrangler devDep, and a `preview:pages` script,
  along with whatever production deploy workflow is intended
- **AND** they SHALL NOT just resurrect the removed files in a regular
  PR

### Requirement: Source tree under `src/` groups files by UI role

`src/` SHALL group TypeScript files by the role they play, not by
filename pattern. The role-based subdirectories are:

- `src/screens/` — top-level screen components (one per HTML page) and
  the base class they extend. Currently: `screen.ts` (base),
  `home-screen.ts`, `puzzle-screen.ts`. Future per-screen Lit
  components belong here.
- `src/dialogs/` — modal / popover Lit components shown as overlays from
  one or more screens. Currently: `about-dialog.ts`, `alert-dialog.ts`,
  `crash-dialog.ts`, `enter-gameid-dialog.ts`,
  `saved-game-dialogs.ts`, `settings-dialog.ts`, `share-dialog.ts`.
- `src/components/` — reusable leaf Lit components that don't fit
  screen-or-dialog. Currently: `catalog-card.ts`, `command-link.ts`,
  `dynamic-content.ts`, `head-matter.ts`, `help-viewer.ts`,
  `saved-game-list.ts`.

The following kinds of files SHALL stay at `src/` root, not under a
subdirectory, because they are entry points or cross-cutting:

- HTML page entries referenced by `templates/*.html.hbs` (currently
  `home-page.ts`, `puzzle-page.ts`).
- The main bootstrap (`main.ts`), the old-browser preflight gate
  (`preflight.ts`), and the service worker (`sw.ts`).
- Cross-cutting modules with no single-screen owner: `routing.ts`,
  `color-scheme.ts`, `color-scheme-init.ts`, `icons.ts`.
- Ambient-type files such as `vite-env.d.ts`.

Existing subdirectories with non-UI scope SHALL keep their shape:
`src/assets/` (generated), `src/css/` (styles), `src/puzzle/` (the
main-thread puzzle runtime: the `Puzzle` object, the Comlink worker host,
the canvas `Drawing`, and the worker adapter), `src/store/` (Dexie
schema), `src/utils/` (general-purpose helpers).

The puzzle logic — everything that runs in the worker — SHALL live in two
sibling directories at `src/` root:

- `src/engine/` — the TS midend, the `Game` interface, the per-game
  registry, the save codec, the drawing/colour/palette contracts, the
  engine's own type vocabulary (`types.ts`), and the shared solver and
  generator libraries, with behavioural `*.test.ts` colocated. Shared
  leaf libraries ported from upstream (`random/`, `combi/`) are engine
  libraries and live under it, each keeping its own frozen
  characterization corpus where it has one.
- `src/games/<puzzleId>/` — one folder per game (the `Game`
  implementation and its behavioural `*.test.ts`), named by catalog
  `puzzleId`.

`src/native/` SHALL NOT exist. It was named for the distinction between
*native TypeScript* and *the C compiled to WASM*; `retire-c-engine`
deleted the other half, so the name partitioned the tree into "all the
code" and "the app shell" — while `src/css/native.css`, three directories
away, used the same word for native HTML elements. A directory name that
encodes a distinction the codebase no longer makes is a false signal, not
a neutral one.

There SHALL NOT be a separate top-level category for "a ported shared or
leaf module", and no module SHALL carry a `bridge.ts`. That category
existed for the bottom-up seam-by-seam migration, and its `bridge.ts`
slot held the wasm-side `--js-library` shim; both the migration and the
wasm are gone, and the category's last two occupants (`random`, `combi`)
are ordinary engine libraries. Configuration for a removed toolchain is
removed with it.

A module SHALL NOT be required to carry a `__fixtures__/`
characterization corpus captured from the native C build: per the
`ts-migration` doctrine, correctness is established by behavioural and
property tests. A module MAY keep fixtures where they aid behavioural
testing — the frozen per-game differentials and the `random`/`combi`
corpora are kept for exactly that reason — but they are not a mandated
layout element and are not an acceptance gate.

#### Scenario: A new Lit component lands in the right bucket

- **WHEN** a contributor adds a new top-level screen, dialog, or leaf
  component
- **THEN** the file is placed under `src/screens/`, `src/dialogs/`, or
  `src/components/` respectively
- **AND** the file is NOT added loose at `src/` root

#### Scenario: Page-entry script URLs in HTML templates still resolve

- **WHEN** the change has landed
- **THEN** `templates/index.html.hbs` continues to load
  `/src/home-page.ts` and `templates/puzzle.html.hbs` continues to load
  `/src/puzzle-page.ts`
- **AND** neither file moves, because both are HTML page entries

#### Scenario: Renames preserve git history

- **WHEN** files are relocated from `src/` root into a subdirectory
- **THEN** `git mv` is used (not delete + add) so
  `git log --follow <new path>` walks back into pre-move history

#### Scenario: The engine and a game land in the right place

- **WHEN** engine-level behaviour is added and, later, a game is added
- **THEN** the midend, `Game` interface, registry, save codec and shared
  libraries live under `src/engine/`
- **AND** the game lives under `src/games/<puzzleId>/` with its
  behavioural tests colocated
- **AND** neither is added loose at `src/` root

#### Scenario: A shared library is not given its own top-level directory

- **WHEN** a contributor adds a shared library used by the engine or by
  more than one game
- **THEN** it lands under `src/engine/`, not as a sibling of it
- **AND** it carries no `bridge.ts`, there being no wasm to bridge to

#### Scenario: `src/native/` is not in the tree

- **WHEN** the repository is inspected after the change has landed
- **THEN** `git ls-files src/native` returns no rows
- **AND** the only remaining use of the word "native" in a path is
  `src/css/native.css`, which means native HTML elements

### Requirement: Agent-facing documentation lives in a single AGENTS.md

The repository SHALL keep agent-facing documentation (strategic
context, conventions, constraints) in a single source-of-truth
`AGENTS.md` at the repository root. `CLAUDE.md` SHALL be a symbolic
link to `AGENTS.md` so that tools reading either name see the same
content.

The OpenSpec instruction file under `openspec/` SHALL be named
`OPENSPEC_AGENTS.md` (not `AGENTS.md`) to disambiguate from the
project-root `AGENTS.md` for tools or contributors that scan for
`AGENTS.md` recursively. The managed `<!-- OPENSPEC:START --> ...
<!-- OPENSPEC:END -->` block at the top of `AGENTS.md` SHALL reference
`@/openspec/OPENSPEC_AGENTS.md`.

#### Scenario: CLAUDE.md and AGENTS.md never drift

- **WHEN** a contributor reads `CLAUDE.md`
- **THEN** the content is identical to `AGENTS.md`
- **AND** `readlink CLAUDE.md` resolves to `AGENTS.md`

#### Scenario: openspec instructions are at OPENSPEC_AGENTS.md

- **WHEN** an AI assistant follows the managed-block reference from
  the project-root `AGENTS.md`
- **THEN** it opens `openspec/OPENSPEC_AGENTS.md`, not
  `openspec/AGENTS.md`
- **AND** `openspec/AGENTS.md` does not exist as a tracked file

#### Scenario: Running `openspec update` doesn't silently overwrite

- **WHEN** a contributor runs the upstream `openspec update` CLI
  command (which writes `openspec/AGENTS.md`)
- **THEN** the contributor SHALL re-rename the regenerated file to
  `openspec/OPENSPEC_AGENTS.md` before committing
- **AND** the managed block in the project-root `AGENTS.md`/`CLAUDE.md`
  pair SHALL be re-pointed at `@/openspec/OPENSPEC_AGENTS.md` if
  `openspec update` reset it

### Requirement: Behaviour is testable in-process across three tiers

The project SHALL make behaviour testable in-process under `vitest` (no
browser, no C/WASM) across three tiers, reserving browser automation
(Playwright) for visual and full-integration smoke checks only:

1. **Pure logic** — game `Game` implementations, the `Midend`, solvers,
   generators, codecs — tested in the default `node` environment.
2. **Rendering ops** — a game's `redraw` driven against a recording
   `GameDrawing` double, asserting the draw calls it makes (e.g. "a
   `COL_MISTAKE` rect is emitted for a flagged cell"), also in `node`.
3. **Components + persistence** — Lit components (`puzzle-screen`,
   dialogs) under a `happy-dom` environment, and Dexie/IndexedDB
   persistence (`saved-games.ts`) under `fake-indexeddb`, opted into
   per-file.

`happy-dom` and `fake-indexeddb` SHALL be devDependencies only (no
runtime or bundle impact). New UI or persistence behaviour SHALL ship a
tier-2 or tier-3 in-process test rather than relying on a human
eyeballing a Playwright run.

#### Scenario: A persistence round-trip is tested without a browser

- **WHEN** `npm run test:run` runs the `saved-games` suite
- **THEN** a quick-save is written and read back through Dexie against an
  in-memory `fake-indexeddb`, asserting the round-trip and the reactive
  `hasQuickSave` signal, with no browser involved

#### Scenario: A component command path is tested without a browser

- **WHEN** the `puzzle-screen` suite mounts the element under `happy-dom`
  with a fake `Puzzle`
- **THEN** the Check-&-Save command saves on zero mistakes and refuses to
  save on a positive mistake count, asserted in-process

#### Scenario: The fast logic suites keep the node environment

- **WHEN** the pure-logic suites run
- **THEN** they execute in the default `node` environment and do not pay
  DOM setup cost; only files that need it opt into `happy-dom`

### Requirement: Rendering is verifiable in-process, agent-checkable

The project SHALL provide an in-process way to capture a game's `redraw` output
as a **deterministic draw record**, driven through the real `Midend`, so
per-frame visual correctness can be asserted and snapshot-tested without a
browser and **without a human in the loop**. This complements the ad-hoc
recording-`GameDrawing` doubles by sharing one complete, normalised recorder and
adding a scenario driver that reaches a specific production frame.

The harness SHALL include a recording `GameDrawing` that captures every draw
call with all arguments (colours resolved through the game's palette to stable
labels), and a scenario driver that — given a game, params, a description, an
optional move list, and flags to show the active hint or mistakes — drives a
real `Midend` to the target frame (replaying moves as `Move`s, not pointer
events) and returns the captured record. Output SHALL be deterministic (fixed
tile size, rounded coordinates, stable ordering, no `Date`/`Math.random`).
Verification SHALL use `toMatchSnapshot` on the record plus targeted assertions
on specific ops; the harness SHALL be dev/test-only with no runtime or bundle
impact. New rendering behaviour SHOULD ship such a test, reserving Playwright
for genuine full-integration and real-canvas smoke checks.

#### Scenario: A hint frame is asserted without a browser or a human

- **WHEN** the scenario driver replays a game's prefix moves, requests a hint,
  and captures the resulting frame
- **THEN** targeted assertions confirm the hint's highlight ops in the expected
  colours (e.g. the action edge `COL_HINT`, a sibling edge `COL_HINT_SIBLING`,
  referenced cells `COL_HINT_CELL`)
- **AND** no browser, worker, OffscreenCanvas, or human eyeball is involved

#### Scenario: A render regression is a reviewable snapshot diff

- **WHEN** the captured record is compared against its `toMatchSnapshot`
  baseline after a rendering change
- **THEN** an unintended visual change surfaces as a text diff an agent reviews,
  and an intended one is re-baselined with `vitest -u`

### Requirement: Developer guides live under docs/ and link to specs

Developer guides under `docs/` SHALL describe procedure (the followable
*how*) and SHALL NOT restate normative requirements. A guide MUST link to
the authoritative spec requirement rather than paraphrase it, and MUST name
exemplar files rather than copy code that would rot. This keeps the specs
(`ts-migration`, `ts-engine`, `repo-layout`, per-game) the single source of
truth for *what* is required, so a guide can only ever go stale (a broken
link or an outdated exemplar pointer, caught by review), never silently
contradict a requirement.

The initial guides are `docs/porting/game-port-playbook.md` (the ordered
game-port procedure) and `docs/porting/hint-authoring.md` (the procedure for
adding an explained `hint()` to a ported game).

#### Scenario: A guide states a normative rule

- **WHEN** a `docs/` guide mentions a rule that a spec owns (e.g. the
  parity-gated registration rule, or the hint quality bar)
- **THEN** the guide states it briefly and links to the owning spec
  requirement
- **AND** the guide does not contain the authoritative wording such that the
  two could diverge

#### Scenario: A guide shows a code pattern

- **WHEN** a `docs/` guide describes an implementation pattern (e.g. the
  `Int32Array` packed-bits render cache key)
- **THEN** it points at an exemplar file that demonstrates the pattern
- **AND** it does not paste a code snippet that would drift from the source

### Requirement: A scaffolding script stamps out a new game-port skeleton

The repository SHALL provide `scripts/new-game-port.sh <gameId>` that creates the
mechanical skeleton of a new game: `src/games/<gameId>/` containing typed
`Game<…>` stub modules (the `index`/`state`/`solver`/`generator`/`render`
file shape the game-port playbook prescribes), an empty `__fixtures__/`
placeholder, AND starter test scaffolding — a `<gameId>.test.ts` (a
serialise/deserialise round-trip skeleton plus a `renderScenario` smoke skeleton
importing from `src/engine/testing/`) and a `<gameId>-generation.test.ts`
stub for the generation invariants that stand in for the retired byte-match
oracle. The script SHALL refuse to overwrite an existing game directory.

It SHALL print — but SHALL NOT itself perform — the manual-edit checklist that
requires judgement: registering the game in `src/games/index.ts`, adding
its catalog entry to `src/puzzle/catalog-data.ts`, stating what the generation
test asserts, and adding the two committed icon PNGs.
`docs/porting/game-port-playbook.md` SHALL reference the script as the
copy-from-exemplar entry point.

The scaffold SHALL NOT emit a C-differential stub or instruct a contributor to
write a `<gameId>-trace.c` harness: `retire-c-engine` deleted the C build, so a
new game has no upstream oracle to record a fixture against. The existing frozen
fixtures belong to games ported while that build existed and are unaffected.

#### Scenario: Scaffolding a new game

- **WHEN** a contributor runs `scripts/new-game-port.sh singles`
- **THEN** `src/games/singles/` is created with the typed stub modules, an
  empty `__fixtures__/`, a starter `singles.test.ts`, and a
  `singles-generation.test.ts` stub
- **AND** the emitted files type-check and lint clean
- **AND** the script prints the manual-edit checklist (the two registration
  points, the generation invariants, the icon PNGs) without editing those files

#### Scenario: The scaffold does not promise an oracle that no longer exists

- **WHEN** the scaffold is generated
- **THEN** it contains no C-differential stub and no trace-harness instruction
- **AND** the generation-test stub states that the game's assurance is
  behavioural

### Requirement: A shared helper carries the byte-for-byte differential shape

The engine testing utilities SHALL provide `describeDescDifferential` in
`src/engine/testing/differential.ts`: given a fixture list, a `params`
mapper, and a game's `newDesc`, it asserts for each fixture that
`newDesc(params(fixture), randomNew(fixture.seed)).desc` equals the fixture's
recorded C desc (the strongest differential bar — valid only for a faithful
generator over the bit-identical RNG), with an optional `extra` callback for a
follow-on assertion. Games whose gated differential is the byte-for-byte desc shape
SHALL use this helper instead of re-implementing the loop. The solver-agreement
differential shape (decode a C board, run the TS solver, assert the recorded
difficulty) is game-specific and is NOT modelled by this helper.

#### Scenario: A game's byte-match differential uses the helper

- **WHEN** a game's gated differential asserts its `newDesc` reproduces the C desc
  byte-for-byte across a fixture set
- **THEN** it calls `describeDescDifferential` with its fixtures, params mapper, and
  `newDesc`, rather than re-declaring the `describe`/`for`/`it`/`expect` loop

### Requirement: The test suite is deterministic under parallel load

The full `vitest run` SHALL pass deterministically — a test SHALL NOT fail as a
function of execution order, worker scheduling, or CPU contention. In particular,
heavy generator/solver tests (which loop until a uniquely-solvable board is
produced) SHALL be **seed-deterministic** (a fixed seed always produces the same
board and verdict); a generator's retry loop SHALL have a finite iteration cap
rather than relying on probabilistic termination within a timeout.

A test SHALL NOT assert on **elapsed wall-clock time** (e.g. "completes in < N
ms") as a proxy for an algorithm being efficient, because elapsed time under a
saturated box measures spare capacity, not the code. Such a property SHALL be
asserted via a **deterministic proxy** instead — a bounded node/expansion count,
iteration count, or result shape — that is identical regardless of machine load.

**A test timeout is a runaway backstop, not a gate.** The development box runs
deliberately busy, so an otherwise-good commit SHALL NOT be rejected merely
because work took long. Therefore:

- There SHALL be exactly **one** generous ceiling, `testTimeout`/`hookTimeout` in
  `vitest.config.ts`, sized far clear of the worst loaded runtime. Individual
  tests SHALL NOT set their own timeout: a per-test ceiling is a guess about
  contention, it is invisibly *tighter* than the global one, and maintaining ~39
  such guesses meant each one silently became a flake as the suite grew.
- Raising or removing a clock gate IS the correct fix when the diagnosis is
  **contention on work that terminates** — it is not "papering over". What would
  paper over a defect is leaving the gate in place and re-guessing its constant,
  which is how a 30s ceiling became 60s, then 120s, and still failed a green
  commit at load ~32.
- A timeout SHALL NOT be relied on to catch a runaway loop: this suite is
  synchronous, so a runaway blocks the event loop and the timeout's `setTimeout`
  cannot fire (the same mechanism that orphans workers). Non-termination SHALL be
  bounded where it can be caught — `engine/retry-limit.ts` for generator retries,
  `engine/step-budget.ts` for solver/hint fixpoints.

A failure observed only under full-suite load SHALL still be **root-caused**, not
dismissed as "flaky" — a non-deterministic gate cannot distinguish a real
regression from noise. Root-causing means identifying *which* cause applies:
contention on terminating work (remove the clock gate), shared state or order
dependence (fix the leak), a logic edge case (fix the code), or genuine
non-termination (bound it in code per the clause above).

#### Scenario: A generator test gives the same verdict every run

- **WHEN** a generator/solver test runs with a fixed seed, alone or inside the
  full parallel suite
- **THEN** it produces the same board and the same pass/fail verdict, regardless
  of how many other tests run concurrently

#### Scenario: Efficiency is asserted by a proxy, not by elapsed time

- **WHEN** a test wants to assert an algorithm (e.g. a hint planner's search) is
  efficient
- **THEN** it asserts a load-independent proxy (bounded expansions / iterations /
  result shape), not that it finished within a wall-clock millisecond budget

#### Scenario: A correct-but-slow test survives a saturated box

- **WHEN** a test whose work terminates and whose assertions are deterministic
  runs while the machine is heavily loaded, taking many times its solo runtime
- **THEN** it still passes, because no per-test clock gate stands between it and
  its assertions — only the single generous ceiling, which is sized for runaway
  work rather than for contention

#### Scenario: A load-only failure is investigated, not ignored

- **WHEN** a test fails during a full `vitest run` but passes in isolation
- **THEN** its cause is identified — contention, shared state, order dependence,
  a logic edge case, or non-termination — and fixed at that cause
- **AND** where the cause is contention on terminating work, the fix is to stop
  gating that test on the clock, never to re-guess a per-test constant

### Requirement: Test worker processes do not outlive their runner

A `vitest` run SHALL NOT leave worker processes running after it ends. Because
every generator/solver/hint-planner under `src/engine/` and `src/games/` is
synchronous, a worker mid-computation cannot be interrupted by `testTimeout` or
by the pool's
IPC shutdown, so a run that is killed while a worker computes (Ctrl-C, a
CI/bash-timeout SIGTERM) reparents that worker to init (PID 1) where it spins on
a CPU core indefinitely, and repeated interrupts accumulate such orphans. Two
mechanisms SHALL keep this from degrading the machine:

1. **Reaping.** A run's entry points (the pre-commit gate `scripts/gate.sh` and
   the `test`/`test:run` npm scripts) SHALL reap orphaned workers **before**
   starting — killing only this repo's `vitest` worker processes whose parent is
   PID 1 (definitionally orphans; a live run's workers have their runner as
   parent), by exact PID, never with `pkill`/`killall`, and never a live run's
   workers or another user's processes. The reaper SHALL be fail-safe: any error
   is swallowed and the run proceeds. It runs *before* rather than *after* a run
   because the interrupt that creates an orphan also kills any post-run hook.

2. **Bounded generation.** Every *generate-until-success* retry loop in a game
   generator SHALL be finitely bounded, so a pathological seed fails fast — or
   recovers — instead of spinning a worker for ever. This reinforces the existing
   "deterministic under parallel load" requirement's clause that "a generator's
   retry loop SHALL have a finite iteration cap rather than relying on
   probabilistic termination". Specifically:

   - The bound SHALL come from the shared `engine/retry-limit.ts` helper rather
     than a hand-rolled counter, so every loop reports failure the same way
     (`RetryLimitExceeded`, naming the loop and its budget) and the reasoning
     for bounding at all lives in one place.
   - Exhaustion SHALL either throw, or transfer to a recovery path that is
     itself bounded. Throwing is the default, and cannot alter a converging
     seed, so byte-match with the C reference is preserved by construction.
     Recovery is preferred where the algorithm already has such a path, since a
     cap that throws turns a rare-but-legal pathological seed into a *failed
     puzzle*, where recovery makes it merely a slower one.
   - A loop whose only termination argument is probabilistic ("a random retry
     will eventually break the tie") counts as unbounded: a synchronous worker
     cannot be interrupted while waiting for that probability to pay out.
   - Fixpoint solvers, and loops that terminate by a stated monotone-progress
     argument, are exempt.

#### Scenario: Orphaned workers are reaped before a run

- **WHEN** a test entry point (the gate or a `test`/`test:run` npm script) starts
  and a prior run left an orphaned worker (a repo `vitest` worker with PPID 1)
- **THEN** that orphan is killed by its exact PID before the new run begins, so
  orphans never accumulate across runs

#### Scenario: A live run's workers are never reaped

- **WHEN** the reaper runs while another `vitest` run is in progress
- **THEN** that run's workers (which have their runner as parent, not PID 1) are
  left untouched, and only true orphans are killed

#### Scenario: A runaway generator fails fast instead of orphaning a worker

- **WHEN** a game generator's retry loop is given an input for which it never
  reaches success (a porting divergence, or params that admit no puzzle — `net`
  with a wrapping dimension of 2 and `unique` set, which is provably impossible)
- **THEN** it throws `RetryLimitExceeded`, naming the loop, after a finite number
  of attempts rather than looping forever, so the worker returns control (and can
  be torn down) instead of becoming an uninterruptible orphan

#### Scenario: A stalled loop recovers rather than failing the puzzle

- **WHEN** a retry loop has a natural recovery path and stops making progress
  (Net's loop-fixing rounds ceasing to reduce the loop-square count)
- **THEN** it takes that recovery path (a full reshuffle) once the stall is
  detected, bounded by an outer `retryLimit`, so the player gets a slower puzzle
  rather than an error — and the loop gains a real termination argument in place
  of "a random rotation will eventually break the tie"

### Requirement: Every help page the app serves lives under `help/`

Every help page the app serves to players SHALL live under `help/`, whoever
wrote it. The distinction that matters is not authorship but whether the app
serves it: a served page is an input to this project's build, and its location
should say so.

The tree SHALL separate what this project writes from what it merely renders:

- `help/*.md` and `help/games/<puzzleId>.md` are **this project's own pages**.
  The per-puzzle ones cover the puzzles that have no upstream halibut manual;
  they are adapted from the documentation shipped with the third-party sources,
  are maintained by this project, and are rendered to `/help/<puzzleId>.html`.
- `help/upstream/` holds **upstream-authored material rendered verbatim** — the
  per-puzzle overview fragments (`help/upstream/overviews/`) and the halibut
  source for the in-app manual (`help/upstream/manual/`). It SHALL carry a
  README stating that the words are upstream's and are not to be edited, and
  pointing at the MIT notice that covers them.

`help/upstream/` SHALL be excluded from the formatter/linter. Verbatim means
verbatim: a formatter run over it would rewrite upstream's markup, which is the
same edit the requirement forbids a human from making, performed automatically
and invisibly. (The overview fragments are also not well-formed documents —
upstream's format is a bare title line followed by a body — so a formatter both
may not and cannot process them.)

No page the app serves SHALL be read from an upstream reference tree: a page
this project edits is no longer reference material, and a page it merely renders
is still a build input.

Relocating upstream-authored pages SHALL change neither their content nor their
attribution — moving them is not licence to edit them — and SHALL NOT change the
URL any page is served at.

A help **source directory SHALL NOT shadow a URL directory the build emits pages
into.** The manual is served under `/help/manual/`, so its source cannot sit at
`help/manual/`: a real directory of that name occupies the path the generated
pages are emitted at, and the production build fails outright with `EISDIR`.
Sources whose pages render to the top level (`/help/<puzzleId>.html`) are
unaffected, which is why `help/games/` and `help/upstream/overviews/` are free to
be named for what they hold.

These pages introduce the puzzle — its rules, its provenance, its controls and
its parameters. They SHALL NOT carry development status, known-issue lists or
roadmap notes: a player reading the help for a game is not the audience for a
statement about its implementation, and such a statement goes stale silently the
moment the issue is addressed.

#### Scenario: A puzzle without an upstream manual has a help page

- **WHEN** the help page for such a puzzle is requested
- **THEN** it is served from `help/games/<puzzleId>.md`, and describes how to
  play rather than the state of the implementation

#### Scenario: Every served help page lives under `help/`

- **WHEN** the help sources are located
- **THEN** the project-authored pages, the overview fragments and the manual
  source are all under `help/`
- **AND** the upstream-authored ones are under `help/upstream/`, with a README
  recording that they are upstream's words and where their licence is
- **AND** no page the app serves is read from an upstream reference tree

#### Scenario: Relocation changes no URL and no words

- **WHEN** the upstream-authored help sources are moved
- **THEN** each page is served at the same URL as before
- **AND** its content and attribution are unchanged
- **AND** the built `dist/help/` holds the same pages as before the move

#### Scenario: The formatter does not rewrite upstream's words

- **WHEN** `biome check` runs over the repository
- **THEN** `help/upstream/` is excluded from it
- **AND** the upstream help sources are byte-identical to what upstream ships

#### Scenario: A help source directory does not shadow a served URL directory

- **WHEN** a help source is placed under `help/`
- **THEN** its directory name does not collide with a URL subdirectory the build
  emits pages into
- **AND** the production build succeeds

### Requirement: The module layering is enforced, not merely observed

The source tree's layering SHALL be enforced by an automated check that fails
CI on violation:

- **No game imports another game.** Each of the 57 games under
  `src/games/<puzzleId>/` is independent; shared behaviour belongs in
  `src/engine/`.
- **`engine/` does not import `games/`**, with one named exception:
  `engine/testing/hint-games.ts`, the test-only enrollment file each hinting port
  adds itself to. The exception SHALL be listed explicitly with its reason, not
  granted by a wildcard over `engine/testing/`.
- **`engine/` and `games/` import nothing under `src/` outside those two
  directories.** The puzzle engine runs in a worker and must not depend on the
  app shell. This SHALL be expressed as that invariant and NOT as a list of
  forbidden directories: a blocklist permits by default, so a directory added
  later is allowed silently, and the rule can only ever catch the violations its
  author thought of. The invariant is affordable because the violation count is
  zero — `types.ts` is the engine's own and `worker-adapter.ts` sits on the app
  side of the seam — so it lands as a ratchet rather than an aspiration.
- **`preflight.ts` imports nothing that breaks its Baseline 2023 gate.**

The previous form of the third rule named `screens/`, `dialogs/` and
`components/`, and was green throughout the period when 182 files under the
engine and games imported the app layer's `src/puzzle/types.ts`. A rule that is
green while the boundary it names is being crossed 182 times is measuring the
wrong thing.

Each rule SHALL be verified to fail when violated — by introducing a violation,
observing the failure, and reverting — before the check is considered done. A
layering rule that has never fired may not work, and its entire value lies in
firing years later, when nobody remembers writing it.

**The check SHALL also guard its own reach.** Every rule above reports
*offenders*, and the resolution step that turns an import specifier into a path
returns nothing when it fails — so a checker that resolves nothing finds no
offenders anywhere and passes while inspecting precisely nothing. The check
SHALL therefore assert what it actually inspected: that every relative source
specifier in the tree resolves, and that the number resolved is far above zero.

This is not hypothetical. The bulk import-rewrite in this change corrupted the
layering test itself, narrowing its resolver so that no `../…` specifier
resolved at all — and all of its rules passed. Measured afterwards: with the
resolver blinded, **six of the seven tests in the file still pass**, and the
seventh is this guard.

It is the third instance of one shape, so it is stated here as a general rule
rather than a patch: `grid.test.ts` asserted `d.edges.length === d.order` where
`d.edges` was allocated `new Array(d.order)`, and `touch-input.test.ts` guarded
its per-game sweep by counting the *catalog* while the sweep itself skipped on
the *registry*. **An instrument that answers "how many violations?" must also
answer "how many things did I look at?"** — otherwise "none found" and "nothing
checked" are the same result.

A count asserted this way SHALL be a floor set well below the true value, not a
ratchet: its job is to separate "working" from "resolving nothing", and a tight
number would wobble on every legitimate deletion.

The check SHOULD be an in-repo test in the style of the existing cross-cutting
invariant tests (`catalog-registry.test.ts`, `asset-integrity.test.ts`) rather
than a new dependency, unless the rules outgrow what a test expresses clearly.

#### Scenario: A game reaches into another game

- **WHEN** a change adds an import from one game directory into another
- **THEN** the layering check fails in CI
- **AND** the shared code is moved to `src/engine/` instead

#### Scenario: A new hinting port enrolls itself

- **WHEN** a newly-ported game with an explained hint adds itself to
  `engine/testing/hint-games.ts`
- **THEN** the layering check permits that file's imports from `games/`
- **AND** no other file under `engine/` gains the same permission

#### Scenario: An engine module reaches into a directory the rule never named

- **WHEN** an engine or game module imports from any directory under `src/`
  other than `src/engine/` or `src/games/` — including one added after the rule
  was written
- **THEN** the layering check fails
- **AND** it fails without the rule having been updated to know about that
  directory

#### Scenario: The checker is broken rather than the code

- **WHEN** the layering check's import resolution stops working — because a
  refactor edited it, or the tree moved under it
- **THEN** the check fails, naming the specifiers it could not resolve
- **AND** it does NOT report zero violations, which is what a checker that
  inspected nothing would otherwise report

#### Scenario: A cross-cutting invariant test states its own coverage

- **WHEN** a test asserts that a set of violations is empty across the tree
- **THEN** it also asserts how many items it examined to reach that conclusion
- **AND** the count is a floor set well below the true value, so it distinguishes
  "nothing was wrong" from "nothing was checked" without ratcheting on a number
  that legitimate deletions change

### Requirement: The import-cycle metric counts runtime cycles

The repository's import-cycle measurement SHALL report cycles that exist at
runtime, and SHALL NOT count cycles whose every instance in one direction is a
type-only import.

With `verbatimModuleSyntax`, an `import type` (or a named import whose bindings
are all `type`-prefixed) is erased at build time and forms no runtime edge.
Moving a shared type into a type-only import **is** the standard resolution for a
module cycle; a tool that counts it as an unresolved cycle reports the fix as the
problem.

Measured on 2026-08-01, the raw tool count was 20 and the runtime count was **1**
— nineteen of the twenty were already resolved, including all sixteen per-game
`index ↔ render` pairs where `render.ts` imports only the game's hint type.

Runtime cycles SHALL be ratcheted at zero, and the calibrated check SHALL be
verified to still detect a genuine cycle, so that a reported zero means a real
absence rather than a broken detector.

#### Scenario: A type-only back-reference is not reported

- **WHEN** a game's `render.ts` imports its game's hint type from `index.ts`
  while `index.ts` imports render functions as values
- **THEN** the cycle metric does not report a cycle
- **BECAUSE** the type import is erased and no runtime cycle exists

#### Scenario: A genuine value cycle is reported

- **WHEN** two modules import values from each other
- **THEN** the cycle metric reports it and the ratchet fails
- **AND** the calibrated check is periodically confirmed to catch such a case,
  so that a zero reading is evidence rather than silence

### Requirement: The test suite's strength is audited, not assumed

The repository SHALL periodically measure whether its tests would actually catch
a regression — not merely whether they execute the code — by mutation-testing the
shared engine and triaging the survivors.

Line coverage cannot answer this. The suite executes the solvers heavily, so
every deduction rung *runs*; the question is whether a rung returning the wrong
answer would be *noticed*. That distinction is load-bearing here, because the
project's entire post-C safety argument is that the per-game differentials are
the net for refactoring — and a frozen desc-level fixture says nothing about
coverage of the deduction paths that produced the desc.

The audit SHALL NOT be a gate and its score SHALL NOT be ratcheted. Mutation
testing re-runs the covering tests per mutant, and the gate's wall-clock is
explicitly defended; a score that invites maximising also invites tests written
against mutants rather than against behaviour. The deliverable is a **triaged
survivor list**, each classified as a missing assertion, a genuinely unreachable
branch, or an equivalent mutant.

The harness SHALL be sanity-checked before its results are trusted, by
introducing a deliberate bug and confirming the suite catches it. An audit that
reports a high score because the tests never ran is the same failure it exists to
detect — and this project has already produced two instruments that passed while
measuring nothing (a complexity ratchet that hid its own suppressions, and a lint
config that manufactured 35 phantom findings).

Where survivors cluster SHALL be reported, because that is the transferable
result: survivors concentrated in code the differentials are supposed to protect
mean the fixture net is thinner than believed, which changes how a later refactor
may justify itself as a no-op.

#### Scenario: A refactor is justified by an unmoved fixture

- **WHEN** a change argues it is behaviour-preserving because a differential
  fixture did not move
- **THEN** that argument is only as strong as the fixture's measured coverage of
  the paths the change touched
- **AND** where the audit has shown that coverage to be thin, the change adds a
  direct assertion rather than relying on the fixture alone

#### Scenario: A snapshot's paired assertions are not load-bearing

- **WHEN** the audit finds surviving mutants in a render path protected only by a
  snapshot
- **THEN** the targeted assertions that snapshot is required to be paired with are
  strengthened
- **BECAUSE** a snapshot alone can be re-baselined with `vitest -u` and the
  guarantee silently lost

#### Scenario: A shared module's semantics are pinned only by a distant consumer

- **WHEN** a mutant in a shared engine module survives that module's own test file
  and is killed only by a game's tests or a frozen differential
- **THEN** an assertion is added to the module's own test file, naming the
  behaviour rather than the mutant
- **BECAUSE** coverage several layers away is adequate as *protection* and poor as
  *feedback*: it makes the repository's own test-run economy — run just the
  relevant test files, let the commit hook be the single full run — systematically
  misleading while engine code is being changed, which is the one situation where
  it is most relied on

#### Scenario: An audit instrument reports a count

- **WHEN** a measuring script counts violations of a stated rule
- **THEN** its unit of measurement SHALL be checked against the unit the rule is
  about before its count is believed or acted on
- **BECAUSE** the snapshot-pairing check reported six violations measured per
  `it(...)` block and zero measured per `describe(...)` — all six phantom, and the
  per-test unit was not the more conservative reading but simply the wrong one.
  A stricter unit does not make a check safer; it makes it wrong in the other
  direction

### Requirement: A shared module's tests give feedback where the code lives

A module in `src/engine/` SHALL be able to fail its **own** tests when its
behaviour changes, and not rely solely on a consumer's tests or a game's frozen
differential to notice.

Coverage and feedback are different properties. The failure this requirement
prevents is specific: this repository's test-run economy tells a developer to run
the files they touched and let the commit hook be the single full run, so a
module whose own tests cannot see its defects returns **green on a broken
module** — during exactly the refactoring the tests exist to make safe.

The measurable form is: **plant a real defect, run only the module's own tests,
and see whether they fail.** `scripts/feedback-probe.mjs` (`npm run probe`) is
that measurement, with a committed corpus of hand-chosen defects. It is a
**diagnostic, not a ratchet** — the mutation-score prohibition applies unchanged,
and a test written to move this number rather than to state a behaviour is worse
than no test. A case argued behaviour-preserving is recorded as such and excluded
from the rate rather than chased.

Two definitions are load-bearing and SHALL be derived rather than assumed:

- **A module's own tests** are every engine test file that *imports* it, **or
  imports a barrel re-exporting it** — not one file named after it. That single
  question has been answered wrongly three times, each producing a different
  false picture: matched on filename; taken as the one file named after the
  module, when eight engine files drive a `Midend`; and taken as direct imports
  only, when `grid.ts`'s own doc comment says *"import from this module, not from
  the parts"* and `grid.test.ts` is therefore `grid-core.ts`'s real test
  surface.
- **A differential is not a local test**, even an engine-local one, because its
  guarantee is a frozen fixture noticing that the boards moved.

Where a module's guarantee genuinely belongs to a differential — an RNG draw
order, a region sizing that decides which boards exist — that division of labour
SHALL be stated in the module's test file and **verified**, by confirming the
differential does fail on the defect the local tests deliberately let through.

#### Scenario: Logic is extracted into the engine

- **WHEN** logic moves from a game into `src/engine/`
- **THEN** its tests are written in the same change
- **BECAUSE** extraction moves the code but not its tests: the game's
  differential still catches defects, so nothing turns red and the module
  silently arrives with no local assertions

#### Scenario: A module is fully protected but locally silent

- **WHEN** a module has few or no surviving mutants but its own tests do not fail
  on a defect planted in it
- **THEN** that is a feedback defect to fix, not a coverage success to report
- **BECAUSE** the failure it produces is a green targeted run on a broken module

#### Scenario: A feedback metric is derived from a tool's internals

- **WHEN** a claim about where feedback lives is derived from a field a tool
  emits, rather than from planting a defect and running the tests
- **THEN** the field's documented meaning is checked before the claim is acted on
- **BECAUSE** Stryker's `killedBy` names the first covering test to fail — the
  runner bails there — so it measures *file execution order*, and reading it as
  "the tests capable of catching this" ranked `grid.ts` second-worst when its own
  tests catch every planted defect, and `midend.ts` mid-table when it was the
  worst. That ranking reached a proposal and a spec before it was measured.

#### Scenario: An assertion's two sides derive from the same value

- **WHEN** a test compares a quantity against the thing that produced it —
  `x.length` against the value `x` was sized from, a getter against its own
  field, a total against the sum it was computed from
- **THEN** it is a decoration, not an assertion, and is replaced by the
  independent statement the code under test has to get right
- **BECAUSE** `grid.test.ts`'s `expect(d.edges.length).toBe(d.order)` ran across
  all eighteen tilings and could not fail — `d.edges` is allocated
  `new Array(d.order)` — so halving every dot's degree in the grid builder passed
  all 151 tests in the file. The replacement counts the degree independently,
  from the edges that name the dot as an endpoint.

### Requirement: A change that moves or deletes a path updates the unarchived changes that name it

A change that relocates, renames or deletes a path SHALL sweep the **pending**
changes under `openspec/changes/` — those not yet archived — and correct every
reference the move invalidates, as part of its own definition of done.

The asymmetry with the other two places a path can go stale is the whole point,
and it runs the opposite way to intuition:

- An **archived** change is history. Its paths were true when written, and
  rewriting them falsifies the record; they are deliberately left alone.
- A **spec** is read for its rule. A stale path in one is a wrong pointer that a
  reader will notice is wrong, because the surrounding sentence is about a
  requirement rather than about a file.
- A **pending** change's `tasks.md` is *a list of steps someone is going to
  execute*. "Edit `src/native/games/sticks/solver.ts`" will be attempted
  verbatim, by a session that has no reason to doubt it and every reason to trust
  a checklist written by the project. The failure is not a confusing document; it
  is work done against a tree that no longer exists.

This is load-bearing here rather than theoretical: measured 2026-08-02, **twelve
unarchived changes** name paths the source-tree reorganisation moves, and several
of them (`add-path-ts-port`, `add-numgame-ts-port`, the four difficulty-tier
changes) are queued to be implemented after it.

Re-validation SHALL follow the sweep: a pending change edited this way is
re-checked with `openspec validate <id> --strict`, since a spec delta may quote a
path inside a requirement it must still parse.

#### Scenario: A path is moved while work is queued against it

- **WHEN** a change moves, renames or deletes a path
- **THEN** every unarchived change under `openspec/changes/` naming that path is
  corrected in the same change
- **AND** each corrected change re-validates strictly
- **AND** archived changes are left as written, being a record of what was true

#### Scenario: The sweep is scoped to what the move actually invalidated

- **WHEN** the sweep is performed
- **THEN** it corrects references to the moved paths and nothing else
- **AND** a pending change's reasoning, scope and tasks are otherwise untouched —
  a path fix is not an occasion to revise someone else's plan

