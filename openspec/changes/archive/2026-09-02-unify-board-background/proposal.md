# unify-board-background

## Why

**Loopy and Palisade paint different boards in dark mode, and nobody chose
that.** Resolved through the app's own pipeline, both games' palettes are
identical colour for colour in light mode; in dark mode Loopy's board comes out
`#161616` and Palisade's `#3c3c3c`. The undecided and ruled-out edges, the ink,
the error red — every *role* the two games share resolves to the same value in
both schemes since `add-loopy-keyboard-control` authored the roles' dark values.
Only the board differs, and it differs because Palisade's `colours()` runs the
frontend background through `mkhighlight` and Loopy's assigns it raw.

**That is one instance of a split that runs through the whole collection.** A
census of all 57 games' `colours()` (`design.md`) finds 22 games taking the
background raw and 30 shifting it through `mkhighlight`, one (Galaxies) calling
the shift alone, and three (ABCD, Crossing, Subsets) painting a raw *outer* and
a shifted *inner* board. The line is exactly which C function each port
mirrored — `frontend_default_colour` or `game_mkhighlight` — and precisely one
game (Netslide) says so in a comment. Nothing records it as a decision, because
it was never one.

**In light mode the split is invisible, which is why it survived.** The light
host sits at a distance of 0.292 from white and the shift fires strictly inside
0.289, so both halves paint the host as-is and every render snapshot agrees. In
dark mode the frontend hands the engine pure white, the shift always fires, and
the two halves land 0.12 of lightness apart. Two consequences follow for the
raw-background half: their solved flash — `PAPER` in Loopy, Pearl, Tracks,
Undead, Mines and Untangle — inverts to exactly the board they paint, so the
flash blanks the drawing instead of lighting it; and the "two flash
conventions" the census reports (`PAPER` in six games, `mkhighlight`'s highlight
in seven) are the *same* convention seen through the split, since the highlight
of a shifted white is pure white.

## What changes

- **The engine shifts the background once, before any game sees it.**
  `resolvePalette(game, host)` in `colour-mkhighlight.ts` is the one place a
  game's `colours()` is called: it hands the game `mkhighlightBackground(host)`.
  `Midend.getColourPalette`, `Midend.darkPalette` and the render-scenario
  harness go through it. A game that calls `mkhighlight` itself is unaffected —
  the shift is exactly idempotent (a shifted background sits at exactly K from
  the extreme, and the shift fires only strictly inside K), verified
  numerically before building on it.
- **A guard holds every registered game to one board**
  (`src/puzzle/board-background.test.ts`): resolved from pure white and from the
  light host, the colour at each game's `paletteBgIndex` equals the shifted
  host, over all 57 games, with a vacuity check that the shift really fires.
- **The record is corrected where it described the old hand-off**: the
  `palette.ts` and `palette-games.ts` headers, Loopy's and Netslide's and
  Spokes' and Rome's palette comments, `view.ts`'s comment, and
  `docs/games/rendering.md` (a new "Every board is one tone" section; "Dark
  mode is the app's concern" now says to author a role's dark value rather than
  patch a game, which is what the previous change did).
- **No game file changes its colours.** The 22 raw-background games now paint
  the shifted board because they are handed it, not because they were edited.

## What this does not do

- It does not unify the flash *style* (a white fill, a three-phase bevel wave,
  a `highlightWash`, a state swap — the census lists eight), the seventeen
  non-default cursors, the five encodings of "this clue is done", or the
  duplicate arithmetic in `palette-games.ts`. Those are real and are scaffolded
  separately as `reduce-colour-role-variation`, because each is a player-visible
  choice that wants its own look in Chrome, not a by-product of this one.
- It does not record Palisade's flash as the mkhighlight *highlight* where
  upstream's `game_mkhighlight(fe, ret, COL_BACKGROUND, -1, COL_FLASH)` makes it
  the *lowlight*. Display was never in parity scope; the fact is noted in the
  follow-up so the flash convention is settled with it in view.

## Player-visible effect (acceptance)

In dark mode, the board of the 22 raw-background games moves from the page's
own near-black to the light-grey-inverted tone the other 30 already paint
(`#161616` → `#3c3c3c` at the default theme), and their white flash becomes a
visible dark step against it rather than the board itself. ABCD, Crossing and
Subsets lose the dark-mode-only difference between their outer margin and their
inner board (in light mode the two were already one tone). Light mode is
unchanged everywhere, and every render snapshot is byte-identical.
