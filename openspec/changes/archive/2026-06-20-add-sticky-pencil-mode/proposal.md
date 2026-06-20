# Sticky pencil mode + on-screen pencil-mode indicator (Towers)

## Why

Coming from the mobile builds, players expect pencil/note entry to be a *mode*:
right-click (or its touch equivalent) once to enter note mode, then keep tapping
cells to drop pencil marks, until you right-click again to leave. Our Towers
port (and upstream) instead reverts to real entry on every left-click, so the
mouse can't sustain note-taking the way the keyboard already can (arrow + Enter
stays in pencil mode). And nothing tells the player which mode they're in.

## What changes

- **Sticky pencil mode, default on.** New Towers `Ui.pencilSticky` (default true)
  exposed as a `Game.prefs` boolean. When on, a right-click *toggles* a
  persistent pencil mode and a left-click only moves the highlight (keeping the
  current mode); when off, behaviour is exactly upstream (left-click reverts to
  real entry, right-click is a per-cell pencil select). The keyboard path is
  unchanged — it was already sticky (Enter toggles, arrows keep the mode) — so
  this unifies the mouse with it.
- **A CapsLock-style indicator.** While pencil mode is active, Towers draws a
  small pencil glyph in the tower-safe top-right corner of the clue ring, so the
  mode is always visible. Encoded as a high tile-flag bit on a corner tile that
  no tower ever overlaps and that is no cell's up-left neighbour, so the existing
  diff cache repaints it cleanly on toggle.

## Impact

- Affected specs: `towers` (new requirement: sticky pencil mode + indicator).
- Affected code: `src/native/games/towers/{state,index,render}.ts`,
  `towers.test.ts` (sticky interpretMove + indicator render tests).
- A reusable pattern for the remaining pencil-mark games (Solo/Keen/Unequal/
  Undead) when ported; documented in the port playbook.
- Default-on is a deliberate divergence (mobile-style), like Untangle's
  crossed-edge highlight.
