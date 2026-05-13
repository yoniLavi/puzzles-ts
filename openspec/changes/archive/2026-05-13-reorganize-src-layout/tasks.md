# Tasks

## 1. Stage the moves with `git mv`

- [x] 1.1 `mkdir -p src/screens src/dialogs src/components`.
- [x] 1.2 `git mv src/{screen,home-screen,puzzle-screen}.ts src/screens/`.
- [x] 1.3 `git mv src/{about,alert,crash,enter-gameid,settings,share}-dialog.ts src/dialogs/`,
  `git mv src/saved-game-dialogs.ts src/dialogs/`.
- [x] 1.4 `git mv src/{catalog-card,command-link,dynamic-content,head-matter,help-viewer,saved-game-list}.ts src/components/`.
- [x] 1.5 Confirmed `git status` shows 16 renames (no content edits in the
  move commit).

## 2. Update imports across `src/`

- [x] 2.1 Rewrote relative imports inside moved files. Siblings remain
  `./<file>`; cross-subdir become `../<other-subdir>/<file>`; src/-root
  files become `../<file>`; src/-subdir files (utils/, css/, puzzle/,
  store/) become `../<subdir>/<file>`. Covered all four import forms
  with one regex pass: static `from "./..."`, side-effect
  `import "./..."`, dynamic `await import("./...")`, and
  `new URL("./...", import.meta.url)`.
- [x] 2.2 Updated `home-page.ts` / `puzzle-page.ts` at `src/` root to
  point at `./screens/{home,puzzle}-screen.ts`.
- [x] 2.3 Updated `src/utils/errors.ts`: `../crash-dialog.ts` →
  `../dialogs/crash-dialog.ts`.

## 3. Verify

- [x] 3.1 `npm run check` — biome format + lint clean (4 cosmetic
  import-order fixes applied to moved files).
- [x] 3.2 `npx tsc -b --noEmit` — every import resolves; exit 0.
- [x] 3.3 `npm run test:run` — all tests still pass (vitest 6/6).
- [x] 3.4 `npm run dev` — boot dev server; `/`, `/cube`, `/loopy`,
  `/mines`, `/solo`, `/flip`, `/help/` all return 200 with correct
  per-puzzle `<title>`.
- [ ] 3.5 `npm run build && npm run preview` — **skipped, same
  pre-existing build breakage flagged in `reorganize-repo-tooling`
  tasks.md §5.5**.
- [x] 3.6 Spot-checked git rename detection: `git status --short`
  shows 16 `R` entries with the moved files (the source paths
  preserved). `git log --follow` will walk back through the move.

## 4. Documentation

- [x] 4.1 Updated README's "Web app code" section: replaced "the src
  directory is a little in flux" with the new screens/dialogs/components
  layout, and updated the `home-screen.ts` / `puzzle-screen.ts` mentions
  to their new paths.
- [x] 4.2 CLAUDE.md "Special files" doesn't reference any moved file
  paths (only `webapp.cpp`, `puzzle.ts`, `worker.ts`, the html templates,
  `preflight.ts`, `db.ts`, `sw.ts`). No update needed.

## 5. Spec sync

- [ ] 5.1 After landing, `openspec archive reorganize-src-layout --yes`
  promotes the `repo-layout` spec delta.
