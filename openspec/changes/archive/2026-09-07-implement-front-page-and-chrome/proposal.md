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

The information architecture carries a fourth problem of a different kind:
`hint`, `toggle-reference` and `check-and-save` are offered from **both** the
game menu and the toolbar, and eleven further commands are split between them
under no rule. A player has to learn both surfaces and can still miss a command
that lives only in the other.

*(`findMistakes` having one production caller, `checkAndSave`, is **not** a
defect. The combined command was requested and designed that way, and it keeps
its quick-access position. A separate, quieter check-only command is added for
the one case the combination cannot serve — see `design.md` §4.6.)*

## What Changes

Authoritative detail is
`openspec/changes/archive/2026-09-07-design-front-page-and-chrome/design.md`
§4; this lists the work.

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
- **`Check & save` keeps quick access (§4.4, §4.5)**, bordered in the rail and
  with a permanent slot in the phone bar; a quieter `Check without saving` is
  added for the case a one-slot checkpoint cannot serve.
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

## The three player-visible calls — answered by the owner, 2026-09-07

Asked before any of it was designed as settled (`design.md` §4.9):

1. **`Other puzzles` is replaced by a quick-switch**, not merely removed — a
   type-to-filter jump over all 57 games on `Ctrl/Cmd+K`, plus a
   `Switch puzzle…` row in `More…` so touch keeps the capability.
2. **`statusbar-placement` is retired.** The rail gives the status line one
   home; only nine games print one. A stored preference key is dropped.
3. **`Check & save` / `Back to last save`** — one name for the save in every
   game, and a partner that says where it takes you.

## Depends on

- **`design-front-page-and-chrome`** — archived 2026-09-07 as
  `openspec/changes/archive/2026-09-07-design-front-page-and-chrome/`. Its
  `design.md` §4 is the direction this change implements, and the canvas it was
  chosen on is <https://claude.ai/code/artifact/8c5b60eb-4b17-4b15-b408-3d8cacab280d>.
