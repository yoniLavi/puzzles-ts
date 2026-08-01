# Tasks — rehome-upstream-help-sources

- [ ] 1.1 Move `puzzles/html/**/*.html` → `help/overviews/`; repoint the
      `sources` and `resolve` entries in `vite.config.ts`.
- [ ] 1.2 Move `puzzles/puzzles.but` → `help/manual.but`; repoint
      `scripts/build-manual.sh`.
- [ ] 1.3 Carry the attribution: these are upstream's words. Note the origin
      where the files now live, and keep the MIT notice reachable from them.
- [ ] 2.1 Decide and execute what remains of `puzzles/` (see proposal): the two
      `LICENCE` files and the unbuilt `unfinished/{path,numgame}.c` references.
- [ ] 3.1 Update the `repo-layout` help-page requirement to cover every
      player-facing help page, not only project-authored ones.
- [ ] 4.1 `npm run build:assets && npm run build`; assert `dist/help/` still has
      61 overview pages and `dist/help/manual/` 45 — the move changed no URL.
- [ ] 4.2 Gate green; `openspec validate rehome-upstream-help-sources --strict`.
- [ ] 4.3 Archive, then commit.
