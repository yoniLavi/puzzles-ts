# Design — retire-the-upstream-help-tree

## D1. Delete the manual rather than fix it or fork it

Three options, and the first two lose to arithmetic.

**Fix it in place.** `puzzles.but` is 143 KB of halibut source; correcting it
means rewriting the Common-features chapter (menus, files, printing, two
command-line sections), adjusting 40 chapters written in the first person about
someone else's collection, and then *owning* it — every future divergence this
fork ships becomes a manual edit. It also means editing text that stays under
Simon Tatham's name, which is the one thing the upstream-material rule exists to
prevent.

**Fork it as ours.** Same cost, plus a second long-form help system to maintain
alongside `help/games/`, for content that duplicates what the overview already
says for 40 of 57 games.

**Delete it.** The per-game help every game already has is unchanged; what goes
is long-form prose that is wrong about the platform for its most-read chapter and
absent for 17 games. And the deletion **cascades further than the file**:
`scripts/build-manual.sh`, the `build:assets` script, the halibut dependency and
therefore the entire `Brewfile`, the gitignore rule, the vite source entry and
the sitemap special-cases all exist only to serve it. After this the repository
has **no native toolchain dependency at all** — `npm install` is the whole setup,
where today a contributor is told to `brew bundle install` first.

The thing being given up is real and should be said plainly: some manual chapters
contain solving advice and parameter explanations that the overview does not.
That content is recoverable — `git show` and upstream's own site both have it —
and the honest way to bring any of it back is per game, in this project's voice,
on the page that game already has.

## D2. Adopt the overviews; do not rewrite them, and do not keep them "upstream"

The words are good, so keeping them is easy. The question is which directory they
live in, and the answer changes what the next contributor is allowed to do.

Under `help/upstream/` they are read-only, which is right for a reference and
wrong for a page the app serves: when this fork changes a game — and it has,
repeatedly, and intends to keep doing so — the page describing that game must be
correctable. That is precisely the rule `audit-author-known-issues` established
when it moved 13 pages to `help/games/` and stripped their `## Status` sections.
The remaining 43 are in the older position only because nobody revisited them.

**Decision:** move them to `help/games/` as markdown, words unchanged, and treat
them as ours from then on. MIT permits this without qualification; the
attribution obligation is discharged by `licences/sgt-puzzles-LICENCE` and the
layered notice in `LICENSE.md`, neither of which this change touches. Converting
HTML → markdown is mechanical (these fragments are `<p>`/`<em>` and little else)
and makes them consistent with the 13 that already exist.

**Not** `docs/upstream/` or any other read-only shelf: a served page cannot live
in a tree that forbids editing it, which is the sentence
`rehome-upstream-help-sources` already wrote into the spec and then applied to
only part of the material.

## D3. What the released compatibility constraint does *not* reach

The owner's premise — no upstream compatibility is required any more — is what
settles the manual. Three other things carry the word "upstream" and are governed
by something else entirely; recording the distinction here so it does not have to
be re-derived:

- **`licences/`** — MIT's "included in all copies" condition attaches to the code
  we ported, and is not a compatibility requirement that a completed port
  discharges. They are also live build inputs: the About dialog `?raw`-imports
  both files. Not touchable by this or any change short of removing the ported
  code itself.
- **The 48 per-game differentials, `random`'s corpus, and the grid fixtures** —
  these were *recorded* from upstream but they do not assert compatibility with
  it. They assert that a refactor did not silently change which boards exist,
  which is the property AGENTS.md calls "the net for the refactoring rounds".
  `random`'s case is stronger still: bit-identity is now **self**-compatibility,
  because every game ID our own players have shared and every saved game depends
  on that exact generator. Deleting it would break our users, not upstream's.
- **`add-{path,numgame}-ts-port/reference/*.c`** — reading references for two
  unstarted greenfield ports, filed under the changes that consume them so they
  archive with the work. Nothing to do until those changes land.

The one frozen corpus that *is* redundant is `combi`'s, and for a different
reason — it replays a closed-form mathematical fact its own test file already
states directly. That is handled in `retire-native-directory`, which is already
editing that spec.

## D4. A coverage test, because the gap is what proved the need

Cross-referencing the catalog against both help sources found `separate` with no
help page at all. Nothing had listed the correspondence, so nothing had noticed —
in a repository that already asserts exactly this shape of invariant twice
(`asset-integrity.test.ts` for icons, `catalog-registry.test.ts` for catalog ≡
registry, in *both* directions).

**Decision:** assert it in both directions — every catalog `puzzleId` has a
`help/games/<id>.md`, and every `help/games/*.md` names a catalogued game. The
second direction is what catches a page left behind after a game is renamed, and
is free to add once the first is written.

## D5. How "no player-visible regression beyond the intended one" is checked

- `dist/help/` emits **57** per-game pages (up one: `separate`) and **no**
  `manual/` directory.
- No page 404s: every internal link in the built help is resolved, including the
  `manpage` link's removal from the overview template — a dangling "instruction
  manual" link would be a worse outcome than deleting the manual.
- The sitemap no longer lists `/help/manual/*`, and its two `doc`/`docindex`
  special-cases go with it.
- `npm run build` succeeds **on a clean checkout with no `brew bundle install`**,
  which is the point of the cascade and is not true today.

---

## Findings from implementation

Recorded because three of them overturn something this document or `tasks.md`
asserted, and one of those is the change's own verification step.

### F1. The prescribed verification was blind — grep for a spelling, not a target

`tasks.md` 3.4 said: *"grep the built output for `help/manual` and require zero
hits."* That grep **passes on a tree shipping 42 dead links**, because this
project's own help pages link *relatively* — `help/puzzles.md` writes
`manual/cube`, `help/index.md` writes `manual/`, `help/features.md` writes
`manual/common#common`. The literal string `help/manual` appears in none of
them.

The replacement resolves every internal `href` in `dist/help/` against `dist/`
and reports the ones that do not exist: 544 links checked, all resolving. It is
barely more code and cannot be fooled by a spelling.

This is the fifth instance in this repository of **a check aimed at a neighbour
of the thing it claims to check** — after `grid.test.ts`'s
`d.edges.length === d.order` (against the array that sized it),
`touch-input.test.ts`'s catalog count standing in for a registry count, and the
`import.meta.glob` that silently matched nothing. The tell is the same each
time: the assertion names a *proxy* (a string, a length, a sibling collection)
rather than the *property* (does the target resolve?).

### F2. D2's premise — "the words are good" — was false for two of the 43

D2 reasoned that adopting the overviews is *"a licensing-and-ownership move, not
an editing one"*, and the proposal's out-of-scope list said so explicitly. Two
fragments, `slide.html` and `sokoban.html`, open a
`<strong>Status:</strong>` paragraph with *"This is an experimental, unfinished
puzzle"* — about two games this collection finished, registered, spec'd, tested
and ships.

That is not a new judgement call: `repo-layout` already forbids it in force
today (*"They SHALL NOT carry development status, known-issue lists or roadmap
notes"*), written by `audit-author-known-issues` when it stripped `## Status`
sections from the thirteen `help/games/` pages. **The rule was enforced by one
spelling in one directory**, so an inline `<strong>` label one directory over
survived the sweep that existed to remove it. The coverage test now matches both
forms.

Each player-relevant fact inside those paragraphs was checked before being
dropped rather than assumed stale, which changed the answer twice:

- **Slide's slow generation is real** — 1.5 s median, 3.2 s max at the largest
  preset (8×6, five seeds), because the generator re-solves the board
  exhaustively after every change it makes. Restated in plain prose without the
  status framing.
- **Slide's "keyboard control is not yet supported"** is roughly true (the
  keyboard only steps an installed Solve route) but is a roadmap note about a
  missing capability, and the page already says how the game *is* played. Worth
  surfacing separately: Slide appears to be the only game with no keyboard play,
  which is an accessibility gap rather than a help-page matter.
- **Sokoban's "use it with hand-written level descriptions"** names a workflow
  this app does not present, and whose procedural alternative
  `add-sokoban-level-packs` examined and declined as a nofix.

### F3. The same cross-reference found a second, larger coverage gap

D4 justified the coverage test from `separate` having no help page. Running the
catalog against `help/puzzles.md` — the "Included puzzles" page, which says of
itself *"this table is manually generated for now"* — found it missing **six**:
crossing, group, seismic, separate, slide and sokoban. Four are upstream
*unfinished* puzzles this project finished and ships, which is exactly the
category a reader would not know to look for. Asserted in both directions
alongside the page coverage.

### F4. Two things the deletion reached that the plan did not list

- **`.github/workflows/ci.yml`** apt-installed halibut and ran
  `npm run build:assets` before the gate. `build-pipeline` *required* it to
  (a coverage argument: building the manual was the only thing exercising
  `scripts/build-manual.sh` and vite's manual-page rendering path), so this
  needed a spec delta, not just an edit. Both the script and that path are
  deleted, so the argument has no subject.
- **`help/_unreleased.html.hbs`** rendered the thirteen third-party pages. After
  adoption it renders all 57, so the name was false; renamed `_game.html.hbs`,
  and `_overview.html.hbs` deleted. The two templates differed slightly — the
  overview one emitted `<h1>{{title}}</h1>` above the body and a
  `<p>More information:</p>` list, the other takes its `<h1>` from the markdown
  and uses an `<h2>`. All 57 pages now use the second shape; that is the one
  intended visual difference beyond the manual link's removal.

### F5. Checked and deliberately left alone

Magnets' page says right-clicking cycles to *"a ?? mark"*, which reads like a
typo. It is not: a domino spans two cells and `render.ts` draws `"?"` in each,
so the mark on the domino really is `??`. Left verbatim.

The two genuine cross-references into upstream's manual (`#common`,
`#common-id`) were repointed at **upstream's live copy** rather than deleted —
verified reachable with both anchors present. That is a better destination than
a local fork of it: it stays current, and it is unambiguously theirs, which is
the distinction the local copy blurred.
