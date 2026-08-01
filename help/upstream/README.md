# Upstream help sources

Everything under this directory is **Simon Tatham's words**, taken verbatim from
the upstream Portable Puzzle Collection and licensed MIT — see
[`../../licences/sgt-puzzles-LICENCE`](../../licences/sgt-puzzles-LICENCE).

**Do not edit any of it.** This project owns where these files live, how they
are built and how they are presented; it does not own what they say. Changing
the words here is a content decision about someone else's writing, not a
refactor. Everything the project *does* write lives outside this directory:
[`../*.md`](..) for the fork's own help pages and [`../games/`](../games/) for
the thirteen third-party puzzles whose pages we maintain.

## `manual/puzzles.but`

Upstream's manual, in [halibut](https://www.chiark.greenend.org.uk/~sgtatham/halibut/)
source form. `scripts/build-manual.sh` (via `npm run build:assets`) runs halibut
over it, emitting one HTML page per chapter into `src/assets/manual/` —
gitignored, regenerated on demand — which `vite.config.ts` then serves at
`/help/manual/*`.

The build is **optional**: without it the app builds fine, the manual pages
simply do not exist and each overview page drops its "manual" link. The halibut
options in the script are the ones upstream's cmake build passed, so the
generated fragment ids the overview pages link to (`manual/<name>#<name>`) are
unchanged.

Note that the source directory is deliberately **not** `help/manual/`: the
manual is the one help source served under a URL *sub*directory, and a real
directory of that name shadows the generated `/help/manual/*` page namespace —
which fails the production build outright (`EISDIR`).

## `overviews/*.html`

The 43 per-puzzle overview fragments, rendered to `/help/<puzzleId>.html` via
[`../_overview.html.hbs`](../_overview.html.hbs). The format is upstream's:
**the first line is the bare title** (optionally prefixed `something:`, as in
`group.html` and `rect.html`) and everything after it is the HTML body. Each
rendered page links on to the corresponding manual chapter when one exists —
see the `manpage` lookup in `vite.config.ts`.

The games with no fragment here are the thirteen third-party ones, whose pages
are in [`../games/`](../games/).

## Why these are not in `puzzles/` any more

A page the app serves to players is an input to this project's build, and its
location should say so. `rehome-upstream-help-sources` (2026-08-01) moved them
here from `puzzles/puzzles.but` and `puzzles/html/`, after `retire-c-engine` had
removed everything else that tree existed for — and with them gone, `puzzles/`
itself is gone. No URL changed.
