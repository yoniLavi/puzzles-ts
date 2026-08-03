# Tasks — retire-the-upstream-help-tree

Order matters once: adopt the overviews **before** deleting the manual, so the
overview template's `manpage` link is removed in a tree where the pages it links
to still exist and the "does anything else point at the manual?" search is
answerable.

## 1. Adopt the overviews into `help/games/`

- [x] 1.1 Convert the 43 `help/upstream/overviews/*.html` fragments to markdown
      at `help/games/<id>.md`, **words unchanged**. They are `<p>`/`<em>` and
      little else, so this is mechanical — diff the rendered output, not the
      source, to confirm no sentence was lost.
      *Verified two ways over all 43: rendered **text** identical (tags
      stripped, entities and typographer punctuation folded to a common form)
      and rendered **structure** identical (per-file `<em>`/`<strong>`/`<code>`/
      `<li>`/`<ul>`/`<a>`/`<p>` counts). git independently detected 37 of the 43
      as renames.*
- [x] 1.2 Match the shape of the 13 pages `audit-author-known-issues` already
      wrote: same front matter, same heading level, and **no `## Status`
      section** — that rule ("these pages introduce the puzzle, never the state
      of its implementation") now applies to all 57.
      *Two of the 43 violated it in a spelling that sweep could not see — an
      inline `<strong>Status:</strong>` paragraph, in `slide.html` and
      `sokoban.html`, calling two shipped games "experimental, unfinished". See
      §1.5.*
- [x] 1.3 Write the missing `separate` page. It is the one catalogued game with
      no help page in either source.
- [x] 1.4 Repoint `vite.config.ts`'s overview `sources`/`resolve` entry at
      `help/games/`, and confirm `/help/<puzzleId>.html` URLs are unchanged for
      all 57 — this is a source move, not a routing change.
      *One entry now serves all 57. `help/_overview.html.hbs` is deleted and
      `help/_unreleased.html.hbs` renamed `_game.html.hbs`: after adoption it
      renders every game, so a name meaning "the thirteen third-party ones" was
      false.*
- [x] 1.5 **Not in the original plan.** Delete the two `**Status:**` paragraphs
      the conversion surfaced. Check each player-relevant fact inside them
      before dropping it: Slide's slow generation survived (measured — 1.5 s
      median / 3.2 s max at 8×6) and is restated plainly; its "keyboard control
      is not yet supported" is a roadmap note, and Sokoban's "use it with
      hand-written level descriptions" points at a workflow this app does not
      offer.

## 2. Assert the coverage that was missing

- [x] 2.1 Add the both-directions coverage test (D4): every catalog `puzzleId`
      has `help/games/<id>.md`, and every `help/games/*.md` names a catalogued
      game. Place it with the other cross-cutting invariants.
      *`src/help-coverage.test.ts`, beside `catalog-registry.test.ts`.*
- [x] 2.2 Verify it fails in both directions — delete a page, watch it go red;
      add a stray `help/games/nosuchgame.md`, watch it go red; revert both. An
      invariant test that has never failed may not work.
      *Both fired, plus the §2.4 status trap; tree restored and green after.*
- [x] 2.3 **Not in the original plan.** Assert `help/puzzles.md` — the
      "Included puzzles" page, self-described as "manually generated for now" —
      lists every catalogued puzzle and nothing else. It was missing **six**:
      crossing, group, seismic, separate, slide, sokoban.
- [x] 2.4 **Not in the original plan.** Assert no help page carries a
      development-status note, in either spelling (`## Status` heading or
      `**Status:**` label). Narrow deliberately: several pages legitimately say
      "the status line" about the game's own status bar.

## 3. Delete the manual and its toolchain

- [x] 3.1 `git rm` `help/upstream/manual/puzzles.but` and
      `scripts/build-manual.sh`; drop the `build:assets` script from
      `package.json` and the `/src/assets/manual/` rule from `.gitignore`.
- [x] 3.2 `git rm Brewfile`. halibut is its only entry and existed only for the
      manual; after this the repo has no native toolchain dependency at all.
- [x] 3.3 Remove from `vite.config.ts`: the manual `sources`/`resolve` entry, the
      `manpage` existence check that decorates each overview, and the sitemap's
      `/help/manual/doc` + `/help/manual/docindex` special-cases.
      *Also `cleanupHalibutHtml`, the transform that existed only to fix up
      halibut's output.*
- [x] 3.4 Remove the `manpage` link from `help/_overview.html.hbs`. **A dangling
      "instruction manual" link would be worse than deleting the manual** —
      ~~grep the built output for `help/manual` and require zero hits.~~
      **That check is blind and was replaced.** It returns zero *while 42 dead
      links ship*, because this project's own pages link relatively
      (`manual/cube`, `manual/`, `manual/common#common`) and never spell
      `help/manual`. Every internal `href` in `dist/help/` is now resolved
      against `dist/` instead: 544 checked, all resolving.
- [x] 3.5 `rmdir help/upstream` (it is now empty) and delete its README. Update
      the `help/upstream/` references in `AGENTS.md` and `README.md`.
      *Also `CREDITS.md`, `licences/README.md`, `docs/porting/hint-authoring.md`,
      `openspec/project.md`, `.gitattributes`, `biome.json`, `knip.json`,
      `scripts/gate.sh` and `.github/workflows/ci.yml` (which apt-installed
      halibut and ran `build:assets` — not listed in the original plan).*
- [x] 3.6 Delete the stale generated `src/assets/manual/` from the working tree.
- [x] 3.7 **Not in the original plan.** Fix the four *own* help pages that
      linked into the manual: `help/puzzles.md` (a `manual` link per row),
      `help/index.md`, `help/features.md`, `help/differences.md`. The two
      genuine cross-references (`#common`, `#common-id`) are repointed at
      upstream's live copy — verified 200 with both anchors present.

## 4. Verify (D5)

- [x] 4.1 `npm run build`; assert `dist/help/` has **57** per-game pages and no
      `manual/` directory. *62 pages = 57 games + 5 site pages; no `manual/`.*
- [x] 4.2 Assert the built sitemap lists no `/help/manual/*` URL. *120 URLs,
      zero manual.*
- [ ] 4.3 **Build on a clean checkout without `brew bundle install`.** That this
      now works is the point of the cascade and is not true today.
- [ ] 4.4 Load `/help/<id>.html` for a game that had a manual chapter (cube) and
      one that never did (ascent) — both render, neither shows a broken link.

## 5. Specs and close-out

- [x] 5.1 `repo-layout` — MODIFIED "Every help page the app serves lives under
      `help/`": one directory, one format, no `upstream/` split, plus the
      coverage invariant. *Plus two more the change invalidates: "Repo root
      holds product-level config only" (drops `Brewfile`) and the comment
      doctrine's Brewfile absence-guard example.*
- [x] 5.2 `build-pipeline` — MODIFIED "The asset build produces the catalog and
      manual without a WASM toolchain": there is no asset build; the catalog is
      committed source and nothing else is generated. *Plus MODIFIED "Continuous
      integration runs the full gate on push to main", which required the
      workflow to build the manual.*
- [x] 5.2a **Not in the original plan.** `puzzle-icons` — MODIFIED: its "Icons
      are not gitignored" scenario contrasted the committed icons with
      `src/assets/manual/`, "the only generated-asset directory under
      `src/assets/`". There is no longer a second term.
- [x] 5.3 **Sweep the pending changes.** `openspec/changes/*/` (not `archive/`)
      is unarchived work someone will implement, so a stale path there is worse
      than one in a spec: it will be followed. Grep the twelve non-archived
      changes for `help/upstream`, `build:assets` and `Brewfile` and correct what
      this change invalidates. *One change affected: `claim-project-authorship`
      (proposal + tasks), whose "do not touch upstream's words" carve-out named
      `help/upstream/`.*
- [x] 5.4 `openspec validate retire-the-upstream-help-tree --strict`.
- [ ] 5.5 **Owner acceptance is required before archiving**, because this removes
      player-visible content. Show the built `/help/` before and after.
