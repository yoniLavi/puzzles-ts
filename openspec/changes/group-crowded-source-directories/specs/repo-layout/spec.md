# repo-layout Specification Delta — group-crowded-source-directories

> Both requirements below are stated against their post-`retire-native-directory`
> text. This change is sequenced after that one.

## MODIFIED Requirements

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
`src/assets/` (generated), `src/css/` (styles), `src/store/` (Dexie
schema), `src/utils/` (general-purpose helpers).

`src/puzzle/` SHALL separate its two roles into the directory root and one
subdirectory:

- `src/puzzle/` — the main-thread puzzle runtime: the `Puzzle` object, the
  Comlink worker host, the canvas `Drawing`, the engine surface, the worker
  adapter, and the committed catalog.
- `src/puzzle/components/` — the puzzle-specific Lit components (the view, the
  interactive view, the key bar, the history bar, the type menu, the config
  dialog, the context provider, the other-puzzles menu, the end notification).

The component **filenames** SHALL NOT repeat the directory (`components/view.ts`,
not `components/puzzle-view.ts`), and the **custom element names** SHALL NOT
change: `<puzzle-view>`, `<puzzle-keys>` and the rest are the app's DOM
vocabulary, used from `templates/*.html.hbs` and from every component's
templates. Renaming a file is a refactor; renaming a custom element changes the
app's markup contract.

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

Within `src/engine/`, a **family of modules that are meaningless apart from each
other** SHALL be grouped into a subdirectory; unrelated helpers SHALL stay flat.
The families are `grid/` (the grid builders, geometry, descriptions, trimming and
the aperiodic `tilings/`, with `grid/index.ts` the barrel its own doc comment
tells callers to import from) and `colour/` (the twelve-colour palette, the
role-to-colour meanings, and the board-relative per-game colours — the three
layers `consolidate-colour-palette` designed).

A subdirectory SHALL NOT be created for a grouping that has to be argued for. The
test is whether a reader looking for a file would know to look there without
being told; where the answer requires the rationale to be explained, the file
stays flat. A taxonomy nobody can predict is re-litigated at every addition, and
files then land wherever the last argument ended.

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
  `src/components/` respectively — or `src/puzzle/components/` when it is
  puzzle-specific
- **AND** the file is NOT added loose at `src/` root, and NOT loose at
  `src/puzzle/` root alongside the runtime

#### Scenario: A puzzle component moves without changing the markup

- **WHEN** a puzzle component's file is renamed or relocated
- **THEN** its `@customElement` tag name is unchanged
- **AND** `templates/*.html.hbs` and every template using `<puzzle-…>` are
  untouched

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

#### Scenario: A new engine helper is not given a speculative subdirectory

- **WHEN** a contributor adds an engine helper that does not belong to `grid/`
  or `colour/`
- **THEN** it lands flat in `src/engine/`
- **AND** a new subdirectory is created only for a family whose members have no
  readership apart from each other

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
  only, when `grid/index.ts`'s own doc comment says *"import from this module,
  not from the parts"* and `grid.test.ts` is therefore `grid-core.ts`'s real test
  surface.
- **A differential is not a local test**, even an engine-local one, because its
  guarantee is a frozen fixture noticing that the boards moved.

The derivation SHALL walk `src/engine/` **recursively**, and SHALL fail rather
than proceed when it discovers fewer engine test files than a committed floor.
The walk was one level deep while the engine was flat; grouping `grid/` and
`colour/` into subdirectories would otherwise have shrunk the derived
own-test set silently, and the failure direction is the dangerous one — fewer
tests run against each planted defect means more cases report SURVIVED, which
reads as "the tests got worse" rather than "the instrument stopped looking".
The anchor check does not cover this: it validates that each case's quoted source
line still exists, which a pure file move leaves true.

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

#### Scenario: The instrument stops finding tests

- **WHEN** a refactor nests engine modules deeper than the probe's directory walk
  reaches
- **THEN** the probe fails on the discovered-test-file floor
- **AND** it does NOT report a lower rate, which would be indistinguishable from
  the tests having genuinely got worse

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

Within the source tree, the sweep SHALL cover **every construct that names a
file**, not only import statements. A bulk rewriter that matches import
specifiers is structurally blind to three others, and they fail in different
directions:

- `import.meta.glob("../games/**/*.ts")` — **silent**. An unmatched glob yields
  `{}`, so the file's assertions pass over nothing rather than failing.
- `new URL("../assets/…", import.meta.url)` — loud, because
  `asset-integrity.test.ts` asserts every one resolves.
- Path arithmetic keyed to depth — `p.split("/")[3]`, or stripping a fixed
  `"../games/"` prefix — which no string sweep can see at all, because the
  string it depends on does not appear in the file.

Such a derivation SHALL state its assumption and fail when it does not hold,
rather than degrade: cutting a glob key at `/games/` and throwing when the match
fails is correct at any depth, where stripping a fixed prefix silently leaves
`../abcd/render.ts` and turns the game id into `".."`.

A tool SHALL NOT write its output into an `openspec/changes/<id>/` directory.
`openspec archive` renames that directory the day the change ships, so the path
has an expiry date built into the workflow. Durable generated artefacts belong
under `metrics/`.

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

#### Scenario: A moved file names a sibling by something other than an import

- **WHEN** a file that uses `import.meta.glob`, `new URL(…, import.meta.url)` or
  a depth-keyed path derivation is relocated
- **THEN** each of those is repointed in the same change as the imports
- **BECAUSE** `palette-source.test.ts` moved into `engine/colour/` with its
  glob still reading `"../games/**/*.ts"`, which matched nothing — and "a game
  contains no colour value" is what three assertions then reported. Its own
  `expect(sources).toBeGreaterThan(100)` guard is what failed instead, which is
  the whole reason a sweep-style test must count what it looked at.

#### Scenario: A generated artefact outlives the change that asked for it

- **WHEN** a script writes a reviewable artefact
- **THEN** it writes under `metrics/`, not into a change directory
- **BECAUSE** `colour-inventory.test.ts` wrote to
  `openspec/changes/consolidate-colour-palette/inventory.md`; archiving that
  change renamed the directory, and `npm run diff` — the advisory check nominated
  to notice a lost colour module — failed `ENOENT` from that day, silently,
  because an advisory run reports rather than gates
