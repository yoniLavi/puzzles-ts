# Colour inventory — audit-game-colour-palette

<!-- Generated during audit-game-colour-palette. Not regenerated automatically;
     the live guarantee is palette.test.ts, which fails on an undeclared colour. -->

**Totals:** 687 palette entries across 57 games;
407 (59%) resolve to a shared
role or the mkhighlight trio; 280 are declared game-local;
17 changed value.

## Every colour that changed value

| Game | # | Local name | Before | After | Now |
| --- | --- | --- | --- | --- | --- |
| clusters | 6 | `COL_ERROR` | `[0.9, 0, 0]` | `[1, 0, 0]` | `ERROR` |
| filling | 2 | `COL_HIGHLIGHT` | `[0.5789, 0.5789, 0.5789]` | `[0.64506, 0.64506, 0.64506]` | `highlightWash()` |
| filling | 8 | `COL_HINT_CELL` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| galaxies | 9 | `COL_MISTAKE` | `[0.85, 0.1, 0.1]` | `[1, 0, 0]` | `ERROR` |
| group | 9 | `COL_HINT_CELL` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| keen | 8 | `COL_HINT_CELL` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| magnets | 11 | `COL_MISTAKE` | `[0.85, 0, 0]` | `[1, 0, 0]` | `ERROR` |
| netslide | 9 | `COL_HINT` | `[0.3, 0.5, 0.9]` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |
| pattern | 10 | `COL_HINT_CELL` | `[0.7, 0.84, 0.98]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| salad | 19 | `COL_HINT` | `[0.13, 0.4, 0.75]` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |
| salad | 20 | `COL_HINT_CELL` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| solo | 11 | `COL_HINT_CELL` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| tents | 9 | `COL_MISTAKE` | `[0.85, 0, 0]` | `[1, 0, 0]` | `ERROR` |
| towers | 9 | `COL_HINT_CELL` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| undead | 12 | `COL_HINT_CELL` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| unequal | 10 | `COL_HINT_CELL` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |
| unruly | 12 | `COL_HINT_CELL` | `[0.7, 0.84, 0.98]` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |

## Per game

### abcd

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_OUTERBG` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_INNERBG` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 2 | `COL_GRID` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 3 | `COL_BORDERLETTER` | `[0, 0, 0.4962]` | *local* |  |
| 4 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 5 | `COL_GUESS` | `[0, 0.4962, 0]` | `playerEntryColour()` |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_PENCIL` | `[0.4135, 0.4135, 0.827]` | `pencilColour()` |  |
| 8 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 9 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 10 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |

### ascent

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_MIDLIGHT` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 2 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 3 | `COL_BORDER` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_LINE` | `[0, 0.5, 0]` | *local* |  |
| 5 | `COL_IMMUTABLE` | `[0, 0, 1]` | *local* |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_CURSOR` | `[0, 0.7, 0]` | *local* |  |
| 8 | `COL_ARROW` | `[1, 1, 0.8]` | *local* |  |

### blackbox

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_COVER` | `[0.4135, 0.4135, 0.4135]` | *local* |  |
| 2 | `COL_LOCK` | `[0.5789, 0.5789, 0.5789]` | *local* |  |
| 3 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_FLASHTEXT` | `[0, 1, 0]` | *local* |  |
| 5 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 6 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 7 | `COL_GRID` | `[0.7443, 0.7443, 0.7443]` | *local* |  |
| 8 | `COL_BALL` | `[0, 0, 0]` | `INK` |  |
| 9 | `COL_WRONG` | `[1, 0, 0]` | `ERROR` |  |
| 10 | `COL_BUTTON` | `[0, 1, 0]` | *local* |  |
| 11 | `COL_CURSOR` | `[1, 0, 0]` | `ERROR` |  |

### boats

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_CURSOR_A` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_CURSOR_B` | `[1, 1, 1]` | `PAPER` |  |
| 4 | `COL_WATER` | `[0.5, 0.7, 1]` | *local* |  |
| 5 | `COL_SHIP_CLUE` | `[0.1, 0.1, 0.1]` | *local* |  |
| 6 | `COL_SHIP_GUESS` | `[0, 0, 0]` | `INK` |  |
| 7 | `COL_SHIP_ERROR` | `[0.8, 0, 0]` | *local* |  |
| 8 | `COL_SHIP_FLEET` | `[0, 0.5, 0]` | *local* |  |
| 9 | `COL_SHIP_FLEET_DONE` | `[0.7, 0.7, 0.7]` | *local* |  |
| 10 | `COL_SHIP_FLEET_STRIPE` | `[0, 0, 0]` | `INK` |  |
| 11 | `COL_COUNT` | `[0, 0, 0]` | `INK` |  |
| 12 | `COL_COUNT_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 13 | `COL_COLLISION_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 14 | `COL_COLLISION_TEXT` | `[1, 1, 1]` | `PAPER` |  |
| 15 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 16 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |

### bricks

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_MIDLIGHT` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 2 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 3 | `COL_BORDER` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_SHADE` | `[0.1, 0.1, 0.1]` | *local* |  |
| 5 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_CURSOR` | `[0, 0.7, 0]` | *local* |  |
| 7 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 8 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |

### bridges

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_FOREGROUND` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 3 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 4 | `COL_SELECTED` | `[0.25, 1, 0.25]` | *local* |  |
| 5 | `COL_MARK` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 6 | `COL_HINT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 7 | `COL_GRID` | `[0.7436666666666666, 0.7436666666666666, 0.7436666666666666]` | *local* |  |
| 8 | `COL_WARNING` | `[1, 0.25, 0.25]` | *local* |  |
| 9 | `COL_CURSOR` | `[1, 0.6616, 0.6616]` | *local* |  |

### clusters

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_0` | `[0.8, 0.5, 0.5]` | *local* |  |
| 3 | `COL_1` | `[0.1, 0.1, 0.8]` | *local* |  |
| 4 | `COL_0_DOT` | `[0.1, 0.1, 0.1]` | *local* |  |
| 5 | `COL_1_DOT` | `[1, 1, 1]` | `PAPER` |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` | `[0.9, 0, 0]` → `[1, 0, 0]` |
| 7 | `COL_CURSOR` | `[0, 0.7, 0]` | *local* |  |
| 8 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 9 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |
| 10 | `COL_HINT_DANGER` | `[0.95, 0.6, 0.15]` | *local* |  |

### crossing

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_OUTERBG` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 2 | `COL_INNERBG` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 3 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 4 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 5 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_WALL_L` | `[0.13333333333333336, 0.13333333333333336, 0.13333333333333336]` | *local* |  |
| 7 | `COL_WALL_M` | `[0.3, 0.3, 0.3]` | *local* |  |
| 8 | `COL_WALL_H` | `[0.4666666666666667, 0.4666666666666667, 0.4666666666666667]` | *local* |  |
| 9 | `COL_PENCIL` | `[0.4135, 0.4135, 0.827]` | `pencilColour()` |  |
| 10 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |
| 11 | `COL_GHOST` | `[0.45485000000000003, 0.45485000000000003, 0.45485000000000003]` | *local* |  |
| 12 | `COL_HELD` | `[0, 0.35, 0.85]` | *local* |  |
| 13 | `COL_ACROSS` | `[0.6358, 0.7854, 0.9429]` | *local* |  |
| 14 | `COL_DOWN` | `[0.9044, 0.7296, 0.5911]` | *local* |  |
| 15 | `COL_ACROSSFIT` | `[0.1499, 0.4005, 0.6341]` | *local* |  |
| 16 | `COL_DOWNFIT` | `[0.5706, 0.3156, 0.0216]` | *local* |  |
| 17 | `COL_HINT` | `[0.3811, 0.7399, 0.4024]` | *local* |  |
| 18 | `COL_HINT_CELL` | `[0.8523, 0.9559, 0.8515]` | *local* |  |

### cube

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_BORDER` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_BLUE` | `[0, 0, 1]` | *local* |  |

### dominosa

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_DOMINO` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_DOMINOCLASH` | `[0.5, 0, 0]` | *local* |  |
| 4 | `COL_DOMINOTEXT` | `[1, 1, 1]` | `PAPER` |  |
| 5 | `COL_EDGE` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 6 | `COL_HIGHLIGHT_1` | `[0.85, 0.2, 0.2]` | *local* |  |
| 7 | `COL_HIGHLIGHT_2` | `[0.3, 0.85, 0.2]` | *local* |  |
| 8 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` |  |
| 9 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 10 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |
| 11 | `COL_REFERENCE` | `[0.6, 0.2, 0.8]` | *local* |  |

### fifteen

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 3 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 4 | `COL_HINT` | `[0.3, 0.5, 0.9]` | *local* |  |

### filling

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_HIGHLIGHT` | `[0.64506, 0.64506, 0.64506]` | `highlightWash()` | `[0.5789, 0.5789, 0.5789]` → `[0.64506, 0.64506, 0.64506]` |
| 3 | `COL_CORRECT` | `[0.7443, 0.7443, 0.7443]` | *local* |  |
| 4 | `COL_ERROR` | `[1, 0.70295, 0.70295]` | `errorWash()` |  |
| 5 | `COL_USER` | `[0, 0.4962, 0]` | `playerEntryColour()` |  |
| 6 | `COL_CURSOR` | `[0.4135, 0.4135, 0.4135]` | *local* |  |
| 7 | `COL_HINT` | `[0.62, 0.81, 0.96]` | `HINT_FILL` |  |
| 8 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` → `[0.82, 0.9, 0.99]` |

### flip

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_WRONG` | `[0.27566666666666667, 0.27566666666666667, 0.27566666666666667]` | *local* |  |
| 2 | `COL_RIGHT` | `[1, 1, 1]` | `PAPER` |  |
| 3 | `COL_GRID` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 4 | `COL_DIAG` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 5 | `COL_HINT` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_CURSOR` | `[0.8, 0, 0]` | *local* |  |

### flood

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_SEPARATOR` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_1` | `[1, 0, 0]` | `ERROR` |  |
| 3 | `—` | `[1, 1, 0]` | *local* |  |
| 4 | `—` | `[0, 1, 0]` | *local* |  |
| 5 | `—` | `[0.2, 0.3, 1]` | *local* |  |
| 6 | `—` | `[1, 0.5, 0]` | *local* |  |
| 7 | `—` | `[0.5, 0, 0.7]` | *local* |  |
| 8 | `—` | `[0.5, 0.3, 0.3]` | *local* |  |
| 9 | `—` | `[0.4, 0.8, 1]` | *local* |  |
| 10 | `—` | `[0.7, 1, 0.7]` | *local* |  |
| 11 | `—` | `[1, 0.6, 1]` | *local* |  |
| 12 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 13 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |

### galaxies

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_WHITEBG` | `[1, 1, 1]` | `PAPER` |  |
| 2 | `COL_BLACKBG` | `[0.2481, 0.2481, 0.2481]` | *local* |  |
| 3 | `COL_WHITEDOT` | `[1, 1, 1]` | `PAPER` |  |
| 4 | `COL_BLACKDOT` | `[0, 0, 0]` | `INK` |  |
| 5 | `COL_GRID` | `[0.6616, 0.6616, 0.6616]` | *local* |  |
| 6 | `COL_EDGE` | `[0, 0, 0]` | `INK` |  |
| 7 | `COL_ARROW` | `[0, 0, 0]` | `INK` |  |
| 8 | `COL_CURSOR` | `[1, 0.6616, 0.6616]` | *local* |  |
| 9 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` | `[0.85, 0.1, 0.1]` → `[1, 0, 0]` |

### group

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_USER` | `[0, 0.4962, 0]` | `playerEntryColour()` |  |
| 3 | `COL_HIGHLIGHT` | `[0.64506, 0.64506, 0.64506]` | `highlightWash()` |  |
| 4 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 5 | `COL_PENCIL` | `[0.4135, 0.4135, 0.827]` | `pencilColour()` |  |
| 6 | `COL_DIAGONAL` | `[0.78565, 0.78565, 0.78565]` | *local* |  |
| 7 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` |  |
| 8 | `COL_HINT` | `[0.62, 0.81, 0.96]` | `HINT_FILL` |  |
| 9 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` → `[0.82, 0.9, 0.99]` |

### guess

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_FRAME` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_CURSOR` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_FLASH` | `[0.5, 1, 1]` | *local* |  |
| 4 | `COL_HOLD` | `[1, 0.5, 0.5]` | *local* |  |
| 5 | `COL_EMPTY` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 6 | `COL_1` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `—` | `[1, 1, 0]` | *local* |  |
| 8 | `—` | `[0, 1, 0]` | *local* |  |
| 9 | `—` | `[0.2, 0.3, 1]` | *local* |  |
| 10 | `—` | `[1, 0.5, 0]` | *local* |  |
| 11 | `—` | `[0.5, 0, 0.7]` | *local* |  |
| 12 | `—` | `[0.5, 0.3, 0.3]` | *local* |  |
| 13 | `—` | `[0.4, 0.8, 1]` | *local* |  |
| 14 | `—` | `[0.7, 1, 0.7]` | *local* |  |
| 15 | `—` | `[1, 0.6, 1]` | *local* |  |
| 16 | `COL_CORRECTPLACE` | `[0, 0, 0]` | `INK` |  |
| 17 | `COL_CORRECTCOLOUR` | `[1, 1, 1]` | `PAPER` |  |

### inertia

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_OUTLINE` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 3 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 4 | `COL_PLAYER` | `[0, 1, 0]` | *local* |  |
| 5 | `COL_DEAD_PLAYER` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_MINE` | `[0, 0, 0]` | `INK` |  |
| 7 | `COL_GEM` | `[0.6, 1, 1]` | *local* |  |
| 8 | `COL_WALL` | `[0.8686666666666666, 0.8686666666666666, 0.8686666666666666]` | `wallColour()` |  |
| 9 | `COL_HINT` | `[1, 1, 0]` | *local* |  |
| 10 | `COL_AIM` | `[1, 1, 1]` | `PAPER` |  |
| 11 | `COL_HINT_GOAL` | `[0.7, 0.15, 1]` | *local* |  |

### keen

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_USER` | `[0, 0.4962, 0]` | `playerEntryColour()` |  |
| 3 | `COL_HIGHLIGHT` | `[0.64506, 0.64506, 0.64506]` | `highlightWash()` |  |
| 4 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 5 | `COL_PENCIL` | `[0.4135, 0.4135, 0.827]` | `pencilColour()` |  |
| 6 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |
| 7 | `COL_HINT` | `[0.62, 0.81, 0.96]` | `HINT_FILL` |  |
| 8 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` → `[0.82, 0.9, 0.99]` |

### lightup

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 2 | `COL_BLACK` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_LIGHT` | `[1, 1, 1]` | `PAPER` |  |
| 4 | `COL_LIT` | `[1, 1, 0]` | *local* |  |
| 5 | `COL_ERROR` | `[1, 0.25, 0.25]` | *local* |  |
| 6 | `COL_CURSOR` | `[0.4135, 0.4135, 0.4135]` | *local* |  |
| 7 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 8 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |
| 9 | `COL_HINT_LITREF` | `[0, 0.78, 0.55]` | `HINT_BLACKREF` |  |
| 10 | `COL_HINT_DARKREF` | `[0.98, 0.78, 0.42]` | *local* |  |

### loopy

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_FOREGROUND` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_LINEUNKNOWN` | `[0.7443, 0.7443, 0]` | `lineMaybeColour()` |  |
| 3 | `COL_HIGHLIGHT` | `[1, 1, 1]` | `PAPER` |  |
| 4 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` |  |
| 5 | `COL_SATISFIED` | `[0, 0, 0]` | `INK` |  |
| 6 | `COL_FAINT` | `[0.7443, 0.7443, 0.7443]` | *local* |  |

### magnets

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 5 | `COL_CURSOR` | `[0.9, 0.9, 0.9]` | *local* |  |
| 6 | `COL_DONE` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 7 | `COL_NEUTRAL` | `[0.1, 0.6, 0.1]` | *local* |  |
| 8 | `COL_NEGATIVE` | `[0, 0, 0]` | `INK` |  |
| 9 | `COL_POSITIVE` | `[0.8, 0, 0]` | *local* |  |
| 10 | `COL_NOT` | `[0.2, 0.2, 1]` | *local* |  |
| 11 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` | `[0.85, 0, 0]` → `[1, 0, 0]` |

### map

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_0` | `[0.7, 0.5, 0.4]` | *local* |  |
| 3 | `COL_1` | `[0.8, 0.7, 0.4]` | *local* |  |
| 4 | `COL_2` | `[0.5, 0.6, 0.4]` | *local* |  |
| 5 | `COL_3` | `[0.55, 0.45, 0.35]` | *local* |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_ERRTEXT` | `[1, 1, 1]` | `PAPER` |  |
| 8 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` |  |

### mathrax

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_BORDER` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_GUESS` | `[0, 0.5, 0]` | *local* |  |
| 5 | `COL_PENCIL` | `[0, 0.5, 0.5]` | *local* |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_ERRORBG` | `[1, 0.70295, 0.70295]` | `errorWash()` |  |
| 8 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |

### mines

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_BACKGROUND2` | `[0.78565, 0.78565, 0.78565]` | *local* |  |
| 2 | `COL_1` | `[0, 0, 1]` | *local* |  |
| 3 | `COL_2` | `[0, 0.5, 0]` | *local* |  |
| 4 | `COL_3` | `[1, 0, 0]` | `ERROR` |  |
| 5 | `COL_4` | `[0, 0, 0.5]` | *local* |  |
| 6 | `COL_5` | `[0.5, 0, 0]` | *local* |  |
| 7 | `COL_6` | `[0, 0.5, 0.5]` | *local* |  |
| 8 | `COL_7` | `[0, 0, 0]` | `INK` |  |
| 9 | `COL_8` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 10 | `COL_MINE` | `[0, 0, 0]` | `INK` |  |
| 11 | `COL_BANG` | `[1, 0, 0]` | `ERROR` |  |
| 12 | `COL_CROSS` | `[1, 0, 0]` | `ERROR` |  |
| 13 | `COL_FLAG` | `[1, 0, 0]` | `ERROR` |  |
| 14 | `COL_FLAGBASE` | `[0, 0, 0]` | `INK` |  |
| 15 | `COL_QUERY` | `[0, 0, 0]` | `INK` |  |
| 16 | `COL_HIGHLIGHT` | `[1, 1, 1]` | `PAPER` |  |
| 17 | `COL_LOWLIGHT` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 18 | `COL_WRONGNUMBER` | `[1, 0.6, 0.6]` | *local* |  |
| 19 | `COL_CURSOR` | `[1, 0.5, 0.5]` | *local* |  |

### mosaic

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_UNMARKED` | `[0.5803921568627451, 0.7686274509803922, 0.7450980392156863]` | *local* |  |
| 2 | `COL_GRID` | `[0, 0.4, 0.38823529411764707]` | *local* |  |
| 3 | `COL_MARKED` | `[0.0784313725490196, 0.0784313725490196, 0.0784313725490196]` | *local* |  |
| 4 | `COL_BLANK` | `[0.9254901960784314, 0.9254901960784314, 0.9254901960784314]` | *local* |  |
| 5 | `COL_TEXT_SOLVED` | `[0.39215686274509803, 0.39215686274509803, 0.39215686274509803]` | *local* |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_CURSOR` | `[1, 0.7843137254901961, 0.7843137254901961]` | *local* |  |

### net

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_LOCKED` | `[0.62025, 0.62025, 0.62025]` | `correctRegionColour()` |  |
| 2 | `COL_BORDER` | `[0.4135, 0.4135, 0.4135]` | *local* |  |
| 3 | `COL_WIRE` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_ENDPOINT` | `[0, 0, 1]` | *local* |  |
| 5 | `COL_POWERED` | `[0, 1, 1]` | *local* |  |
| 6 | `COL_BARRIER` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_ERR` | `[1, 0, 0]` | `ERROR` |  |

### netslide

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_FLASHING` | `[0.62025, 0.62025, 0.62025]` | `correctRegionColour()` |  |
| 2 | `COL_BORDER` | `[0.4135, 0.4135, 0.4135]` | *local* |  |
| 3 | `COL_WIRE` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_ENDPOINT` | `[0, 0, 1]` | *local* |  |
| 5 | `COL_POWERED` | `[0, 1, 1]` | *local* |  |
| 6 | `COL_BARRIER` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_LOWLIGHT` | `[0.6616, 0.6616, 0.6616]` | *local* |  |
| 8 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 9 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` | `[0.3, 0.5, 0.9]` → `[0.13, 0.5, 0.85]` |

### palisade

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_FLASH` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_LINE_MAYBE` | `[0.7443, 0.7443, 0]` | `lineMaybeColour()` |  |
| 4 | `COL_LINE_NO` | `[0.7443, 0.7443, 0.7443]` | *local* |  |
| 5 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 7 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |
| 8 | `COL_CORRECT` | `[0.62025, 0.62025, 0.62025]` | `correctRegionColour()` |  |

### pattern

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_EMPTY` | `[1, 1, 1]` | `PAPER` |  |
| 2 | `COL_FULL` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_UNKNOWN` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 5 | `COL_GRID` | `[0.3, 0.3, 0.3]` | *local* |  |
| 6 | `COL_CURSOR` | `[1, 0.25, 0.25]` | *local* |  |
| 7 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 8 | `COL_CURSOR_GUIDE` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 9 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 10 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.7, 0.84, 0.98]` → `[0.82, 0.9, 0.99]` |
| 11 | `COL_HINT_BLACKREF` | `[0, 0.78, 0.55]` | `HINT_BLACKREF` |  |
| 12 | `COL_HINT_WHITEREF` | `[0.62, 0.3, 0.82]` | `HINT_WHITEREF` |  |

### pearl

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_BLACK` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_WHITE` | `[1, 1, 1]` | `PAPER` |  |
| 5 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_GRID` | `[0.4, 0.4, 0.4]` | *local* |  |
| 7 | `COL_FLASH` | `[1, 1, 1]` | `PAPER` |  |
| 8 | `COL_DRAGON` | `[0, 0, 1]` | *local* |  |
| 9 | `COL_DRAGOFF` | `[0.8, 0.8, 1]` | *local* |  |
| 10 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` |  |

### pegs

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_PEG` | `[0, 0, 1]` | *local* |  |
| 4 | `COL_CURSOR` | `[0.5, 0.5, 1]` | *local* |  |

### range

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 3 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 4 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 5 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |
| 6 | `COL_WHITEBG` | `[1, 1, 1]` | `PAPER` |  |
| 7 | `COL_HINT_BLACKREF` | `[0, 0.78, 0.55]` | `HINT_BLACKREF` |  |

### rect

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_CORRECT` | `[0.62025, 0.62025, 0.62025]` | `correctRegionColour()` |  |
| 2 | `COL_LINE` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_GRID` | `[0.4135, 0.4135, 0.4135]` | *local* |  |
| 5 | `COL_DRAG` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_DRAGERASE` | `[0.2, 0.2, 1]` | *local* |  |
| 7 | `COL_CURSOR` | `[1, 0.5, 0.5]` | *local* |  |
| 8 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` |  |

### rome

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_BORDER` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_ARROW_FIXED` | `[0, 0, 0]` | `INK` |  |
| 5 | `COL_ARROW_GUESS` | `[0, 0.5, 0]` | *local* |  |
| 6 | `COL_ARROW_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_ARROW_PENCIL` | `[0, 0.5, 0.5]` | *local* |  |
| 8 | `COL_ARROW_ENTRY` | `[0, 0, 1]` | *local* |  |
| 9 | `COL_ERRORBG` | `[1, 0.70295, 0.70295]` | `errorWash()` |  |
| 10 | `COL_GOALBG` | `[0.78565, 0.78565, 1]` | *local* |  |
| 11 | `COL_GOAL` | `[0, 0, 0.5]` | *local* |  |

### salad

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_BORDER` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_BORDERCLUE` | `[0, 0, 0]` | `INK` |  |
| 5 | `COL_PENCIL` | `[0.4135, 0.4135, 0.827]` | `pencilColour()` |  |
| 6 | `COL_I_NUM` | `[0, 0, 0]` | `INK` |  |
| 7 | `COL_I_BALL` | `[0, 0, 0]` | `INK` |  |
| 8 | `COL_I_BALLBG` | `[1, 1, 1]` | `PAPER` |  |
| 9 | `COL_I_HOLE` | `[0, 0, 0]` | `INK` |  |
| 10 | `COL_G_NUM` | `[0, 0.5, 0]` | *local* |  |
| 11 | `COL_G_BALL` | `[0, 0.1, 0]` | *local* |  |
| 12 | `COL_G_BALLBG` | `[0.95, 1, 0.95]` | *local* |  |
| 13 | `COL_G_HOLE` | `[0, 0.25, 0]` | *local* |  |
| 14 | `COL_E_BORDERCLUE` | `[1, 0, 0]` | `ERROR` |  |
| 15 | `COL_E_NUM` | `[1, 0, 0]` | `ERROR` |  |
| 16 | `COL_E_HOLE` | `[1, 0, 0]` | `ERROR` |  |
| 17 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` |  |
| 18 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |
| 19 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` | `[0.13, 0.4, 0.75]` → `[0.13, 0.5, 0.85]` |
| 20 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` → `[0.82, 0.9, 0.99]` |

### samegame

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_1` | `[0, 0, 1]` | *local* |  |
| 2 | `—` | `[0, 0.5, 0]` | *local* |  |
| 3 | `—` | `[1, 0, 0]` | `ERROR` |  |
| 4 | `—` | `[0.7, 0.7, 0]` | *local* |  |
| 5 | `—` | `[1, 0, 1]` | *local* |  |
| 6 | `—` | `[0, 0.8, 0.8]` | *local* |  |
| 7 | `—` | `[0.5, 0.5, 1]` | *local* |  |
| 8 | `—` | `[0.2, 0.8, 0.2]` | *local* |  |
| 9 | `—` | `[1, 0.5, 0.5]` | *local* |  |
| 10 | `COL_IMPOSSIBLE` | `[0, 0, 0]` | `INK` |  |
| 11 | `COL_SEL` | `[1, 1, 1]` | `PAPER` |  |
| 12 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 13 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |

### seismic

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_BORDER` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_NUM_FIXED` | `[0, 0, 0]` | `INK` |  |
| 5 | `COL_NUM_GUESS` | `[0, 0.5, 0]` | *local* |  |
| 6 | `COL_NUM_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_NUM_PENCIL` | `[0, 0.5, 0.5]` | *local* |  |
| 8 | `COL_ERRORDIST` | `[1, 0, 0]` | `ERROR` |  |
| 9 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |

### separate

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_FLASH` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_LINE_MAYBE` | `[0.7443, 0.7443, 0]` | `lineMaybeColour()` |  |
| 4 | `COL_LINE_NO` | `[0.7443, 0.7443, 0.7443]` | *local* |  |
| 5 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_CORRECT` | `[0.62025, 0.62025, 0.62025]` | `correctRegionColour()` |  |

### signpost

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_GRID` | `[0.6361538461538461, 0.6361538461538461, 0.6361538461538461]` | *local* |  |
| 4 | `COL_CURSOR` | `[0.4135, 0.4135, 0.4135]` | *local* |  |
| 5 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_DRAG_ORIGIN` | `[0.2, 1, 0.2]` | *local* |  |
| 7 | `COL_ARROW` | `[0, 0, 0]` | `INK` |  |
| 8 | `COL_ARROW_BG_DIM` | `[0.7443, 0.7443, 0.7443]` | *local* |  |
| 9 | `COL_NUMBER` | `[0, 0, 0]` | `INK` |  |
| 10 | `COL_NUMBER_SET` | `[0, 0, 0.9]` | *local* |  |
| 11 | `COL_NUMBER_SET_MID` | `[0.697265625, 0.697265625, 0.967265625]` | *local* |  |
| 12 | `COL_B0` | `[0.99609375, 0.99609375, 0.99609375]` | *local* |  |
| 13 | `—` | `[0.99609375, 0.625, 0.4765625]` | *local* |  |
| 14 | `—` | `[0.59375, 0.98046875, 0.59375]` | *local* |  |
| 15 | `—` | `[0.49609375, 0.99609375, 0.828125]` | *local* |  |
| 16 | `—` | `[0.76171875, 0.6484375, 0.99609375]` | *local* |  |
| 17 | `—` | `[0.99609375, 0.64453125, 0]` | *local* |  |
| 18 | `—` | `[0.52734375, 0.8046875, 0.9765625]` | *local* |  |
| 19 | `—` | `[0.99609375, 0.99609375, 0]` | *local* |  |
| 20 | `—` | `[0.99609375, 0.810546875, 0.736328125]` | *local* |  |
| 21 | `—` | `[0.794921875, 0.802734375, 0.53515625]` | *local* |  |
| 22 | `—` | `[0.544921875, 0.98828125, 0.7109375]` | *local* |  |
| 23 | `—` | `[0.62890625, 0.822265625, 0.912109375]` | *local* |  |
| 24 | `—` | `[0.87890625, 0.646484375, 0.498046875]` | *local* |  |
| 25 | `—` | `[0.76171875, 0.724609375, 0.48828125]` | *local* |  |
| 26 | `—` | `[0.76171875, 0.900390625, 0.48828125]` | *local* |  |
| 27 | `—` | `[0.99609375, 0.9033203125, 0.3681640625]` | *local* |  |
| 28 | `—` | `[0.697265625, 0.697265625, 0.697265625]` | *local* |  |
| 29 | `—` | `[0.697265625, 0.4375, 0.33359375]` | *local* |  |
| 30 | `—` | `[0.415625, 0.686328125, 0.415625]` | *local* |  |
| 31 | `—` | `[0.347265625, 0.697265625, 0.5796875]` | *local* |  |
| 32 | `—` | `[0.533203125, 0.45390625, 0.697265625]` | *local* |  |
| 33 | `—` | `[0.697265625, 0.451171875, 0]` | *local* |  |
| 34 | `—` | `[0.369140625, 0.56328125, 0.68359375]` | *local* |  |
| 35 | `—` | `[0.697265625, 0.697265625, 0]` | *local* |  |
| 36 | `—` | `[0.697265625, 0.5673828125, 0.5154296875]` | *local* |  |
| 37 | `—` | `[0.5564453125, 0.5619140625, 0.374609375]` | *local* |  |
| 38 | `—` | `[0.3814453125, 0.6917968750000001, 0.49765625]` | *local* |  |
| 39 | `—` | `[0.440234375, 0.5755859375, 0.6384765625]` | *local* |  |
| 40 | `—` | `[0.615234375, 0.4525390625, 0.3486328125]` | *local* |  |
| 41 | `—` | `[0.533203125, 0.5072265625, 0.341796875]` | *local* |  |
| 42 | `—` | `[0.533203125, 0.6302734375000001, 0.341796875]` | *local* |  |
| 43 | `—` | `[0.697265625, 0.63232421875, 0.25771484375]` | *local* |  |
| 44 | `—` | `[0.896484375, 0.896484375, 0.896484375]` | *local* |  |
| 45 | `—` | `[0.896484375, 0.5625, 0.42890625]` | *local* |  |
| 46 | `—` | `[0.534375, 0.882421875, 0.534375]` | *local* |  |
| 47 | `—` | `[0.446484375, 0.896484375, 0.7453125]` | *local* |  |
| 48 | `—` | `[0.685546875, 0.58359375, 0.896484375]` | *local* |  |
| 49 | `—` | `[0.896484375, 0.580078125, 0]` | *local* |  |
| 50 | `—` | `[0.474609375, 0.72421875, 0.87890625]` | *local* |  |
| 51 | `—` | `[0.896484375, 0.896484375, 0]` | *local* |  |
| 52 | `—` | `[0.896484375, 0.7294921875, 0.6626953125]` | *local* |  |
| 53 | `—` | `[0.7154296875, 0.7224609375, 0.481640625]` | *local* |  |
| 54 | `—` | `[0.4904296875, 0.889453125, 0.63984375]` | *local* |  |
| 55 | `—` | `[0.566015625, 0.7400390625, 0.8208984375]` | *local* |  |
| 56 | `—` | `[0.791015625, 0.5818359375, 0.4482421875]` | *local* |  |
| 57 | `—` | `[0.685546875, 0.6521484375, 0.439453125]` | *local* |  |
| 58 | `—` | `[0.685546875, 0.8103515625, 0.439453125]` | *local* |  |
| 59 | `—` | `[0.896484375, 0.81298828125, 0.33134765625]` | *local* |  |
| 60 | `—` | `[0.911546875, 0.911546875, 0.911546875]` | *local* |  |
| 61 | `—` | `[0.911546875, 0.726, 0.65178125]` | *local* |  |
| 62 | `—` | `[0.710375, 0.903734375, 0.710375]` | *local* |  |
| 63 | `—` | `[0.661546875, 0.911546875, 0.8275625]` | *local* |  |
| 64 | `—` | `[0.794359375, 0.73771875, 0.911546875]` | *local* |  |
| 65 | `—` | `[0.911546875, 0.735765625, 0.4135]` | *local* |  |
| 66 | `—` | `[0.677171875, 0.81584375, 0.90178125]` | *local* |  |
| 67 | `—` | `[0.911546875, 0.911546875, 0.4135]` | *local* |  |
| 68 | `—` | `[0.911546875, 0.8187734375, 0.7816640625]` | *local* |  |
| 69 | `—` | `[0.8109609375, 0.8148671875, 0.681078125]` | *local* |  |
| 70 | `—` | `[0.6859609375, 0.907640625, 0.76896875]` | *local* |  |
| 71 | `—` | `[0.727953125, 0.8246328125, 0.8695546875]` | *local* |  |
| 72 | `—` | `[0.852953125, 0.7367421875, 0.6625234375]` | *local* |  |
| 73 | `—` | `[0.794359375, 0.7758046875, 0.657640625]` | *local* |  |
| 74 | `—` | `[0.794359375, 0.8636953125, 0.657640625]` | *local* |  |
| 75 | `—` | `[0.911546875, 0.86516015625, 0.59758203125]` | *local* |  |

### singles

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_UNUSED1` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_BLACK` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_WHITE` | `[1, 1, 1]` | `PAPER` |  |
| 5 | `COL_BLACKNUM` | `[0.4, 0.4, 0.4]` | *local* |  |
| 6 | `COL_GRID` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 7 | `COL_CURSOR` | `[0.2, 0.8, 0]` | *local* |  |
| 8 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 9 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 10 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |
| 11 | `COL_HINT_STRAND` | `[0.98, 0.78, 0.42]` | *local* |  |
| 12 | `COL_HINT_BLACKREF` | `[0, 0.78, 0.55]` | `HINT_BLACKREF` |  |
| 13 | `COL_HINT_WHITEREF` | `[0.62, 0.3, 0.82]` | `HINT_WHITEREF` |  |

### sixteen

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 3 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 4 | `COL_HINT` | `[0.3, 0.5, 0.9]` | *local* |  |

### slant

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0.5789, 0.5789, 0.5789]` | *local* |  |
| 2 | `COL_INK` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_SLANT1` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_SLANT2` | `[0, 0, 0]` | `INK` |  |
| 5 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 6 | `COL_CURSOR` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 7 | `COL_FILLEDSQUARE` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 8 | `COL_GROUNDED` | `[0.6616, 0.6616, 0.6616]` | *local* |  |
| 9 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 10 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |
| 11 | `COL_HINT_REF` | `[0, 0.78, 0.55]` | `HINT_BLACKREF` |  |

### slide

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 3 | `COL_DRAGGING` | `[0.8825555555555554, 0.8825555555555554, 0.8825555555555554]` | *local* |  |
| 4 | `COL_DRAGGING_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 5 | `COL_DRAGGING_LOWLIGHT` | `[0.7714444444444443, 0.7714444444444443, 0.7714444444444443]` | *local* |  |
| 6 | `COL_MAIN` | `[0.7959442126620244, 0.7959442126620244, 0.9925297495964902]` | *local* |  |
| 7 | `COL_MAIN_HIGHLIGHT` | `[1, 1, 1]` | `PAPER` |  |
| 8 | `COL_MAIN_LOWLIGHT` | `[0.6462258010937013, 0.6462258010937013, 0.805833276175443]` | *local* |  |
| 9 | `COL_MAIN_DRAGGING` | `[0.8639628084413497, 0.8639628084413497, 0.9950198330643268]` | *local* |  |
| 10 | `COL_MAIN_DRAGGING_HIGHLIGHT` | `[1, 1, 1]` | `PAPER` |  |
| 11 | `COL_MAIN_DRAGGING_LOWLIGHT` | `[0.7641505340624676, 0.7641505340624676, 0.8705555174502954]` | *local* |  |
| 12 | `COL_TARGET` | `[0.7959442126620244, 0.9925297495964902, 0.7959442126620244]` | *local* |  |
| 13 | `COL_TARGET_HIGHLIGHT` | `[1, 1, 1]` | `PAPER` |  |
| 14 | `COL_TARGET_LOWLIGHT` | `[0.6462258010937013, 0.805833276175443, 0.6462258010937013]` | *local* |  |

### sokoban

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_TARGET` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 2 | `COL_PIT` | `[0.3301666666666666, 0.3301666666666666, 0.3301666666666666]` | *local* |  |
| 3 | `COL_DEEP_PIT` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_BARREL` | `[0.6, 0.3, 0]` | *local* |  |
| 5 | `COL_PLAYER` | `[0, 1, 0]` | *local* |  |
| 6 | `COL_TEXT` | `[1, 1, 1]` | `PAPER` |  |
| 7 | `COL_GRID` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 8 | `COL_OUTLINE` | `[0, 0, 0]` | `INK` |  |
| 9 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 10 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 11 | `COL_WALL` | `[0.8686666666666666, 0.8686666666666666, 0.8686666666666666]` | `wallColour()` |  |

### solo

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_XDIAGONALS` | `[0.7443, 0.7443, 0.7443]` | *local* |  |
| 2 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_CLUE` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_USER` | `[0, 0.4962, 0]` | `playerEntryColour()` |  |
| 5 | `COL_HIGHLIGHT` | `[0.64506, 0.64506, 0.64506]` | `highlightWash()` |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_PENCIL` | `[0.4135, 0.4135, 0.827]` | `pencilColour()` |  |
| 8 | `COL_KILLER` | `[0.4135, 0.4135, 0.0827]` | *local* |  |
| 9 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |
| 10 | `COL_HINT` | `[0.62, 0.81, 0.96]` | `HINT_FILL` |  |
| 11 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` → `[0.82, 0.9, 0.99]` |

### spokes

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_BORDER` | `[0.3, 0.3, 0.3]` | *local* |  |
| 2 | `COL_HOLDING` | `[0, 1, 0]` | *local* |  |
| 3 | `COL_LINE` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_MARK` | `[0.3, 0.3, 1]` | *local* |  |
| 5 | `COL_DONE` | `[1, 1, 1]` | `PAPER` |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_CURSOR` | `[0, 0, 1]` | *local* |  |
| 8 | `COL_SATISFIED` | `[0.70295, 0.70295, 0.70295]` | *local* |  |
| 9 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 10 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` |  |

### sticks

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_LINE` | `[0, 0.7, 0]` | *local* |  |
| 3 | `COL_NUMBER` | `[1, 1, 1]` | `PAPER` |  |
| 4 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 5 | `COL_CURSOR` | `[0, 0, 1]` | *local* |  |

### subsets

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_OUTERBG` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_INNERBG` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 2 | `COL_GRID` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 3 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 4 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 5 | `COL_FIXED` | `[0, 0, 0]` | `INK` |  |
| 6 | `COL_GUESS` | `[0, 0.5, 0]` | *local* |  |
| 7 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 8 | `COL_CURSOR` | `[0, 0, 1]` | *local* |  |
| 9 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 10 | `COL_HINT_CELL` | `[0.55, 0.75, 0.95]` | *local* |  |
| 11 | `COL_HINT_SPOT` | `[0.1, 0.62, 0.4]` | *local* |  |
| 12 | `COL_HINT_PLACED` | `[0.82, 0.5, 0.1]` | *local* |  |

### tents

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_GRASS` | `[0.7, 1, 0.5]` | *local* |  |
| 3 | `COL_TREETRUNK` | `[0.6, 0.4, 0]` | *local* |  |
| 4 | `COL_TREELEAF` | `[0, 0.7, 0]` | *local* |  |
| 5 | `COL_TENT` | `[0.8, 0.7, 0]` | *local* |  |
| 6 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 7 | `COL_ERRTEXT` | `[1, 1, 1]` | `PAPER` |  |
| 8 | `COL_ERRTRUNK` | `[0.6, 0, 0]` | *local* |  |
| 9 | `COL_MISTAKE` | `[1, 0, 0]` | `ERROR` | `[0.85, 0, 0]` → `[1, 0, 0]` |

### towers

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_USER` | `[0, 0.4962, 0]` | `playerEntryColour()` |  |
| 3 | `COL_HIGHLIGHT` | `[0.64506, 0.64506, 0.64506]` | `highlightWash()` |  |
| 4 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 5 | `COL_PENCIL` | `[0.4135, 0.4135, 0.827]` | `pencilColour()` |  |
| 6 | `COL_DONE` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 7 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |
| 8 | `COL_HINT` | `[0.62, 0.81, 0.96]` | `HINT_FILL` |  |
| 9 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` → `[0.82, 0.9, 0.99]` |

### tracks

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_TRACK_BACKGROUND` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 2 | `COL_GRID` | `[0.9103333333333332, 0.9103333333333332, 0.9103333333333332]` | *local* |  |
| 3 | `COL_CLUE` | `[0, 0, 0]` | `INK` |  |
| 4 | `COL_CURSOR` | `[0.3, 0.3, 0.3]` | *local* |  |
| 5 | `COL_TRACK` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 6 | `COL_TRACK_CLUE` | `[0, 0, 0]` | `INK` |  |
| 7 | `COL_SLEEPER` | `[0.5, 0.4, 0.1]` | *local* |  |
| 8 | `COL_DRAGON` | `[0, 0, 1]` | *local* |  |
| 9 | `COL_DRAGOFF` | `[0.8, 0.8, 1]` | *local* |  |
| 10 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 11 | `COL_FLASH` | `[1, 1, 1]` | `PAPER` |  |
| 12 | `COL_ERROR_BACKGROUND` | `[1, 1, 1]` | `PAPER` |  |

### twiddle

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 3 | `COL_HIGHLIGHT_GENTLE` | `[0.9097000000000001, 0.9097000000000001, 0.9097000000000001]` | *local* |  |
| 4 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 5 | `COL_LOWLIGHT_GENTLE` | `[0.7443, 0.7443, 0.7443]` | *local* |  |
| 6 | `COL_HIGHCURSOR` | `[0.827, 0.4135, 0.4135]` | *local* |  |
| 7 | `COL_LOWCURSOR` | `[0.4962, 0.2481, 0.2481]` | *local* |  |

### undead

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0, 0, 0]` | `INK` |  |
| 2 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 4 | `COL_HIGHLIGHT` | `[0.64506, 0.64506, 0.64506]` | `highlightWash()` |  |
| 5 | `COL_FLASH` | `[1, 1, 1]` | `PAPER` |  |
| 6 | `COL_GHOST` | `[0.4135, 0.827, 0.827]` | *local* |  |
| 7 | `COL_ZOMBIE` | `[0.4135, 0.827, 0.4135]` | *local* |  |
| 8 | `COL_VAMPIRE` | `[0.827, 0.7443, 0.7443]` | *local* |  |
| 9 | `COL_DONE` | `[0.5513333333333333, 0.5513333333333333, 0.5513333333333333]` | *local* |  |
| 10 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |
| 11 | `COL_HINT` | `[0.62, 0.81, 0.96]` | `HINT_FILL` |  |
| 12 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` → `[0.82, 0.9, 0.99]` |

### unequal

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 2 | `COL_TEXT` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_GUESS` | `[0, 0.4962, 0]` | `playerEntryColour()` |  |
| 4 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 5 | `COL_PENCIL` | `[0.4135, 0.4135, 0.827]` | `pencilColour()` |  |
| 6 | `COL_HIGHLIGHT` | `[0.9936666666666666, 0.9936666666666666, 0.9936666666666666]` | `mkhighlight.highlight` |  |
| 7 | `COL_LOWLIGHT` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 8 | `COL_PENCIL_BODY` | `[1, 0.78, 0.17]` | `PENCIL_BODY` |  |
| 9 | `COL_HINT` | `[0.62, 0.81, 0.96]` | `HINT_FILL` |  |
| 10 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` → `[0.82, 0.9, 0.99]` |

### unruly

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 1 | `COL_GRID` | `[0.3, 0.3, 0.3]` | *local* |  |
| 2 | `COL_EMPTY` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 3 | `COL_0` | `[0.8333333333333334, 0.8333333333333334, 0.8333333333333334]` | *local* |  |
| 4 | `COL_0_HIGHLIGHT` | `[1, 1, 1]` | `PAPER` |  |
| 5 | `COL_0_LOWLIGHT` | `[0.6871345029239766, 0.6871345029239766, 0.6871345029239766]` | *local* |  |
| 6 | `COL_1` | `[0.2, 0.2, 0.2]` | *local* |  |
| 7 | `COL_1_HIGHLIGHT` | `[0.36666666666666664, 0.36666666666666664, 0.36666666666666664]` | *local* |  |
| 8 | `COL_1_LOWLIGHT` | `[0.03333333333333338, 0.03333333333333338, 0.03333333333333338]` | *local* |  |
| 9 | `COL_CURSOR` | `[0, 0.7, 0]` | *local* |  |
| 10 | `COL_ERROR` | `[1, 0, 0]` | `ERROR` |  |
| 11 | `COL_HINT` | `[0.13, 0.5, 0.85]` | `HINT_ACTION` |  |
| 12 | `COL_HINT_CELL` | `[0.82, 0.9, 0.99]` | `HINT_EVIDENCE` | `[0.7, 0.84, 0.98]` → `[0.82, 0.9, 0.99]` |
| 13 | `COL_HINT_REF` | `[0.95, 0.6, 0.15]` | *local* |  |

### untangle

| # | Local name | Value | Source | Value change |
| --- | --- | --- | --- | --- |
| 0 | `—` | `[0.6603333333333332, 0.6603333333333332, 0.6603333333333332]` | `mkhighlight.lowlight` |  |
| 1 | `COL_BACKGROUND` | `[0.827, 0.827, 0.827]` | `mkhighlight.background` |  |
| 2 | `COL_LINE` | `[0, 0, 0]` | `INK` |  |
| 3 | `COL_CROSSEDLINE` | `[1, 0, 0]` | `ERROR` |  |
| 4 | `COL_OUTLINE` | `[0, 0, 0]` | `INK` |  |
| 5 | `COL_POINT` | `[0, 0, 1]` | *local* |  |
| 6 | `COL_DRAGPOINT` | `[1, 1, 1]` | `PAPER` |  |
| 7 | `COL_CURSORPOINT` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 8 | `COL_NEIGHBOUR` | `[0.45, 0.7, 1]` | *local* |  |
| 9 | `COL_FLASH1` | `[0.5, 0.5, 0.5]` | `GRID_MID` |  |
| 10 | `COL_FLASH2` | `[1, 1, 1]` | `PAPER` |  |
| 11 | `COL_HINT` | `[1, 0.55, 0]` | *local* |  |
