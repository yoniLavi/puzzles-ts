# Tasks — rehome-upstream-help-sources

- [x] 1.1 Move `puzzles/html/**/*.html` → `help/upstream/overviews/`; repoint the
      `sources` and `resolve` entries in `vite.config.ts`.
- [x] 1.2 Move `puzzles/puzzles.but` → `help/upstream/manual/puzzles.but`; repoint
      `scripts/build-manual.sh`.
- [x] 1.3 Carry the attribution: `help/upstream/README.md` records that everything
      below it is upstream's words, that it is not to be edited, and where the MIT
      notice is; `licences/README.md` records what each notice covers.
- [x] 2.1 Decide and execute what remains of `puzzles/`. **Decided (owner,
      2026-08-01): delete it outright.** The two MIT notices moved to
      `licences/{sgt-puzzles,puzzles-unreleased}-LICENCE`, byte-identical;
      x-sheep's `unreleased/README.md` was dropped and its attribution folded
      into `CREDITS.md`, which had no section for Lennard Sprong at all despite
      thirteen of the fifty-seven games being his.
- [x] 3.1 Update the `repo-layout` help-page requirement to cover every
      player-facing help page, not only project-authored ones.
- [x] 4.1 `npm run build:assets && npm run build`; assert `dist/help/` still has
      61 pages and `dist/help/manual/` 45 — the move changed no URL. **Verified**
      (61 / 45, zero wasm, 60 puzzle pages).
- [x] 4.2 Gate green; `openspec validate rehome-upstream-help-sources --strict`.
- [ ] 4.3 Archive, then commit.

## Decisions and divergences from the proposal

**`help/upstream/`, not `help/manual.but` + `help/overviews/`.** The proposal
offered `help/manual.but` "or `help/manual/` if it wants siblings". It wants a
sibling (its attribution note), but **`help/manual/` is unusable**: the manual is
the one help source served under a URL *sub*directory (`/help/manual/*`), and a
real directory of that name shadows the namespace `extra-pages` emits those
generated pages into — `vite build` fails outright with
`EISDIR: illegal operation on a directory, read — file: help/manual/blackbox.html`.
This was found by building, not by reading; it is now a `repo-layout`
requirement with its own scenario, and a comment in `build-manual.sh`.

Grouping both upstream trees under `help/upstream/` fixes that and is better
anyway: "these are upstream's words, do not edit them" becomes one
directory-level fact with one README, instead of a rule restated in two places,
and the *authorship* split (`help/upstream/` vs everything else under `help/`) is
exactly the distinction the widened requirement turns on.

**Scope taken on, beyond the moves.** Each was a live defect or an inaccuracy
found by doing the work, not a tidy-up:

1. **`src/dialogs/about-dialog.ts` `?raw`-imports both licence files** and shows
   them to players. Missing this broke the production build — and it makes the
   notices *live build inputs*, which is the strongest argument for `licences/`:
   a directory named for a deleted C subtree was holding two files the bundle
   depends on. Recorded in the `licensing` delta so the next move of them cannot
   miss it.
2. **`LICENSE.md` named three lineage layers, not four.** Thirteen of the games
   derive from Lennard Sprong's MIT-licensed `puzzles-unreleased` and it went
   uncredited in the layered notice; `CREDITS.md` had no section for it either.
   Both fixed; the `licensing` requirement now lists four layers.
3. **`.gitattributes` un-vendored three files deleted by `retire-c-engine`**
   (`webapp.cmake`, `emcc-dependency-info.py`, `webapp.cpp`). Same shape as that
   change's own finding: deleting the mechanism is the easy half, the guards are
   what convey the false picture.
4. **`docs/tilings/README.md` linked `../../puzzles/LICENCE`** — a dangling link
   the moment `puzzles/` went. Repointed.
5. **`CREDITS.md` described `puzzles/` as "the engine plus the GTK frontend, used
   headless for icon generation"** — stale since `drop-icon-generation` *and*
   `retire-c-engine`. Rewritten.
6. **The formatter would have rewritten upstream's words.** `biome.json` excluded
   `puzzles/`; `help/` is scanned, so the moved fragments became formatter input
   the moment they landed — 49 parse errors at the pre-commit gate, because
   upstream's fragments are deliberately not well-formed documents (bare title
   line, then a body). Had they parsed, biome would have *reformatted* them,
   performing exactly the edit the requirement forbids, automatically and
   invisibly. The exclusion moved with the files and is now a requirement with
   its own scenario. **Generalises: an exclusion is part of a file's identity,
   and moving a file out from under one silently opts it in.**

**Method note.** The first completeness sweep was `grep -rl "puzzles/" … | head -40`
and the list was exactly 40 rows long. `about-dialog.ts` was below the cut, so
"no other references" actually meant "none in the first 40" — and the production
build is what caught it. A `head` on a completeness check is not a completeness
check.

## Spec deltas

- `repo-layout` — RENAMED + MODIFIED the help-page requirement (now covers every
  served page, splits authorship, adds the URL-shadowing rule); MODIFIED the
  root-layout requirement (`puzzles/` out, `licences/` in).
- `ts-migration` — MODIFIED the C-retirement requirement: `puzzles/` does not
  survive the migration, and where each thing it held now lives.
- `licensing` — MODIFIED the layered-`LICENSE.md` requirement: four layers, the
  notices live in `licences/`, and they are reachable from the About dialog.
