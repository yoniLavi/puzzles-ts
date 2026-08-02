# retire-the-upstream-help-tree

## Why

`help/upstream/` was kept on the reasoning that upstream material is someone
else's words and moving it is not a licence to edit it. That reasoning is sound
for a *reference*. It is the wrong frame for these two directories, because
**both are served to players** — and one of them tells them things about this app
that are false.

### The manual is documentation for a different program

`help/upstream/manual/puzzles.but` (143 KB of halibut source) builds to 45 pages
served at `/help/manual/*`. It is Simon Tatham's manual for **his desktop
collection**, in his first person — Cube's chapter opens *"This is another one I
originally saw as a web game."* Its "Common features" chapter, served at
`/help/manual/common.html`, currently tells a player of this PWA:

> "The games in this collection deliberately do not ever save information on to
> the computer they run on: they have no high score tables and no saved
> preferences."

This app has IndexedDB saved games, a one-slot quick-save, and a preferences
dialog. The same chapter documents **Load/Save to files on disk**, **Print
(currently only on Windows)**, where the menus sit **on Mac OS X**, and carries
two entire sections — *"Specifying game parameters on the command line"* and
*"Unix command-line options"* — for an app that has no command line.

This is exactly the defect `audit-author-known-issues` was written to fix. That
change found help pages served to players still saying Clusters had "no
difficulty settings" and Crossing had "severe problems", rewrote them, and
established the rule: **these pages introduce the puzzle, never the state of its
implementation** — and, more generally, that a page served to players is a build
input this project owns. The manual is the same defect at 45× the scale. It was
missed because it lived in `puzzles/` and looked like reference material rather
than product.

Coverage measured 2026-08-02: **40 of 57 games** have a manual chapter. Seventeen
do not, and the overview template already drops the link where the page is
missing — so the feature is one that silently applies to 70% of the collection.

### The overviews are good — and they are the only reason `help/` has two formats

`help/upstream/overviews/` is 43 short HTML fragments, and unlike the manual they
are accurate, game-focused and carry no platform assumptions ("Roll the cube
around the grid, picking up the blue squares on its faces"). There is nothing
wrong with the words.

What is wrong is that the help system now has **two sources in two formats doing
one job**: 43 upstream HTML fragments plus 13 markdown pages under `help/games/`
that `audit-author-known-issues` wrote. Cross-referenced against the catalog:
43 + 13 = 56 of 57 games, and **`separate` has no help page at all** — a gap no
one has noticed, because no single place lists what the coverage is.

### What the "no upstream compatibility" premise does and does not reach

Owner, 2026-08-02: *"We don't actually require any upstream compatibility any
more, now that we've completed the port."* True — and it settles the manual. It
deliberately does **not** reach three other things wearing the same label, which
this change leaves alone and which are covered in `design.md` D3:

- `licences/` — an MIT obligation on the code we ported, unrelated to
  compatibility, and a live build input (the About dialog `?raw`-imports both).
- The 48 frozen per-game differentials and `random`'s corpus — not compatibility,
  but the only independent evidence that a refactor did not change which boards
  exist. `random`'s bit-identity has additionally become **self**-compatibility:
  every game ID our own players have shared depends on that exact RNG.
- The two unbuilt `.c` reading references under the greenfield port changes.

## What Changes

- **Delete the manual and everything that exists to build it**:
  `help/upstream/manual/puzzles.but`, `scripts/build-manual.sh`, the
  `build:assets` npm script, the `src/assets/manual/` gitignore rule, the vite
  `sources`/`resolve` entry that serves it, the sitemap's `/help/manual/doc*`
  special-cases, and the `manpage` link in `help/_overview.html.hbs`.
- **Delete `Brewfile`.** halibut is its only remaining entry, and halibut exists
  only for the manual. The repository then has **no native toolchain dependency
  of any kind** — `npm install` is the whole setup.
- **Adopt the 43 overviews into `help/games/`** as markdown, ours to maintain,
  keeping the words. Result: one help directory, one format, one maintenance
  rule. `help/upstream/` is deleted entirely.
- **Write the missing `separate` page**, closing the 56-of-57 gap the
  cross-reference found.
- **Add a coverage test** — every catalog `puzzleId` has a `help/games/<id>.md`
  — in the style of `asset-integrity.test.ts` and `catalog-registry.test.ts`. The
  gap existed because nothing asserted the correspondence.

Explicitly **not** in this change:

- **Rewriting the overview prose.** The words are good; adopting them is a
  licensing-and-ownership move, not an editing one. Attribution is unchanged and
  already complete (`LICENSE.md`, `CREDITS.md`, `licences/sgt-puzzles-LICENCE`).
- **Removing attribution anywhere.** MIT's notice condition is satisfied by
  `licences/`, which this change does not touch.
- **Replacing the manual's long-form content.** Where a chapter genuinely says
  something the overview does not — a solving-technique note, a parameter's
  meaning — that is a per-game follow-up written into that game's `help/games/`
  page in our voice, not a bulk translation.

## Impact

- **Affected specs**: `repo-layout` — "Every help page the app serves lives under
  `help/`" (the authorship split collapses to one directory; the coverage
  invariant is added); `build-pipeline` — "The asset build produces the catalog
  and manual without a WASM toolchain" loses its last generated asset, and with
  it the asset build.
- **Affected code**: `vite.config.ts` (the manual source entry + sitemap
  special-cases), `help/_overview.html.hbs`, `package.json`, `.gitignore`,
  `scripts/build-manual.sh` and `Brewfile` (both deleted), plus 44 new
  `help/games/*.md`.
- **Player-visible**: yes, and that is why this is its own change and needs an
  explicit decision. Players lose 45 pages of long-form notes covering 40 games;
  they stop being told about Windows printing and Unix command-line flags. The
  short per-game help every game already has is unchanged, and one game gains a
  page it never had.
- **Risk**: low mechanically — the manual is *already* optional (gitignored,
  built on demand, and `npm run build` succeeds without it), so the deletion
  removes a path the gate has never depended on. The verification is that
  `dist/help/` emits 57 game pages and **no** `manual/` directory.
