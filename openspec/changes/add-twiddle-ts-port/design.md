## Context

Twiddle is a grid of numbered tiles; one click rotates an `n×n` subsquare 90°
(left-click / `CURSOR_SELECT` clockwise-ish `dir +1`, right-click /
`CURSOR_SELECT2` `dir −1`). Solved = tile numbers in non-decreasing row-major
order (and, when *orientable*, every tile upright). It is the simplest remaining
upstream game and a sibling of the already-ported Sixteen/Fifteen, so this
design records only what differs from that template plus the few non-obvious
decisions. It also folds in a small, low-risk shared-helper extraction
(geometry + cursor-delta) that Twiddle is the first consumer of.

## Goals / Non-Goals

- **Goals:** faithful gameplay parity with `twiddle.c` (generation, rotation
  semantics, orientable mode, rotation animation, completion flash, status bar,
  click + keyboard input including corner/keypad shortcuts), a working
  `solve()`, idiomatic immutable TS, behavioural + render tests, parity-gated
  registration; extract `coord`/`fromCoord` and `cursorDelta` and migrate
  existing games onto them.
- **Non-Goals:** byte-identical board corpus (advisory differential only),
  `hint()` (no upstream human solver), `findMistakes` (permutation puzzle),
  preferences UI, print, and any abstraction of per-game animation/cache/flash
  beyond the two named helpers.

## Decisions

### D1 — Move model: rotate(top-left corner, dir) + solve

`TwiddleMove = { type: "rotate"; x: number; y: number; dir: 1 | -1 } | { type:
"solve" }`. `(x, y)` is the **top-left corner** of the rotated `n×n` region
(upstream's internal convention — clicking the centre is the UI affordance, but
the corner avoids half-integers). `interpretMove` converts a click by offsetting
by `(n−1)/2` tiles so the click lands at a region *centre*, then `FROMCOORD`s
and bounds-checks to `0 ≤ x ≤ w−n`, `0 ≤ y ≤ h−n`. Moves are plain JSON-safe
data → default move codec (no `serialiseMove`). `"solve"` (upstream `"S"`) snaps
to solved.

### D2 — State: separate number + orientation arrays (not C's packed `value*4+orient`)

C packs each cell as `number*4 + orientation` in one `int`. Idiomatic TS splits
this: `numbers: Int32Array` (the displayed tile number) and `orient: Uint8Array`
(0–3, meaningful only when `orientable`; all-zero otherwise). Both are permuted
together by `doRotate`; orientation is additionally advanced by the rotation
(`orient = (orient + dir) & 3` for each moved cell, and the centre cell when `n`
is odd). Completion: `numbers[i] ≥ numbers[i−1]` for all `i` (non-strict, so
`rowsonly`'s repeated numbers pass), and — when orientable — every `orient` is
0. Parallel typed arrays clone cheaply per `executeMove` (the Galaxies pattern),
avoid C's bit-packing, and keep the rotation math type-honest. Alternative
(verbatim packed `Int32Array`) rejected: it re-imports a C-ism the doctrine says
to drop, for no cloning benefit.

### D3 — `doRotate`: the in-place quarter-coset permutation, ported faithfully

Port `do_rotate` — rotate the `n×n` block by looping the `(n+1)/2 × n/2`
representative quarter and cycling each element with its 4-rotational coset
`p[0..3]`, plus the odd-`n` centre orientation tweak. Operates on a *copy* of
the arrays (immutability). This is the load-bearing transform shared by the
generator, `executeMove`, and (implicitly) the solved-grid construction; it gets
its own focused test (a single rotation of a known small block, forward then
inverse round-trips to identity; `dir & 3` handled).

### D4 — Generator: scramble-by-random-moves with anti-undo/repeat, faithfully

Port `new_game_desc`: build the solved grid (`numbers[i] = (rowsonly ? i/w : i)
+ 1`), then apply `total_moves` random rotations (`movetarget`, or
`w·h·n²·2 + randomUpto(2)` when unset), choosing each rotation's `(x, y, ±1)`
under the `prevmoves` guard that forbids immediately undoing or over-repeating a
rotation in an un-overlapped region (with the `w==h==n` special case where that
is unavoidable). Re-roll the whole scramble while the result is already solved.
`random.ts` is bit-identical, so the same seed reproduces C's board; the
differential check is advisory/deferred (no uniqueness loop). Desc format:
comma-separated numbers, or — when orientable — numbers separated by the
orientation letters `u`/`l`/`d`/`r` (encoding `orient` 0/1/2/3); ported with
`validateDesc`.

### D5 — Rotation animation + per-edge bevel recolouring (the novel render piece)

Port `game_redraw`'s rotation path: when animating (`oldstate` present), set up
a rotation about the moving block's centre with angle `−(π/2)·dir ·
(1 − animTime/animLen)` and draw the block's tiles rotated (clipped to the block
region, the region first cleared to the background/flash colour); tiles outside
the block draw normally. Port `rotate(point, rot)` (rotate-about-origin, round
to nearest) and the 32-entry `highlight_colour(angle)` table that recolours each
of the four bevel edges as the tile turns. `animLength = ANIM_PER_BLKSIZE_UNIT ·
sqrt(n−1)`. Keep upstream's per-tile cache (`ds.numbers`/`ds.orient` + a
`bgcolour` field): a tile repaints only when its number/orientation changed, it
is inside the animating block (`t = −1` sentinel "always draw"), the cursor
moved onto/off it, or the flash background changed. Completion flash: `2 ·
FLASH_FRAME`, genuine completion only (suppressed after `solve`). Cache keyed by
plain typed arrays (the documented "no `BigInt64Array`" guidance). Render lives
in its own `render.ts` (the rotation machinery + `highlight_colour` table earn a
module, like Cube/Galaxies).

### D6 — Cursor over rotation-origin space; select rotates; edge highlight

`TwiddleUi` carries `curX`, `curY` (in the `(w−n+1) × (h−n+1)` rotation-origin
grid) and `curVisible`. Cursor keys move the origin clamped to that space (no
wrap), returning `UI_UPDATE`; `CURSOR_SELECT`/`SELECT2` rotate the block at the
cursor (`dir +1`/`−1`); a first select with the cursor hidden just reveals it.
The cursor is rendered as coloured (`COL_HIGHCURSOR`/`COL_LOWCURSOR`) bevel
edges around the `n×n` region (the `CUR_LEFT/TOP/RIGHT/BOTTOM` edge flags).
Corner shortcuts `a/b/c/d` (and their shifted inverses `A/B/C/D`) and the numpad
rotations (`7/9/1/3` corners, `8/2/4/6` edge-centres, `5` centre — each gated on
the relevant `(w−n)`/`(h−n)` being even) are ported too, so keyboard input is at
full parity rather than silently trimmed.

### D7 — `solve()` snaps to solved (upstream semantics)

`solve()` returns `{ type: "solve" }`; `executeMove` sorts the grid into the
solved arrangement, clears all orientations, sets `usedSolve` (suppressing the
completion flash and switching the status bar to "Moves since auto-solve: k").
Upstream's Solve is "reset to a clean board to practise manoeuvres", not a replay
of an optimal path. No `aux` needed.

### D8 — File layout

- `state.ts` — params (`w`,`h`,`n`,`rowsonly`,`orientable`,`movetarget`), state,
  `TwiddleMove`, params/desc codecs, `doRotate`, completion check, the
  scramble generator, `textFormat`.
- `render.ts` — `redraw`, the rotation setup, `rotate`, `highlight_colour`
  table, per-tile cache, cursor-edge drawing, flash.
- `index.ts` — `Game` glue, `interpretMove` (click + cursor + select + shortcut
  dispatch), `executeMove`, `colours`, `computeSize`/`setTileSize`,
  `statusbarText`, `registerGame`.

### D9 — Shared-helper extraction (folded in; Twiddle is first consumer)

- **`src/native/engine/geometry.ts`**: `coord(pos, tileSize, border) = pos *
  tileSize + border` and `fromCoord(pixel, tileSize, border) =
  Math.floor((pixel − border) / tileSize)`. Border is a caller argument (Twiddle
  and most games use `floor(tileSize/2)`; Sixteen uses a full tile). The
  `fromCoord` implementation uses `Math.floor` directly — correct for negative
  (border-region) pixels without the C `+k·ts/−k` truncation idiom each game
  currently copies.
- **`src/native/engine/pointer.ts`** (existing): add `cursorDelta(button):
  { dx: number; dy: number } | null` returning the unit delta for the four
  cursor-direction buttons, `null` otherwise. Per-game clamping/validation stays
  local (bounds, obstacle-skip, lock modes differ per game).
- **Migrate existing consumers** (`flip`, `galaxies`, `pegs`, `sixteen`,
  `fifteen`) onto both helpers, deleting their private `coord`/`fromCoord` and
  inline button→delta code. Pure refactor; each game's existing behavioural and
  render tests guard it. This is what actually removes the duplication (vs.
  adding a 6th copy), and is the reason the extraction is folded into a change
  that already touches the engine rather than deferred.

  Migration caution: Sixteen's `fromCoord` uses `border = tileSize` and the
  copied idiom was `floor((pixel − border + 2·ts)/ts) − 2`; confirm the shared
  `Math.floor((pixel − border)/ts)` agrees on Sixteen's existing render/input
  tests before landing (it should — same value for in-bounds pixels, and
  correct floor for border clicks). If any game's tests reveal an off-by-one at
  the border, keep that game on its local copy and note it rather than force the
  shared helper.

## Risks / Trade-offs

- **Rotation animation fidelity** is the main risk (point rotation, the 32-entry
  bevel-colour table, clipping, the "draw tile outside the rotated block
  normally" cleanup case). Mitigation: port `rotate`/`highlight_colour`
  verbatim; a render test asserts a mid-rotation frame draws the block's tiles
  at rotated coordinates and the static tiles unrotated, and that the bevel edge
  colours are drawn from the table.
- **Generator `prevmoves` guard** is intricate (overlap zeroing, the `w==h==n`
  special case). Mitigation: port branch-for-branch; a test asserts every
  generated board is unsolved and that applying the inverse of the recorded
  scramble (or simply that the board is reachable) holds — and that generation
  terminates for all presets.
- **Helper migration touching 5 games.** Low risk (pure refactor under existing
  tests) but non-zero. Mitigation: migrate one game at a time, keep the diff
  mechanical, lean on the per-game render/input tests; the Sixteen border case
  above is the one to watch.

## Migration Plan

Standard parity-gated split: extract helpers + migrate existing games (tests
green) → implement Twiddle + tests + register + dev-verify → flip `TS_PORTED`
and delete `twiddle.c` + dead `sixteen.c` only on owner acceptance → archive.
The empty-registry / C-fallback path covers Twiddle until acceptance.

## Open Questions

- None blocking. (If a Twiddle hint is wanted later, it rides on a future
  rotation-planner effort, not this change.)
