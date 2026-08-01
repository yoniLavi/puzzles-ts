# adopt-declarative-config-helpers

## Why

**The largest remaining cross-game duplication is not logic — it is declarative
tables, and for the biggest case the helper already exists and simply was not
used.**

After `unify-border-grid-games`, cross-game duplication stands at 1,985 lines.
Reading the two biggest individual blocks shows what they actually are:

- **41 lines, `lightup/index.ts` ↔ `sticks/index.ts`** — a hand-written
  width/height `paramConfig`. `engine/params.ts` has exported
  `dimensionParamConfig()` since `add-ts-custom-params-config`, **33 games use
  it, and 11 hand-roll the identical table anyway** (`ascent`, `bricks`,
  `lightup`, `loopy`, `map`, `mines`, `mosaic`, `rome`, `seismic`, `sticks`,
  `unruly`). Eight of the eleven have plain `w`/`h` fields and could call the
  helper today.
- **35 lines, `keen/index.ts` ↔ `unequal/index.ts`** — the three pencil-mark
  preference declarations (`auto-pencil`, `sticky-pencil-mode`,
  `pencil-keep-highlight`), copied verbatim in **four** latin-family games
  (`solo`, `keen`, `unequal`, `towers`).

**These are the best remaining targets precisely because they are not logic.**
Neither touches a solver, a generator or a description codec, so no differential
can move and no board can change — the same provable-no-op property that made
`unify-border-grid-games` the right structural change to do first, but with even
less surface.

**And an unused helper is worse than no helper.** `dimensionParamConfig()` exists
to make the Custom-params dialog consistent; eleven games not calling it means
eleven places where a change to the dialog's width/height handling silently
applies to 33 games and not to the other 11. That is the class of drift the
project has already been bitten by — the four-game pencil-prefs copy has exactly
the same shape, and the wording of a preference the player reads is duplicated
four times.

## What Changes

- **Adopt `dimensionParamConfig()` in the games that can use it directly** (those
  with plain `w`/`h` params), replacing the hand-written copies.
- **Handle the three that cannot** (`loopy`, `mosaic`, `unruly` spell their
  dimensions differently) by either widening the helper's constraint to accept a
  field mapping, or recording why each stays hand-written. Do not rename a game's
  params fields to fit the helper — that is contorting a game to fit a contract.
- **Extract the pencil-mark preferences** into one `pencilPrefs()` helper for the
  four latin-family games that declare them identically, so the wording a player
  reads has one source.
- **Re-measure** and report the cross-game clone-line delta against the
  `metrics/2026-08-01-after` baseline.

Explicitly **not** in this change: unifying anything that differs between games,
renaming params fields, or touching the remaining `render.ts` clones — those were
classified in `unify-border-grid-games` as similar-shape/different-content and
that classification stands.

## Impact

- Affected specs: `ts-migration` (a small cross-game convention).
- Affected code: `engine/params.ts`, a new pencil-prefs helper, and up to 15 game
  `index.ts` files.
- **No behaviour change of any kind.** These are declarative tables consumed by
  the Custom-params dialog and the preferences UI; no differential or render
  snapshot may move. The dialogs must still present the same fields with the same
  labels — worth a browser check, because a `paramConfig` regression is invisible
  to the suite and shows up only as an empty or mislabelled dialog (the failure
  mode `add-ts-custom-params-config` was created to fix).
