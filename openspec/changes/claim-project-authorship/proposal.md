# claim-project-authorship

## Why

The app still introduces itself to players as somebody else's work. Open the
About dialog today and the first sentence is:

> A web adaptation of *Simon Tatham's Portable Puzzle Collection* and *Lennard
> Sprong's* `puzzles-unreleased` additions, **by Mike Edmunds**

and the Credits below it are written in a first person — *"from which **I've**
freely borrowed several clever ideas"* — that is no longer the person who
maintains this. The front page footer sends a reader wanting credits and
licences to `github.com/medmunds/puzzles-web`. The About dialog's source,
forum and bug-report links all point there too, so a player who finds a bug in
*this* app is directed to file it against the project this one forked from.

That was accurate when the fork was a thin layer over puzzles-web. It is not
accurate now. Since then this project has: replaced the C/WASM engine with a
native TypeScript midend and `Game` interface, **rewritten all 57 games** in
TypeScript, retired the C engine entirely (`retire-c-engine`), and added
features upstream and puzzles-web do not have (explained hints,
mistake-checking, quick-save, per-game play aids, a designed twelve-colour
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
  project's repository for credits and licences.
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
  Edmunds keep every acknowledgement they have, and Mike Edmunds gains an
  explicit "made puzzles-web" line he does not currently have.
- **The upstream help sources.** `help/upstream/` stays verbatim; this change
  does not touch a word of it.
- **Retitling the puzzles themselves**, or any claim over their design.

## Open decisions (owner)

These are product/identity calls with no technically-correct answer, and the
work should not guess them:

1. **The name shown to players.** `repoName` is "Puzzles web app" and
   `package.json` says `puzzles-ts`. Neither reads like a product. Options: keep
   "Puzzles web app", promote `puzzles-ts`, or a new name.
2. **Where bug reports and discussion go.** Is there a GitHub remote for this
   project to point at? Until there is, the links have no correct target — and
   leaving them on `medmunds/puzzles-web` misroutes reports about code Mike
   Edmunds did not write.
3. **The deployment URL.** `README.md`'s "Play the puzzles" points at
   `puzzles.twistymaze.com`, which is puzzles-web's deployment, not this one's.
4. **The version string.** `package.json` is `0.0.1` and the README calls that
   deliberate. "This is a new version" is easier to state with a version that
   says so.
5. **`SETTINGS_BACKUP_SCHEMA`** — `src/store/settings.ts` writes
   `https://twistymaze.com/puzzles/schemas/puzzle-settings-backup-v1.json` into
   every exported settings backup **and compares it with strict equality on
   import**. Rebranding it makes every previously exported backup file
   unimportable. Recommend leaving it alone, or changing it only together with
   an import path that accepts the old value. This is the one item here with a
   data-compatibility cost.

## Impact

- Affected specs: new `project-identity` capability (how the app presents its
  authorship and lineage to players); `licensing` unaffected but cross-checked.
- Affected code: `src/dialogs/about-dialog.ts`, `templates/index.html.hbs`,
  `unsupported.html`, `README.md`, possibly `package.json`. No engine or game
  code; no puzzle behaviour.
- Risk: low technically, but it is **outward-facing and about people's names**,
  so it is owner-acceptance-gated on the wording, not just on it building.
  Verify by reading the rendered About dialog and front page in the browser, not
  the diff.

## Depends on

- **`rehome-upstream-help-sources`** — landed. It fixed the *legal* attribution
  (four layers in `LICENSE.md`, `licences/`, a `CREDITS.md` section for Lennard
  Sprong). This change fixes the *presentational* attribution on top of it.
