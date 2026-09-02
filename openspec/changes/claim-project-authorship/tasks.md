# Tasks — claim-project-authorship

## 0. Decide (owner) — blocked the rest; decided 2026-09-02

- [x] 0.1 The name shown to players: **Hintful Puzzles** (short label
      "Hintful"); the repository stays `puzzles-ts`. See the proposal's
      "Decisions" for the brief, the collision check and the domain check.
- [x] 0.2 The destination for source / bug-report links:
      `github.com/yoniLavi/puzzles-ts` (public, Issues on). Discussions is off,
      so the forum link is dropped rather than pointed at a disabled tab.
- [x] 0.3 The deployment URL: none yet. README's play link is removed until
      `deploy-the-web-app` lands.
- [x] 0.4 The version string: `package.json` stays `0.0.1` (players see a
      `YYYYMMDD.<sha>` build string); README's "not a mistake" aside is dropped.
- [x] 0.5 `SETTINGS_BACKUP_SCHEMA`: unchanged (it orphans exported backups).

## 1. One source for the name and the support links

- [x] 1.1 `src/project-identity.ts` — `APP_NAME`, `APP_SHORT_NAME`, `REPO_URL`,
      `ISSUES_URL`; a leaf module imported by both the app and `vite.config.ts`.
- [x] 1.2 `vite.config.ts` — the PWA manifest `name`/`short_name` and the
      template data (`appName`, `repoUrl`) read from it.

## 2. About dialog (`src/dialogs/about-dialog.ts`)

- [x] 2.1 Rewrite the opening blurb: authored by Yoni Lavi; lineage in order
      (Simon Tatham → Lennard Sprong → Mike Edmunds' puzzles-web); described as
      a native TypeScript implementation, not a WASM adaptation.
- [x] 2.2 Give Mike Edmunds a first-class Credits entry naming him as the author
      of `puzzles-web` — credited more clearly, not less.
- [x] 2.3 Resolve the first-person voice in Credits: "from which I've freely
      borrowed" is re-attributed to puzzles-web by name.
- [x] 2.4 Source and bug-report links per 0.2; no forum link. `sgtPuzzlesLink`,
      `unreleasedPuzzlesLink` and `puzzlesWebLink` stay as attribution links.
- [x] 2.5 The blurb and credits are exported templates (`aboutBlurb()`,
      `credits()`) so the guard can render the words without mounting Web
      Awesome's dialog, which does not survive happy-dom.

## 3. Other player-facing surfaces

- [x] 3.1 `templates/index.html.hbs` — title, `application-name`, `<h1>` and
      the footer's source link from the template data; one intro line saying
      what the name promises, claiming only what is true (30 of 57 games hint).
- [x] 3.2 `src/screens/home-screen.ts` — the Lit header's `<h1>` (both layouts)
      from `APP_NAME`; its footer already points at the About box.
- [x] 3.3 `help/index.md` — the help site's heading and one sentence on hints.
- [x] 3.4 `unsupported.html` — kept: its `medmunds.github.io` link recommends
      an alternative site, not support for this app (proposal, "Decisions").
- [x] 3.5 `README.md` — title; the intro names the author, the lineage and
      puzzles-web; the play link becomes a "not deployed yet" note; bug reports
      go to this repository's Issues; no discussions link.
- [x] 3.6 `package.json` — unchanged per 0.1 and 0.4.
- [x] 3.7 The front-page intro is rewritten in this project's own words
      (owner, 2026-09-02): three short paragraphs — what it is, the hints, and
      the Sudoku/Mathdoku signposts — and nothing inherited verbatim from
      puzzles-web. Two inherited lines are removed on purpose: the "actively
      being developed" warning (every web app is), and the "no upsells, no ads,
      no trackers" promise, which nothing in the licenses requires and which
      the owner declined to be bound by.

## 3b. Our own voice, our own logo, real privacy notes (owner, 2026-09-02)

- [x] 3b.1 `APP_TAGLINE` in `src/project-identity.ts` ("logic puzzles with
      hints that explain why") replaces "from Simon Tatham's portable puzzle
      collection and more" in the header (template and Lit, both layouts) and
      in the page title. The lineage moves to the About dialog and the help
      index, where a credit belongs.
- [x] 3b.2 Every player-facing surface rewritten in this project's words, with
      nothing inherited verbatim from puzzles-web: the front page (title, meta
      description, noscript, footer), the puzzle page title, description and
      noscript, `unsupported.html`, `public/404.html`, `help/index.md`,
      `help/differences.md`, `help/install.md`, `help/puzzles.md`'s intro and
      trademark note, `help/_game.html.hbs`'s footer, and the sections of
      `help/features.md` that were puzzles-web's (keyboard, right-click by
      touch, right-drag, checkpoints, autosave, sharing, saving). The sections
      this project wrote (hints, checking, difficulty, mark-all, reference) were
      already its own. The 57 per-game pages keep upstream's wording on purpose.
- [x] 3b.3 Logo review: the favicon was Lucide's stock "boxes" icon (ISC), the
      same one puzzles-web ships — not a trademark, but not ours and not
      distinct. Replaced with this project's own mark, a puzzle grid with one
      cell lit, in `public/favicon.svg` (the source of every generated PWA
      icon). The remaining SVGs under `src/assets/` are Lucide-derived
      depictions of browser controls (Edge's "app available", Firefox's "add to
      taskbar") and mouse buttons — openly licensed glyphs, not logos. No
      third-party logo ships.
- [x] 3b.4 `src/assets/privacy.html` rewritten from the development placeholder
      to real notes: no personal information collected or stored; games and
      settings stay in the browser; any measurement is anonymous and aggregate
      with no cookies or client-side identifier; crash reports (where a build
      enables them) carry the error and the app/browser/screen, with personal
      information disabled — bound to `sendDefaultPii: false` in
      `src/utils/sentry.ts`. `deploy-the-web-app` task 2.4 now reads as
      "keep these true", not "write them".

## 4. Consistency

- [x] 4.1 `LICENSE.md` and `CREDITS.md` name the product beside the repository
      ("Hintful Puzzles, repository `puzzles-ts`"); the four MIT layers and the
      Lennard Sprong section are untouched, and the About dialog's wording
      agrees with them.
- [x] 4.2 `licenses/` untouched (verified by `git status`).
- [x] 4.3 The two open changes that quoted the old default name
      (`deploy-the-web-app`, `test-touch-on-a-real-device`) now say the default
      is the product name and `VITE_APP_NAME` is optional.
- [x] 4.4 `AGENTS.md` states the rule in the present tense: product vs
      repository, one source, support links home / attribution links outward.

## 5. Verify

- [x] 5.1 `src/project-identity.test.ts` — renders the blurb and credits and
      checks the spec's scenarios; scans `src/`, `templates/`, `help/`,
      `vite.config.ts`, `README.md` and `unsupported.html` for the retired name
      and the predecessor's issue tracker, with a vacuity count. Proved to fail:
      a reverted byline and a reintroduced `medmunds/puzzles-web/issues` each
      went red before restoring.
- [ ] 5.2 Read the rendered About dialog and front page in Chrome (per
      `playwright-cli`), not the diff — this is wording about people's names.
- [ ] 5.3 Gate green; `openspec validate claim-project-authorship --strict`.
- [ ] 5.4 Owner acceptance **on the wording**, then archive.
