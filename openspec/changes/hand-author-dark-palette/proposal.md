# hand-author-dark-palette

## Why

**Dark mode is computed from the light palette by a formula, and it should not be.**
Every colour the collection shows in dark mode today is the light-mode colour pushed
through `darkModeColor` in `src/utils/color.ts`, with a per-index escape hatch in
`augmentation.ts` for what the formula gets wrong.

That design was correct when it was written. `color.ts` and `augmentation.ts` are
Mike Edmunds', 2026-01-20, from **puzzles-web — where every game was C/WASM**. The
palette came out of `game_colours()` compiled inside the wasm, and the premise of that
project was running Simon's source unmodified. You cannot hand-author a dark palette
for a game whose colours are computed inside a binary you have decided not to patch.
A generic OKLCH adaptation plus per-index overrides was the only thing available.

**All 57 games are native TypeScript in this repo now, so the constraint is a fossil**
— and `audit-game-colour-palette` (archived) just made hand-authoring cheap: 407 of the
collection's 687 palette entries (59%) now come from ~18 named shared roles. Authoring
dark mode for those is **18 values, not 407**.

The formula's failure is measurable, not a matter of taste. Dark mode splits on chroma:
greys go through `invertLightness`, which is relative to the background; chromatic
colours go through `adjustChromatic`, which compresses lightness into a fixed band and
**never looks at the background at all**. So a colour that was a subtle tint of the
board becomes a loud patch on it. Checking the one invariant that ought to hold —
*a colour keeps its relationship to the background across the scheme flip* — finds
**150 violations across 45 of the 57 games, every one in the same direction.** The
owner reported it as Slide's target zone glowing green; that is indices 6, 9, 12 and 14
of one game out of forty-five.

`adjustChromatic`'s own comment names the cause: it is stuck between colours used as
text (which need lightness) and colours used as fills (which need darkness), and
*"Knowing the intended use of the color could improve the results significantly."*
**Roles are exactly that knowledge**, and they now exist.

## What Changes

- **Each shared role in `src/native/engine/palette.ts` gains a hand-authored dark
  value**, alongside its light one. Where a dark value has already been chosen by hand
  it is *harvested, not re-invented* — `augmentation.ts` is full of them. Where none
  exists, it is calculated (see below).
- **Two roles split, because the audit found them doing two jobs.** `augmentation.ts`
  carries seven games saying "do not invert this `INK`/`PAPER`", with comments reading
  *"black and white pegs"*, *"black mine"*, *"white and black squares"*, *"preserve
  black, white"*. Those colours are not ink and paper: they are **pieces that are
  black or white**, where the colour *is* the game's meaning, and inverting it says the
  opposite. `PIECE_BLACK`/`PIECE_WHITE` split out and keep their black and white in
  dark mode; `INK`/`PAPER` inherit their true structural meaning and invert.
- **Everything not covered by a role is calculated**, by a rule that fixes the measured
  defect: preserve a colour's relationship to its background, rather than compressing
  chromatic colours into a fixed band. This is the ~10-line `color.ts` fix, demoted
  from "the mechanism" to "the fallback".
- **The engine resolves the scheme, not the app.** `colours()` gains a scheme, roles
  are resolved to their authored dark values inside the engine, and the app stops
  running its own adaptation over a TS game's palette (it keeps per-game overrides and
  grey-tinting). Forced by Comlink: role tags cannot survive a structured clone, so
  resolution must happen worker-side of that boundary.
- **The per-game overrides that existed only to fight the formula are deleted.** 15 of
  31 `paletteOverrides` say "this `INK`/`PAPER` is semantic" — that is now the role's
  job, stated once.

## Impact

- Affected specs: `ts-engine` (the palette requirement gains a per-scheme obligation).
- Affected code: `src/native/engine/palette.ts` (dark values, role split),
  `src/utils/color.ts` (fallback rule), `src/native/engine/midend.ts` + the worker
  adapter + `src/puzzle/puzzle-view.ts` (scheme plumbing), `src/puzzle/augmentation.ts`
  (redundant overrides removed). **No game file changes** — games keep assigning the
  role constants they already assign.
- **Dark mode changes visibly in most games. That is the point**, but it means the
  light palette must be provably untouched: light mode is a regression surface here,
  and every existing render snapshot is a light-mode frame, so the suite already
  guards it.
- No save-format, bundle or runtime impact.
