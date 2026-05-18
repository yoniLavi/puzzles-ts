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
`src/assets/` (generated), `src/css/` (styles), `src/puzzle/` (puzzle
runtime + Comlink worker), `src/store/` (Dexie schema), `src/utils/`
(general-purpose helpers).

`src/native/` SHALL hold the native-TS engine and the ported games:

- `src/native/engine/` — the TS midend, the `Game` interface, the
  per-game registry, and the clean save codec, with behavioural
  `*.test.ts` colocated.
- `src/native/games/<game>/` — one folder per ported game (the `Game`
  implementation and its behavioural `*.test.ts`), named by catalog
  `puzzleId`.
- `src/native/<module>/` — one folder per ported shared/leaf module
  (e.g. `random/`), containing `index.ts` (the TS implementation
  exporting the module's public surface), an optional `bridge.ts`
  (present only when the module has a wasm-side `--js-library` bridge,
  e.g. `random`), and behavioural `*.test.ts` named descriptively
  (e.g. `random.test.ts`, not `index.test.ts`). Internal dependencies
  that are not yet their own module MAY live inside the same folder
  (e.g. `src/native/random/sha1.ts`) and SHALL be lifted to their own
  `src/native/<dep>/` folder if/when they become a public seam.

A ported module under `src/native/` SHALL NOT be required to carry a
`__fixtures__/` characterization corpus captured from the native C
build: per the `ts-migration` doctrine, correctness is established by
behavioural and property tests, with the C build used only as a
dev-time differential spot-check, not a recorded golden corpus. A
module MAY keep fixtures where they aid behavioural testing, but they
are not a mandated layout element and are not an acceptance gate.

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

#### Scenario: The TS engine and a ported game land in the right place

- **WHEN** the engine layer is added and, later, a game is ported
- **THEN** the midend, `Game` interface, registry, and save codec live
  under `src/native/engine/`
- **AND** the ported game lives under `src/native/games/<puzzleId>/`
  with its behavioural tests colocated
- **AND** neither is added loose at `src/native/` root

#### Scenario: A new ported leaf module lands in `src/native/`

- **WHEN** a contributor adds a new ported shared/leaf module (e.g.
  `tree234`)
- **THEN** the files land under `src/native/tree234/`, with the TS
  impl at `index.ts`, the bridge (if any) at `bridge.ts`, and
  behavioural tests at `tree234.test.ts`
- **AND** no `__fixtures__/` characterization corpus captured from the
  native C build is required for acceptance
- **AND** they are NOT added loose at `src/native/` root
