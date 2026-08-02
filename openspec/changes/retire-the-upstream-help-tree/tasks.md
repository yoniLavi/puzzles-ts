# Tasks — retire-the-upstream-help-tree

Order matters once: adopt the overviews **before** deleting the manual, so the
overview template's `manpage` link is removed in a tree where the pages it links
to still exist and the "does anything else point at the manual?" search is
answerable.

## 1. Adopt the overviews into `help/games/`

- [ ] 1.1 Convert the 43 `help/upstream/overviews/*.html` fragments to markdown
      at `help/games/<id>.md`, **words unchanged**. They are `<p>`/`<em>` and
      little else, so this is mechanical — diff the rendered output, not the
      source, to confirm no sentence was lost.
- [ ] 1.2 Match the shape of the 13 pages `audit-author-known-issues` already
      wrote: same front matter, same heading level, and **no `## Status`
      section** — that rule ("these pages introduce the puzzle, never the state
      of its implementation") now applies to all 57.
- [ ] 1.3 Write the missing `separate` page. It is the one catalogued game with
      no help page in either source.
- [ ] 1.4 Repoint `vite.config.ts`'s overview `sources`/`resolve` entry at
      `help/games/`, and confirm `/help/<puzzleId>.html` URLs are unchanged for
      all 57 — this is a source move, not a routing change.

## 2. Assert the coverage that was missing

- [ ] 2.1 Add the both-directions coverage test (D4): every catalog `puzzleId`
      has `help/games/<id>.md`, and every `help/games/*.md` names a catalogued
      game. Place it with the other cross-cutting invariants.
- [ ] 2.2 Verify it fails in both directions — delete a page, watch it go red;
      add a stray `help/games/nosuchgame.md`, watch it go red; revert both. An
      invariant test that has never failed may not work.

## 3. Delete the manual and its toolchain

- [ ] 3.1 `git rm` `help/upstream/manual/puzzles.but` and
      `scripts/build-manual.sh`; drop the `build:assets` script from
      `package.json` and the `/src/assets/manual/` rule from `.gitignore`.
- [ ] 3.2 `git rm Brewfile`. halibut is its only entry and existed only for the
      manual; after this the repo has no native toolchain dependency at all.
- [ ] 3.3 Remove from `vite.config.ts`: the manual `sources`/`resolve` entry, the
      `manpage` existence check that decorates each overview, and the sitemap's
      `/help/manual/doc` + `/help/manual/docindex` special-cases.
- [ ] 3.4 Remove the `manpage` link from `help/_overview.html.hbs`. **A dangling
      "instruction manual" link would be worse than deleting the manual** — grep
      the built output for `help/manual` and require zero hits.
- [ ] 3.5 `rmdir help/upstream` (it is now empty) and delete its README. Update
      the `help/upstream/` references in `AGENTS.md` and `README.md`.
- [ ] 3.6 Delete the stale generated `src/assets/manual/` from the working tree.

## 4. Verify (D5)

- [ ] 4.1 `npm run build`; assert `dist/help/` has **57** per-game pages and no
      `manual/` directory.
- [ ] 4.2 Assert the built sitemap lists no `/help/manual/*` URL.
- [ ] 4.3 **Build on a clean checkout without `brew bundle install`.** That this
      now works is the point of the cascade and is not true today.
- [ ] 4.4 Load `/help/<id>.html` for a game that had a manual chapter (cube) and
      one that never did (ascent) — both render, neither shows a broken link.

## 5. Specs and close-out

- [ ] 5.1 `repo-layout` — MODIFIED "Every help page the app serves lives under
      `help/`": one directory, one format, no `upstream/` split, plus the
      coverage invariant.
- [ ] 5.2 `build-pipeline` — MODIFIED "The asset build produces the catalog and
      manual without a WASM toolchain": there is no asset build; the catalog is
      committed source and nothing else is generated.
- [ ] 5.3 **Sweep the pending changes.** `openspec/changes/*/` (not `archive/`)
      is unarchived work someone will implement, so a stale path there is worse
      than one in a spec: it will be followed. Grep the twelve non-archived
      changes for `help/upstream`, `build:assets` and `Brewfile` and correct what
      this change invalidates.
- [ ] 5.4 `openspec validate retire-the-upstream-help-tree --strict`.
- [ ] 5.5 **Owner acceptance is required before archiving**, because this removes
      player-visible content. Show the built `/help/` before and after.
