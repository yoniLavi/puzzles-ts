# Tasks — retire-stale-palette-override-comments

## 1. Correct the comments

- [x] 1.1 `src/games/boats/render.ts:32` and `:109` — drop the invented
      `paletteOverrides: { 4: 0.6 }` for the water; keep why index-for-index
      correspondence with the upstream `COL_*` enum matters.
- [x] 1.2 `src/games/inertia/render.ts:67` — drop "touch only index 6". It says
      instead what is true and is the *reason* index order matters there:
      `paletteSwaps` pair indices 2 and 3, and there are no overrides at all.
- [x] 1.3 `src/games/lightup/render.ts:12` and `:57` — drop "target indices 2
      (black) and 3 (light)" / "touch only indices 2/3".
- [x] 1.4 State the constraint in the present tense, per `AGENTS.md` ("comments
      are not diff annotations"): these games declare no dark-mode palette
      overrides, so an appended index cannot collide with one.
- [x] 1.5 Leave Pearl's two comments alone — they are accurate (`{ 0: 1.15 }`,
      the board) — and leave the twelve "has no overrides" comments alone.
- [x] 1.6 **A sixth, not in the proposal's table**: `unruly/render.ts:9` said
      the overrides "apply unchanged" and named no index, so a scan for named
      indices would have passed over it. Corrected, and it is why the guard
      classifies the whole shape rather than matching an index.

## 2. Guard the class

- [x] 2.1 `src/palette-override-claims.test.ts` reads the `paletteOverrides`
      **from the imported `augmentation.ts` module** — not a parse of its text,
      so there is no second reading to drift — and every `paletteOverrides`
      mention in every game's render module, and holds each claim to the
      declaration.
- [x] 2.2 Keys on the **shape** — any mention, in any game, in any phrasing —
      and *classifies* the superset into "declares none" / "names indices" /
      **unclassifiable**, the third being a failure rather than a skip. Placed
      at `src/` with the other cross-boundary guards rather than under
      `src/engine/`, which would have inverted the layering to reach
      `src/puzzle/augmentation.ts`.
- [x] 2.3 Vacuity guard: asserts the render modules found (>50), the mentions
      matched (>15, actual 20) and that the declaration side is non-empty —
      otherwise "declares none" is trivially satisfiable for every game.
      **Floors, not the exact counts the task first asked for**: a new game
      writing the collection's standard "has no dark-mode `paletteOverrides`"
      comment is not a regression, and an exact count would fail on it while
      adding nothing the per-mention checks do not already do.
- [x] 2.4 Proved it fails, four ways: Pearl's declared index 0→1 (both Pearl
      comments red); the six original comments restored via `git stash` (all six
      red, each with its own message, including the unclassifiable one); the
      glob misspelled (vacuity test red, "expected 0 to be greater than 50").
- [x] 2.5 **Deliberately not covered: `paletteSwaps`.** Its prose in the
      collection is about whether *one color* needs a bevel pair
      (`slide/render.ts`: "Flat, so it needs no bevel trio and no
      `paletteSwaps` pair"), not about the game's declared set, so the
      "declares none" form would convict Slide of a defect it does not have.
      Bending three correct comments to fit the guard is contorting the game to
      fit the contract; recorded in the test's doc comment.

## 3. Close

- [x] 3.1 `openspec validate retire-stale-palette-override-comments --strict`.
- [x] 3.2 Full gate, commit, archive.
