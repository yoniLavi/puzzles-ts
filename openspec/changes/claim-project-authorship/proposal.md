# claim-project-authorship

## Why

The app still introduces itself to players as somebody else's work. Open the
About dialog today and the first sentence is:

> A web adaptation of *Simon Tatham's Portable Puzzle Collection* and *Lennard
> Sprong's* `puzzles-unreleased` additions, **by Mike Edmunds**

and the Credits below it are written in a first person — *"from which **I've**
freely borrowed several clever ideas"* — that is no longer the person who
maintains this. The front page footer sends a reader wanting credits and
licenses to `github.com/medmunds/puzzles-web`. The About dialog's source,
forum and bug-report links all point there too, so a player who finds a bug in
*this* app is directed to file it against the project this one forked from.

That was accurate when the fork was a thin layer over puzzles-web. It is not
accurate now. Since then this project has: replaced the C/WASM engine with a
native TypeScript midend and `Game` interface, **rewritten all 57 games** in
TypeScript, retired the C engine entirely (`retire-c-engine`), and added
features upstream and puzzles-web do not have (explained hints,
mistake-checking, quick-save, per-game play aids, a designed twelve-color
palette with a dark scheme). `LICENSE.md` and `CREDITS.md` were brought up to
date by `rehome-upstream-help-sources`; the **player-facing** surfaces were not.

Owner ask (2026-08-01): take visual ownership — present this as a new version by
Yoni Lavi, and credit Mike Edmunds explicitly as the predecessor in the sequence
of creators, the one who made `puzzles-web`.

This is the presentational counterpart to `licensing`, which is the legal one.
The layered MIT notice already gets the lineage right; nothing here changes who
holds copyright or weakens any attribution. **It adds a name to the front of the
chain; it removes none from the middle of it.**

## What Changes

- **The About dialog** (`src/dialogs/about-dialog.ts`) states the project is by
  Yoni Lavi, names the lineage in order (Simon Tatham → Lennard Sprong → Mike
  Edmunds → this project), and says what this version *is* — a native TypeScript
  rewrite, not a WASM adaptation, which is currently what the blurb implies.
  Mike Edmunds moves from "by" to a first-class Credits entry as the author of
  `puzzles-web`. The first-person voice in Credits is either re-attributed or
  made authorless.
- **The front page** (`templates/index.html.hbs`) footer points at this
  project's repository for credits and licenses.
- **The repository / forum / bug-report links** stop pointing at
  `medmunds/puzzles-web`. Currently `about-dialog.ts` (three links),
  `templates/index.html.hbs` (one), `README.md` (two) and `unsupported.html`
  (the fallback "try this instead" link).
- **The app name and version** as presented (`repoName` = "Puzzles web app",
  `package.json` `name`/`version`) are reviewed so that "this is a new version"
  is legible rather than implied.
- **`CREDITS.md` and `LICENSE.md`** are re-read for consistency with the above.
  They are already correct as of `rehome-upstream-help-sources`; this change
  must not regress them.

Explicitly **not** in this change:

- **Any reduction in credit to anyone.** Simon Tatham, Lennard Sprong and Mike
  Edmunds keep every acknowledgment they have, and Mike Edmunds gains an
  explicit "made puzzles-web" line he does not currently have.
- **The upstream license notices.** `licenses/` stays verbatim; this change does
  not touch a word of it. (This bullet used to name `help/upstream/`, which
  `retire-the-upstream-help-tree` deleted — the per-puzzle help pages are now
  this project's own under `help/games/`, keeping upstream's wording. This change
  still does not edit them.)
- **Retitling the puzzles themselves**, or any claim over their design.

## Decisions (owner, 2026-09-02)

These were product/identity calls with no technically-correct answer, so the
work waited for them rather than guessing:

1. **The name shown to players is "Hintful Puzzles"**, short label "Hintful".
   Chosen over "Puzzles web app" (puzzles-web's own name, so no signal of a new
   version) and `puzzles-ts` (a codebase name, not a product). The brief was:
   keep "puzzles" in the name, say something about the hints — the fork's
   defining feature — and pick a word with no collisions. "Hintful" is a coined
   word; a web search found no product of that name, while the closer
   candidates (Hinted, Inkling, Clued In) are each already a daily puzzle game.
   Domain availability was checked against the registries' RDAP servers with a
   registered control: `hintfulpuzzles.com`/`.app` and the short `hintful.*`
   forms under `.click`, `.xyz`, `.games`, `.dev` and others were unregistered
   on the day; `hintful.com` and `hintful.app` were taken. The **repository
   stays `puzzles-ts`**: the product and the codebase are different things, and
   `LICENSE.md` already names the latter. The name has one source,
   `src/project-identity.ts`.
2. **Support links point at `github.com/yoniLavi/puzzles-ts`.** The repository
   is public with Issues enabled and Discussions disabled, so the source and
   bug-report links point there and **the forum link is dropped** rather than
   aimed at a disabled tab.
3. **There is no deployment URL yet.** The app has never been deployed
   (`deploy-the-web-app` is open), so README's "Play the puzzles" link to
   puzzles-web's site is removed and replaced by a "not deployed yet; run it
   locally" note that `deploy-the-web-app` will replace with the real URL.
4. **`package.json` stays at `0.0.1`.** Players never see it: the About dialog
   shows a `YYYYMMDD.<sha>` build string derived in `vite.config.ts`. README's
   "not a mistake" aside is dropped with the migration done; nothing else
   changes.
5. **`SETTINGS_BACKUP_SCHEMA` is untouched.** It is written into every exported
   settings backup and compared with strict equality on import, so renaming it
   orphans every backup a player has already exported, for no player benefit.

One item was reclassified on inspection: the unsupported-browser page's link to
`medmunds.github.io/puzzles/` is offered as an *alternative site* for a browser
this app cannot run on, not as support for this app. It is kept — it is a
recommendation of someone else's product, which is what a player in that
position needs.

## Impact

- Affected specs: new `project-identity` capability (how the app presents its
  authorship and lineage to players); `licensing` unaffected but cross-checked.
- Affected code: `src/project-identity.ts` (new: the name and support links,
  one source), `src/dialogs/about-dialog.ts`, `src/screens/home-screen.ts`,
  `templates/index.html.hbs`, `vite.config.ts` (the PWA manifest name and the
  template data), `help/index.md`, `README.md`, `LICENSE.md` and `CREDITS.md`
  (naming the product beside the repository). No engine or game code; no puzzle
  behavior. Guarded by `src/project-identity.test.ts`.
- Risk: low technically, but it is **outward-facing and about people's names**,
  so it is owner-acceptance-gated on the wording, not just on it building.
  Verify by reading the rendered About dialog and front page in the browser, not
  the diff.

## Depends on

- **`rehome-upstream-help-sources`** — landed. It fixed the *legal* attribution
  (four layers in `LICENSE.md`, `licenses/`, a `CREDITS.md` section for Lennard
  Sprong). This change fixes the *presentational* attribution on top of it.
