# propose-puzzle-categories

**Status: parked for a decision. Nothing here is implemented, and the questions
in §"What needs deciding" are the point of the document.** Raised by the owner
during acceptance of `implement-front-page-and-chrome` (2026-09-07): now that
the collection has a lot more games, it is time to start thinking about
categorizing or tagging them. (Paraphrased rather than quoted, so the spelling
convention applies to it like any other line here.)

## Why

The catalog is 57 games and the home screen browses them as one alphabetical
list. That is a large improvement on the card grid it replaced — search, three
filters, and up to four columns — but every one of those narrows by something
the player already knows: a name, a favorite, a game in progress. **There is no
way to ask "what else is like this one?", which is the question somebody with 57
options actually has.**

Two things make this worth doing deliberately rather than as a small addition:

- **It is genuinely new data.** The obvious candidate for a ready-made taxonomy
  is `PuzzleData.description` — "Letter placement puzzle", "Loop-drawing
  puzzle" — which *looks* like a category field. It is not: **53 distinct values
  across 57 games** (measured 2026-09-07). It is a per-game subtitle wearing a
  category's clothes, and grouping by it would produce 53 groups of one.
- **The taxonomy is the whole decision.** Whatever axes are chosen will be what
  a player navigates the collection by for a long time, and they are not
  recoverable from the code. Everything else — the data field, the filter UI,
  the search integration — is small once the axes exist.

## What needs deciding

These are the owner's calls, not implementation details, which is why this is
parked rather than built:

1. **One taxonomy or several axes?** A single "type" per game (each game in
   exactly one bucket) reads simply and is easy to render as sections. Several
   independent axes — mechanic, board shape, whether it rewards deduction or
   dexterity — is more truthful about the collection but needs a facet UI.
2. **What are the axes?** Sketches, not proposals:
   - *Mechanic*: latin-square, loop-drawing, region-division, shading,
     placement, path-finding, sliding, flood/color.
   - *Board*: square grid, hexagonal, irregular/graph, non-grid.
   - *What it asks of you*: pure deduction, deduction with search, dexterity,
     luck. **This axis is partly derivable already** — `difficultyTiers` names
     the tiers, and a game with no `hint()` is usually one with no technique to
     teach — so it may cost less than it looks.
3. **Curated or derived?** A tag list on each catalog entry is a *declaration a
   mechanism consumes* (like `aliases`), which `AGENTS.md` explicitly permits —
   but only where the value cannot be derived. Some of axis 3 can be. Worth
   splitting the derivable part from the editorial part rather than hand-writing
   all of it.
4. **How it surfaces.** A fourth filter chip? A facet row under the search box?
   Sections in place of the flat list? Related-games links on the puzzle screen
   itself, which is where "what else is like this" is most often asked?

## What this change would do, once decided

- Add the chosen field(s) to `PuzzleData`, with the same discipline `aliases`
  got: a mechanism consumes it, a guard keeps it honest (every game classified,
  no orphan category, no category of one).
- Fold it into `catalog-search.ts`, so typing "loop" finds the loop games
  whether or not the word is in their objective.
- Render it on the home screen per the decision in §4 above.

## Impact

- Affected specs: `app-shell` (how the catalog is browsed); possibly
  `repo-layout` (a new catalog field's guard).
- Affected code: `src/puzzle/catalog-data.ts`, `src/puzzle/catalog-search.ts`,
  `src/screens/home-screen.ts`, `src/css/home-screen.css`.
- Risk: low to build, high to get wrong and then change — a taxonomy a player
  has learned is expensive to renumber.

## Explicitly not in this change

Anything about *difficulty*. A game's tiers are already named, guarded and
player-visible; folding them into a browse taxonomy is a separate question and
would drag the tier-name convention into a UI decision it has no stake in.
