# implement-front-page-and-chrome

## Why

`design-front-page-and-chrome` chose a direction on a canvas and recorded it in
that change's `design.md` §4: **B · Index**, with the puzzle screen's
information architecture rebuilt rather than inherited. This change builds it.

The direction is not only a look. Three of the four things it fixes are defects
rather than matters of taste, measured against the running app:

- The front page has **two content axes** — the intro is `max-width: 61ch`
  centered, the catalog grid is `max-width: 75rem` from the left padding — so at
  desktop width the prose floats mid-viewport while the cards sit hard left.
- The puzzle app bar **overflows at 390px**: `header` is a non-wrapping flex row
  with no min-width budget, so "Other puzzles" runs under Help and the type menu
  truncates to `7…`.
- The board **uses about a third of its gray panel**, framed by dead surface.

And the information architecture carries a fourth, larger one: **`findMistakes`
is implemented by 42 of 57 games and has exactly one production caller**,
`checkAndSave`. The only way a player can have their work checked is to try to
save a checkpoint.

## What Changes

Authoritative detail is `design-front-page-and-chrome`'s `design.md` §4; this
lists the work.

- **Tokens (§4.1).** Replace the Web Awesome stock brand blue with the recorded
  ground/rail/hairline/text/link scale in both schemes, and move
  `vite.config.ts`'s `theme_color`/`background_color` with them — they are those
  tokens' resolved values, typed out as hex, and a retheme that misses them
  ships a splash screen that disagrees with the app.
- **Type, spacing, radius (§4.2).** IBM Plex Sans, with IBM Plex Mono for
  numerals read as quantities.
- **The rail replaces the top bar and the game menu (§4.3, §4.4).** One command
  surface. Every command has exactly one home, grouped by what it acts on and
  ordered by frequency; every row carries a label, which is affordable only
  because the surface is vertical.
- **The phone bar (§4.5).** Four actions — Undo, Redo, Next hint, More — with
  `More` opening the rail as a sheet in the same order and wording. The hint's
  explanation sits above the bar, out from under a thumb.
- **`Check my work` (§4.6).** A front door for `findMistakes`.
- **The move counter replaces the History button.** `currentMove`/`totalMoves`
  are already signals on `Puzzle` and are shown nowhere.
- **Home: one content axis, the dense list, search, and a Resume row.**
- **Keyboard shortcuts return (§4.7).** Always-on Ctrl/Cmd chords for undo and
  redo; bare `u`/`r`/`n`/`h` behind a preference, suppressed for a game that
  consumes that letter — derived from what the game already declares, never
  from a roster.

## Impact

- Affected specs: `app-shell` — the chrome follows the recorded direction; every
  command has exactly one home; app-level undo/redo shortcuts exist.
- Affected code: `src/css/*`, `src/screens/{home,puzzle}-screen.ts`,
  `src/components/catalog-card.ts`, `src/puzzle/components/{history,type-menu,
  other-puzzles-menu,keys}.ts`, `templates/index.html.hbs`, `vite.config.ts`.
- Risk: this is the largest player-visible change the fork has made. The
  acceptance bar applies in full — the owner judges it on sight, in dark, on a
  phone and on a desktop, and no shortfall is called cosmetic.

## Open questions for the owner — ask before changing, not after

Three items break something a player can already see or has already set
(`design.md` §4.9):

1. **Removing the `Other puzzles` menu** — a control disappears. The catalog is
   one click away at the top of the rail and is now searchable.
2. **`statusbar-placement`** (`start` / `end` / `hidden`) becomes moot once the
   rail hosts the status line. That is a stored preference key.
3. **Renaming Quick-save / Quick-load** to Save checkpoint / Return to
   checkpoint — the old words appear in toasts and alerts a player may know.

## Depends on

- **`design-front-page-and-chrome`** — the recorded direction. Archive it first.
