# Tasks — claim-project-authorship

## 0. Decide (owner) — blocks the rest

- [ ] 0.1 The name shown to players (`repoName` = "Puzzles web app";
      `package.json` = `puzzles-ts`).
- [ ] 0.2 The destination for source / discussion / bug-report links.
      **`git remote -v` says `https://github.com/yoniLavi/puzzles-ts.git`** — so
      a target does exist, and the earlier "there is no remote to point at" was
      wrong. What is still the owner's call: whether that repository is public,
      and whether Issues/Discussions are enabled on it. Source-code link can
      point there regardless; bug-report and forum links need the features
      turned on, or they should be dropped rather than pointed at a 404.
- [ ] 0.3 The deployment URL for README's "Play the puzzles" (currently
      `puzzles.twistymaze.com`, which is puzzles-web's).
- [ ] 0.4 The version string (`package.json` `0.0.1`).
- [ ] 0.5 Whether `SETTINGS_BACKUP_SCHEMA` changes. **Default: no.** It is
      written into every exported backup and compared with strict equality on
      import (`src/store/settings.ts:465`), so renaming it orphans every backup
      a player has already exported. If it changes, the import path must accept
      the old value too.

## 1. About dialog (`src/dialogs/about-dialog.ts`)

- [ ] 1.1 Rewrite the opening blurb: authored by Yoni Lavi; lineage in order;
      described as a native TypeScript implementation, not a WASM adaptation.
- [ ] 1.2 Give Mike Edmunds a first-class Credits entry naming him as the author
      of `puzzles-web` — he must end up credited more clearly, not less.
- [ ] 1.3 Resolve the first-person voice in Credits ("from which I've freely
      borrowed several clever ideas") — re-attribute to Mike Edmunds by name, or
      rewrite without the pronoun.
- [ ] 1.4 Repoint `repoLink` / `forumLink` / `issuesLink` per 0.2. Keep
      `sgtPuzzlesLink`, `unreleasedPuzzlesLink` and a puzzles-web link as
      *attribution* links.

## 2. Other player-facing surfaces

- [ ] 2.1 `templates/index.html.hbs` — footer credits link.
- [ ] 2.2 `unsupported.html` — the fallback "try this instead" link.
- [ ] 2.3 `README.md` — `[play]`, `[discussions]`, `[issues]`.
- [ ] 2.4 `package.json` name/version per 0.1 and 0.4.

## 3. Consistency

- [ ] 3.1 Re-read `LICENSE.md` and `CREDITS.md`. They were made correct by
      `rehome-upstream-help-sources` (four MIT layers; a Lennard Sprong
      section); this change must not regress them, and the About dialog's
      wording should agree with them.
- [ ] 3.2 Confirm `licences/` is untouched — those notices are verbatim
      upstream material and no part of this change may edit them. (`help/upstream/`
      is gone as of `retire-the-upstream-help-tree`: the per-puzzle pages under
      `help/games/` keep upstream's wording but are this project's to maintain,
      so the constraint that applies to them is the ordinary "don't rewrite
      someone's words without cause", not "never touch".)

## 4. Verify

- [ ] 4.1 Read the rendered About dialog and front page in Chrome (per
      `playwright-cli`), not the diff — this is wording about people's names.
- [ ] 4.2 Gate green; `openspec validate claim-project-authorship --strict`.
- [ ] 4.3 Owner acceptance **on the wording**, then archive and commit.
