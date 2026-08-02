# repo-layout Specification Delta — retire-native-directory

## ADDED Requirements

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
