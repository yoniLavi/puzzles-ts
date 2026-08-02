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
