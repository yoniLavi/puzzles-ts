# rehome-upstream-help-sources

## Why

`audit-author-known-issues` established that **a page served to players must not
live inside `puzzles/`** — that tree is an upstream reference, and a page the app
renders is a source file this project owns the presentation of. It moved the
thirteen third-party per-puzzle pages to `help/games/` and wrote the rule into
the `repo-layout` spec.

Two things it did not move are still served from `puzzles/`:

- **`puzzles/puzzles.but`** — halibut source for the in-app manual at
  `/help/manual/*` (45 pages), built by `scripts/build-manual.sh`.
- **`puzzles/html/**/*.html`** — 43 per-puzzle overview fragments rendered at
  `/help/<puzzleId>.html` (`vite.config.ts`).

`retire-c-engine` then deleted everything else under `puzzles/` — the engine,
the leaves, the Embind adapter, the whole CMake tree. What is left is a
directory whose name says "upstream C source" holding, almost entirely, the
help system's inputs. That is now the only reason the directory exists at all.

Owner decision (2026-08-01): do the relocation, but **as its own change**, so
the engine teardown stayed one concern.

## What Changes

- **Move `puzzles/puzzles.but`** to `help/manual.but` (or `help/manual/` if it
  wants siblings), and repoint `scripts/build-manual.sh`.
- **Move `puzzles/html/**/*.html`** to `help/overviews/`, and repoint the
  `sources` / `resolve` entry in `vite.config.ts`.
- **Decide what `puzzles/` becomes.** After the move it holds `LICENCE`,
  `unreleased/{LICENCE,README.md}` and the two unbuilt `unfinished/` C files
  kept as reading references for `add-path-ts-port` / `add-numgame-ts-port`.
  Options: keep the directory for exactly those; or move the licences to the
  root alongside `LICENSE.md` / `CREDITS.md` and the two `.c` files somewhere
  explicitly marked as reference, and delete `puzzles/` outright.
- **Update the `repo-layout` requirement** so it covers *all* player-facing help
  pages, not only the ones this project authors — which is the sentence that
  motivated this change and is currently broader than the repo satisfies.

Explicitly **not** in this change:

- **Rewriting the content.** These are upstream's words, and moving them is not
  a licence to edit them. The manual is Simon Tatham's; the overview fragments
  are his too. Attribution and the MIT notice travel with them.
- **Changing any URL.** `/help/<puzzleId>.html` and `/help/manual/*` are the
  same after this change. A pure source-tree move.

## Impact

- Affected specs: `repo-layout` (the help-page-location requirement widens to
  cover upstream-authored pages; the "`puzzles/` is an upstream reference tree"
  framing is restated or retired).
- Affected code: `vite.config.ts` (two path entries), `scripts/build-manual.sh`
  (one path), plus ~44 file moves. No runtime code.
- Risk: low, and self-revealing — a missed path means the help pages or the
  manual stop being generated, which `npm run build` shows immediately. Verify
  the built `dist/help/` page count is unchanged (61 overview + 45 manual).

## Depends on

- **`retire-c-engine`** — landed. It removed everything else from `puzzles/`,
  which is what makes this a tidy move rather than a reorganisation of a live
  source tree.
