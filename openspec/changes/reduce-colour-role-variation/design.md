# reduce-colour-role-variation — design (the census)

Every game's `colours()` under `src/games/*/` was read in full (57 of 57; the
only literals left anywhere are Unruly's two sanctioned bases in
`palette-games.ts`). Line numbers are as of `unify-board-background`; they will
drift, the file names will not.

## Cursor — `CURSOR` in 12 games, 17 other answers

| games | value | reason at the assignment? |
| --- | --- | --- |
| ascent, bricks, clusters, flip, galaxies, loopy, magnets, pattern, rect, singles, tracks, unruly | `CURSOR` | — |
| slide | `RED` | yes (`slide/render.ts`, long) |
| sticks, subsets | `PURPLE` | yes |
| mines | `PINK` | yes |
| spokes | `PURPLE` | **no** |
| blackbox | `RED` | **no** |
| mosaic | `PINK_WASH` | **no** |
| guess | `INK` | **no** |
| untangle | `GREY` (`COL_CURSORPOINT`) | **no** |
| pegs | `BLUE_WASH` | **no** |
| boats | `INK` + `PAPER` two-tone | **no** |
| filling, lightup, signpost | `bg × 0.5` under three names (`fillingCursor`, `lightupCursor`, `signpostCursor`) | derivation only |
| bridges | `bridgesCursor`, a warm board tint | the tint `DRAG_ADD`'s doc declares unusable; Galaxies was moved off it |
| twiddle | `twiddleCursorHigh/Low`, a red board tint | derivation only |
| slant | mkhighlight `highlight` | one line |
| range | `COL_LOWLIGHT` aliased `== COL_CURSOR` | one line |

## "Done / used up" — five encodings

| meaning | value | games |
| --- | --- | --- |
| clue retired | `clueDoneColour` (`bg ÷ 1.5`) | magnets, towers, undead |
| fleet entry retired | `GREY_WASH` | boats (`COL_SHIP_FLEET_DONE`) |
| clue text retired | `GREY` | mosaic (`COL_TEXT_SOLVED`) |
| hub satisfied | `spokesSatisfied` (`bg × 0.85`) | spokes |
| clue satisfied | `INK` | loopy (`COL_SATISFIED`) |

## Region correct

`correctRegionColour` (`bg × 0.75`): palisade, separate, rect. `fillingCorrect`
(`bg × 0.9`): filling — same meaning, different value.

## Black / white tile — three encodings, opposite dark behaviour

| encoding | dark behaviour | games |
| --- | --- | --- |
| `BLACK` / `WHITE` (pinned) | does not invert | pearl, pattern, mosaic, bricks, inertia, mines, guess |
| `INK` / `PAPER` | inverts | **lightup, singles**, range, galaxies |
| `UNRULY_BLACK` / `UNRULY_WHITE` (no dark value) | calculated | unruly |

Light Up's `augmentation.ts` override (`{2: [0.5,0,0], 3: [0.95,0,0]}`) and
Unruly's (`{3..8: false}`) both exist to undo the encoding.

## Held / drag origin

| value | site |
| --- | --- |
| `HELD` | bridges, spokes |
| `GREEN` raw (= `HELD`) | signpost |
| `BLUE` on a slot named `COL_HELD` | crossing |
| `raise(block.base)` bevel | slide |
| `PINK_WASH` (`COL_HOLD`) | guess |
| `BLUE` / `BLUE_WASH` (= `DRAG_ADD` / `DRAG_REMOVE`) written raw | pegs, untangle |

## Hint roles

| deviation | site | reason? |
| --- | --- | --- |
| `TEAL_BOLD` written where `HINT_EVIDENCE` is the role | undead | explains teal, not the bypass |
| `COL_HINT_DARKREF = ORANGE` where pattern/singles use `HINT_WHITEREF` | lightup | **no** |
| `COL_HINT = ORANGE` | untangle | **no** |
| `COL_HINT = PURPLE` | clusters | no (galaxies documents the same choice) |
| `COL_HINT = GREEN`, `COL_HINT_CELL = GREEN_BOLD` | crossing | yes, extensive |

## Grid lines — 4 roles + 13 bespoke derivations

- `INK`: ~25 games (boats, clusters, crossing, filling, group, keen, map,
  palisade, range, separate, solo, sticks, tents, towers, undead, loopy, and as
  `COL_BORDER`/`COL_OUTLINE` in ascent, bricks, mathrax, rome, salad, seismic,
  inertia, sokoban, flood).
- `GRID_MID`: abcd, subsets, unequal — and **mines uses `GRID_MID` for the digit
  8**, which is not a grid-line meaning (it wants `GREY`).
- `GRID_DARK`: pattern, unruly, pearl, spokes, crossing.
- `lowlight`: singles, sokoban.
- derived: blackboxGrid `×0.9`, flipGrid `÷1.5`, galaxiesGrid `×0.8`,
  lightupGrid `÷1.5`, netBorder `×0.5`, netslideBorder `×0.5`, rectGrid `×0.5`,
  signpostGrid `÷1.3`, slantGrid `×0.7`, tracksGrid mix, bridgesGrid mix,
  dominosaEdge `⅔`.

## Duplicate arithmetic in `palette-games.ts`

| value | names |
| --- | --- |
| `bg × 0.5` | fillingCursor, lightupCursor, signpostCursor, blackboxCover, netBorder, netslideBorder, rectGrid — 7 names, 4 meanings |
| `bg × 0.9` | blackboxGrid, fillingCorrect, soloXDiagonals, twiddleGentleLowlight, plus `lineNoColour`'s light half |
| `bg ÷ 1.5` | lightupGrid, flipGrid, plus `clueDoneColour` |
| `bg × 0.8` | galaxiesGrid, slantGrounded, netslideLowlight |
| `bg × 0.75` | netLocked, netslideFlashing, plus `correctRegionColour` |
| `bg × ⅔` | dominosaEdge, minesLowlight, guessEmptySlot |
| `pencilColour` exactly | slideMainBlockBase (already flagged in its own doc as deliberately not that role) |

## Other one-offs

| slot | value | site | should be |
| --- | --- | --- | --- |
| `COL_COLLISION_TEXT` | `PAPER` | boats | `ERROR_TEXT` (map, tents) |
| `COL_LINE` (player's line) | `GREEN` | sticks | `playerEntryColour` family |
| `COL_G_BALL` / `COL_G_HOLE` / `COL_G_BALLBG` | `GREEN_BOLD` / `GREEN_WASH` | salad | player-entry family at other steps |
| `COL_SELECTED` | `PURPLE_WASH` | crossing | `highlightWash` meaning |
| `COL_CURSOR_GUIDE` | `GREY` | pattern | same value as `UNDECIDED` four lines above |
| `COL_DRAGPOINT` | `WHITE` (pinned) | untangle | a transient affordance must read in both schemes |
| `COL_PENCIL` without `COL_PENCIL_BODY` | — | group, rome | 10 of 12 pencil games carry `PENCIL_BODY` |

## Solved flash

| convention | games |
| --- | --- |
| `PAPER` | pearl, tracks, undead, loopy, mines, untangle |
| mkhighlight `highlight` (same value as `PAPER` now the board is one tone) | palisade, separate, sokoban, inertia, unequal, subsets, magnets |
| highlight + lowlight three-phase wave | abcd, rome, seismic, salad, pegs |
| mkhighlight `lowlight` | singles, mathrax, range |
| `highlightWash` (`bg × 0.78`) | solo, keen, towers, group, filling |
| `COL_GRID` | slant, lightup |
| scaled background | netslide (`× 0.75`) |
| a named colour | guess `TEAL_WASH`, blackbox `GREEN` text, flood `COL_SEPARATOR` |
| state swap, no flash colour | pattern, mosaic, clusters, bricks, unruly, boats, dominosa, bridges |
| geometry / animation only | fifteen, sixteen, twiddle, net, cube, map, crossing, signpost, ascent, galaxies, rect, spokes, sticks, tents, samegame, slide |

Upstream Palisade's flash is the mkhighlight **lowlight**
(`game_mkhighlight(fe, ret, COL_BACKGROUND, -1, COL_FLASH)`); the port wired
the highlight. Separate's C takes the background raw; its port mirrored
Palisade.

## Remaining `darkMode.paletteOverrides`

| game | override | what it patches |
| --- | --- | --- |
| bricks | `{0: [0.4,0,0], 2: [0.6,0,0]}` | index 0 = mkhighlight bg; index 2 = `BLACK`, already pinned — the `0.6` predates that |
| flood | `{1: false}` | `COL_SEPARATOR = INK`; a separator between coloured regions means `BLACK` |
| galaxies | `{6: 0.8}` | `COL_EDGE = INK` |
| lightup | `{2: [0.5,0,0], 3: [0.95,0,0]}` | `INK`/`PAPER` standing in for `BLACK`/`WHITE` |
| mines | `{0: [0.2,0,0], 14: 0.8}` | the board (was raw; now unified) and `COL_FLAGBASE = INK` |
| pearl | `{0: 1.15}` | a genuine scheme tweak on a computed background — no token can carry it |
| solo | `{2: 0.8}` | `COL_GRID = INK`, where 25 other `INK` grids carry no override |
| unruly | `{3..8: false}` | two `mkhighlightSpecific` trios whose bases have no dark value |

## Token-copy hazard

`[...x]` copies that silently drop a token's dark tag (`colour-token.ts` says no
test can catch these): signpost/render.ts, sokoban/render.ts, flip/index.ts,
galaxies/index.ts. All currently copy computed, untagged values, so harmless —
and exactly the pattern the doc warns about.
