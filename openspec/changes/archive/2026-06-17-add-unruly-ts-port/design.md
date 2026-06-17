# Design: Unruly TS port

## Long-tail-risk pre-flight (all clear)

Read `puzzles/unruly.c` against the playbook's checklist:

- **`midend_supersede_game_desc`** — not used. Unruly never rewrites its desc.
- **Undo via state-string equality** — not used. No-op suppression is local and
  decidable: `interpret_move` returns `MOVE_NO_EFFECT` when the click wouldn't
  change the targeted cell, so we return `null` from `interpretMove`, exactly
  like Galaxies/Mosaic.
- **`#ifdef EDITOR` move letters** — none; Unruly has no editor.
- **`printing.c`** — Unruly has a `game_print`, but printing has no TS
  replacement fork-wide and is out of scope for every port so far. Not ported.

## Cell semantics (note the colour/value mapping)

Upstream `enum { EMPTY, N_ONE, N_ZERO, BOGUS }`. **`N_ONE` renders dark
("black", `COL_1` = 0.2 grey); `N_ZERO` renders light ("white", `COL_0` = 0.95
grey).** `BOGUS` is solver-internal (a temporary fill used by the near-complete
technique so it doesn't perturb the running counts) and never appears in a real
state — modelled as a local solver constant, not a state value.

Left-click cycles `empty → 1 → 0 → empty`; right-click cycles
`empty → 0 → 1 → empty`; number keys `1`→one, `0`/`2`→zero, backspace/middle →
empty. Faithful to `interpret_move`.

## Palette: mirror the C colour-enum indices exactly

`src/puzzle/augmentation.ts` already carries a dark-mode `paletteOverrides` map
for `unruly` keyed by **colour index** (`{3..8: false}` to preserve the
black/white tiles and their 3-D bevels under dark mode). To keep that working
unchanged, the TS palette uses the identical index layout as the C enum:

```
0 BACKGROUND  1 GRID  2 EMPTY
3 COL_0  4 COL_0_HIGHLIGHT  5 COL_0_LOWLIGHT
6 COL_1  7 COL_1_HIGHLIGHT  8 COL_1_LOWLIGHT
9 CURSOR  10 ERROR
```

`COL_0`/`COL_1` highlight + lowlight are derived with the new
`mkhighlightSpecific(base)` helper (see below), matching
`game_mkhighlight_specific(fe, ret, COL_0, COL_0_HIGHLIGHT, COL_0_LOWLIGHT)`.

## New shared helper: `mkhighlightSpecific(base)`

The existing `mkhighlight(bg)` derives a bg/highlight/lowlight trio from the
*frontend background*, and never extrapolates the base (the background path
pre-shifts the bg away from the extremes first, so the base never sits within
`K` of white/black by the time highlight/lowlight are computed). Unruly instead
feeds two **fixed** base colours (`COL_0` = 0.95 grey, `COL_1` = 0.2 grey)
straight into `game_mkhighlight_specific`. `COL_0` is within `K = √3/6 ≈ 0.289`
of white (its distance is `√3·0.05 ≈ 0.087`), so the C code **shifts the base
itself** darker and saturates the highlight to pure white. The existing helper
doesn't do that, so we add a faithful port:

- lowlight pass: `db = dist(base, black)`; if `db < K`, lowlight = black and the
  base is extrapolated away from black; else lowlight = `mix(base, black, K/db)`.
- highlight pass: `dw = dist(base, white)`; if `dw < K`, highlight = white and
  the base is extrapolated away from white, **and lowlight is recomputed from
  the shifted base using the *original* `db`** (a deliberate C detail —
  `colour_mix(bg, black, k/db, lowlight)` reuses the pre-shift `db`); else
  highlight = `mix(base, white, K/dw)`.

Returns `{ base, highlight, lowlight }`. The near-white epsilon guard from
`mkhighlightBackground` is reused so doubles that round-trip a hair off exact
equality don't overflow `K/dw`.

## Solver shape

Idiomatic TS rewrite of `unruly_solve_game`. Scratch counts live in a small
`UnrulyScratch` object (four `Int32Array`s: ones/zeros × rows/cols), rebuilt or
incrementally bumped as cells are filled, exactly as upstream. Each technique
returns the number of cells it filled; the driver loops, restarting after any
progress, gated by difficulty (`TRIVIAL` → threes + single-gap; `EASY` → +
complete-nums + uniques; `NORMAL` → + near-complete). Returns the max difficulty
whose technique fired (upstream's `maxdiff`), `-1` if already solved/no progress.

`validateCounts` returns `-1` (a row/col exceeds its target — contradiction),
`+1` (some row/col still short — incomplete), or `0` (balanced), and optionally
fills a boolean error overlay. `validateRows` flags 3-in-a-row runs (and, in
unique mode, fully-equal row/col pairs) into an int overlay, returning `-1` on
any error. Completion is `validateCounts == 0 && validateRows == 0`.

`BOGUS` temporary fills in `near_complete`: in TS, rather than mutating the
immutable state, the technique works on the solver's own mutable working grid (a
plain `Uint8Array` the solver owns) — the solver is the one place we keep a
mutable C-style grid, because it fills thousands of cells per generation and an
immutable clone per fill would be wasteful and un-idiomatic. The `Game`'s
`executeMove` stays pure; only the solver/generator mutate their private grid.

## Generator shape

`fillGame`: shuffle all cell indices, walk them placing a random colour in each
still-empty cell and running the solver to fixpoint after each placement (so
forced cells fill in), then accept iff the result is a valid full grid. `newDesc`:
from the filled grid, shuffle indices and try clearing each cell, keeping the
clear iff the solver at the target difficulty still reaches a counts-valid
solution; then a too-easy gate — for `diff > TRIVIAL`, re-solve at `diff − 1`
and require it to *not* finish (so the puzzle genuinely needs the target
technique). Encode the surviving clues run-length.

## Render shape

Per-tile `Int32Array` cache keyed on a packed flag word (the upstream `tile`
int: cell value bits, error bits, cursor, flash, immutable). `redraw`
recomputes the error overlays each frame from `validateRows`/`validateCounts`
(live error display, like upstream and like Range/Mosaic), packs per-tile flags,
and redraws only changed tiles. The engine paints no pixels of its own — the
`!started` branch fills the background and the outer grid edge. Completion flash
inverts the tile toward its highlight/lowlight in alternating thirds, matching
`game_redraw`'s `FF_FLASH1`/`FF_FLASH2`.

## Cache-key bit budget

The packed flag word fits in well under 31 bits (the C `tile` int uses bits up
to `FF_IMMUTABLE = 0x1000`, plus we fold cursor/flash); `Int32Array`, never
`BigInt`, per the playbook. No sidecar array needed.
