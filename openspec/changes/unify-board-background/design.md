# unify-board-background — design

## The measurement

Both palettes were resolved through the app's own pipeline — `colours()` on
the host colour `view.ts` hands over, the engine's authored dark values, then
`darkModePalette` with the game's `augmentation.ts` entry at the dark theme's
L 0.20 — rather than read off the source:

| slot | Loopy light | Loopy dark | Palisade light | Palisade dark |
| --- | --- | --- | --- | --- |
| board | `#d4d4d4` | **`#161616`** | `#d4d4d4` | **`#3c3c3c`** |
| flash | `#ffffff` | **`#161616`** (= board) | `#ffffff` | `#161616` |
| ink / grid | `#000000` | `#ffffff` | `#000000` | `#ffffff` |
| undecided edge | `#bfbf00` | `#9e8a2e` | `#bfbf00` | `#9e8a2e` |
| ruled-out edge | `#bfbfbf` | `#4d4d4d` | `#bfbfbf` | `#4d4d4d` |
| error | `#df2225` | `#ee3533` | `#df2225` | `#ee3533` |

Separate is identical to Palisade. The only differences are the board and, as
a consequence, whether the flash can be seen.

## The census (all 57 games' `colours()`, read in full)

| background derivation | games |
| --- | --- |
| raw `defaultBackground` (22) | boats, clusters, cube, filling, flip, group, keen, lightup, loopy, map, mines, mosaic, net, netslide, rect, solo, spokes, sticks, tents, towers, undead, unruly |
| `mkhighlight(...).background` (30) | ascent, blackbox, bricks, bridges, dominosa, fifteen, flood, inertia, magnets, mathrax, palisade, pattern, pearl, pegs, range, rome, salad, samegame, seismic, separate, signpost, singles, sixteen, slant, slide, sokoban, tracks, twiddle, unequal, untangle |
| `mkhighlightBackground` alone (1) | galaxies |
| raw outer + shifted inner (3) | abcd, crossing, subsets |
| a board token (1) | guess (`guessBoard`, a conditional rescale of the host) |

Every raw-background game's C calls `frontend_default_colour`; every shifting
game's C calls `game_mkhighlight` (Separate's C is raw; its port mirrored
Palisade). Netslide is the only one of the 22 whose comment says which it did
and why.

## Decisions

### D1 — Shift at the engine boundary, not in 22 games

Two ways to close the split: edit each raw-background game to call
`mkhighlight`, or hand every game a shifted background from the one place
`colours()` is invoked. The second is one function and a contract; the first is
22 edits and a convention the next port can forget, which is exactly how the
split arose. `resolvePalette(game, host)` is that place, and the midend, the
render-scenario harness and `dark-palette.test.ts` all go through it. A game
keeps calling `mkhighlight` when it wants the bevel trio; it gets the identical
background back.

The idempotence claim was checked before building on it: `mkhighlightBackground`
applied twice to pure white returns the same three doubles, bit for bit, and the
trio derived from the once-shifted value equals the trio derived from white.
The reason is structural — the shifted value sits at exactly K from white, and
the shift fires only for a distance strictly less than K.

### D2 — Not in `view.ts`

The frontend could hand the engine an already-shifted white. That keeps
`Game.colours` "the host background, raw", but leaves the engine's own callers
(the render-scenario harness, every test resolving a palette) able to reproduce
the split, and puts the collection's board tone in the app shell rather than
next to the palette it belongs to. The spec's statement that the app supplies
pure white in dark mode stays literally true at the app boundary.

### D3 — The three dual-background games lose a dark-only distinction

ABCD, Crossing and Subsets paint a raw outer margin and a shifted inner board.
In light mode the two are already identical (the host is outside the shift's
reach), so the distinction only ever showed in dark mode, as a by-product. After
this change the two indices hold one value in both schemes. The indices stay —
a future design may want the margin distinct — but the current difference was
never designed and is not preserved. Owner to confirm in Chrome (proposal,
"Player-visible effect").

### D4 — The flash convention is left for the follow-up

With one board, `PAPER` and `mkhighlight`'s highlight are the same value in both
schemes, so Loopy's flash and Palisade's now match without touching either. The
remaining flash variation (a bevel wave, `highlightWash`, `COL_GRID`, a state
swap, none) is a per-game *design* and belongs with the other player-visible
choices in `reduce-colour-role-variation`, where Palisade's upstream lowlight
flash is also recorded.

## What replaces the assurance

Nothing byte-matched here was lost: the light-mode palettes are unchanged and
every render snapshot is byte-identical. The new guard is stronger than what
existed — no test previously compared two games' boards at all.
