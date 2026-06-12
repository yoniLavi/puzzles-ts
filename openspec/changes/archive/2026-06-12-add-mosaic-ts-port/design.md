# Design: Port Mosaic to TypeScript

## D1 — State: flat cell flags + a shared frozen clue board

Upstream splits state into a refcounted immutable `board_state` (per-cell
`clue`/`shown`, shared across undo history) and a per-state
`cells_contents` byte array (player marks + derived `SOLVED`/`ERROR`
overlays). The port keeps that split idiomatically:

- `MosaicBoard` — `{ width, height, clues: Int8Array }` where `-1` means "no
  clue shown" (collapsing upstream's `clue` + `shown` pair: a shown clue is
  always `0..9`). Created once by `newState`, frozen, and **shared by
  reference** across cloned states — the Flip shared-matrix pattern replaces
  refcounting; GC does the rest.
- `cells: Uint8Array` — the upstream flag encoding kept verbatim
  (`STATE_MARKED = 1`, `STATE_BLANK = 2`, `STATE_SOLVED = 4`,
  `STATE_ERROR = 8`), because the toggle cycle (`(v + steps) % 3`), the
  drag-paint guard (`(v & 3) === 0`), and the renderer's cache packing all
  operate on these bits. Renaming the bits buys nothing; the constants are
  exported and named.
- Scalars: `cheating`, `notCompletedClues` (the completion counter the
  status bar and `status()` read).

`cloneState` copies `cells` + scalars and shares the board.

## D2 — Moves as a discriminated union; one `paint` type for drag and release

Upstream encodes `t x,y` / `T x,y` (toggle 1 or 2 steps), `d …` / `e …`
(drag / release painting), and `s<hex>` (solve). `execute_move` treats `d`
and `e` identically — the difference lives entirely in `interpret_move`
(release doesn't update the drag anchor). So the port needs only:

```ts
type MosaicMove =
  | { type: "toggle"; x: number; y: number; double: boolean }
  | { type: "paint"; x: number; y: number; srcX: number; srcY: number;
      paintState: number }
  | { type: "solve"; solution: string };
```

`paint` walks from `(x,y)` toward `(srcX,srcY)` (exclusive), setting only
still-unmarked cells to `paintState`, exactly upstream's loop. `solve`
carries the hex-packed marked-cell bitmap upstream's `solve_game` emits
(compact in save files; the codec is 10 lines). All JSON-safe → default move
codec.

`executeMove` recounts `notCompletedClues` over the whole board after
`toggle`/`paint` (upstream does the same full recount per move; at ≤10000
cells this is trivial) and refreshes the `SOLVED`/`ERROR` overlay around
each touched cell via `updateBoardStateAround`.

## D3 — Solver: one `solveCell`, three drivers, typed-array scratch

`solve_cell` is the whole deductive engine: for a clue cell, *satisfied* →
blank the unknown neighbours, *needs all remaining* → mark them,
*overcommitted* → contradiction; for a non-clue cell, solved once its
neighbourhood is determined. The port returns a discriminated
`"progress" | "none" | "contradiction"` instead of `1/0/-1` (the Galaxies
precedent).

The three drivers stay faithful:

- `solveCheck(params, descCells, rng?)` — generation-side: visits shown
  clues in rng-shuffled order (or stable order when `rng` is omitted, as
  upstream passes `NULL` on the re-check inside `hideClues`), tracks per-cell
  `needed` (this clue's deduction actually narrowed something), loops until
  no progress. Scratch is three parallel typed arrays
  (`solCell`/`solSolved`/`solNeeded` as `Uint8Array`), not an
  object-per-cell — `hideClues` calls `solveCheck` once per candidate clue,
  so on a 50×50 board this runs thousands of times.
- `hideClues` — hide every not-needed clue; aggressive mode then tries each
  needed clue in shuffled order, reverting any hide that breaks
  solvability. Faithful, including visiting order semantics.
- `solveGameActual(board)` — board-side (clues only, no `full`/`empty`
  knowledge), used by Solve and `findMistakes`. Returns the solution cells
  or `null` when deduction stalls.

Upstream quirks kept faithfully (each with a comment in the code):

- `populate_cell`'s edge handling: a border cell is "full" at clue 4
  (corner) / 6 (edge) / 9 (interior) — the count includes the cell itself.
- `start_point_check` scans only `(width-1)*(height-1)` cells (upstream
  passes that size; an off-by-design quirk). Kept so board acceptance
  matches C's distribution.
- `solve_check`'s final verification only counts when the last round made
  progress — kept, it is what upstream returns.

Deliberate divergence: upstream builds the shown-clue list by prepending
(reverse scan order) before shuffling; the port builds it in scan order.
After an rng shuffle the orders differ anyway, and there is no corpus bar —
boards are valid and deduction-solvable, not byte-identical to C's.

## D4 — `findMistakes`: compare marks against the deduced solution

Generated boards are deduction-solvable, hence unique: `solveGameActual`
*is* the solution. A mistake is any cell the player has determined
(`MARKED`/`BLANK`) that disagrees with it. ~20 lines reusing the Solve
path. If deduction stalls (conceivable only for a foreign/hand-built desc),
return `[]` — "no detectable mistakes" is the honest answer. Mistakes render
as a `COL_ERROR` inset outline via a cache bit (the Galaxies `DRAW_MISTAKE`
pattern); the midend clears the overlay on the next transition for free.

This complements (not replaces) upstream's own `STATE_ERROR`: that flags a
*locally contradicted clue* (red clue text) and stays part of normal play;
`findMistakes` catches marks that are wrong but not yet locally
contradicted, gating Check-&-Save.

## D5 — Input: drag anchor and paint state live in the Ui

Upstream tracks `last_x`/`last_y`/`last_state` in `game_ui`: a click
computes the state the clicked cell will become
(`(current + (right ? 2 : 1)) % 3`) and stores it; straight-line drags and
the release then paint that state onto unmarked cells. The port keeps all
three in `MosaicUi` (plus the keyboard cursor). Faithful details:

- Mouse events with pointer coords inside the margin (offset < 0) are
  ignored before any grid mapping.
- A click outside the grid resets the anchor and emits nothing.
- A drag emits a `paint` move only if some cell on the segment is unmarked
  and `lastState > 0` (upstream's `changed` check) — otherwise the midend
  would record no-op history entries.
- Drags not aligned with the anchor (neither same row nor same column)
  reset the anchor.
- After the puzzle is complete (`notCompletedClues === 0`), only cursor
  *movement* is accepted (upstream's freeze; lets the player browse).
- Cursor select with hidden cursor shows it (`UI_UPDATE`); select = toggle,
  select2 = double toggle.

## D6 — Rendering: faithful drawCell with a (w+1)×(h+1) Int32 cache

Upstream draws cell `(x,y)`'s top and left grid lines inside its tile and
runs the loop to `x <= width` / `y <= height` so the bottom/right margin
row draws the closing lines; cursor edges recolour those lines. The port
keeps the exact scheme: packed per-cell value = state flags | cursor flags
(`CURSOR`/`CURSOR_U`/`CURSOR_L`/`CURSOR_UL`) | margin flags | mistake flag,
cached in a `(w+1)*(h+1)` `Int32Array` initialised to `-1`, redrawn only on
change. Flash XORs `MARKED|BLANK` into the packed value during the first
and last thirds of the 0.5s flash, exactly upstream. Clue text:
`ts*3/5` variable font, centred, colour by state (light-on-marked,
dark-on-blank/unmarked, red on `ERROR`, grey on `SOLVED`).

First draw fills the full background (engine paints no pixels of its own —
the Flip-postmortem doctrine) behind a `ds.started` flag; the C version
relied on the midend's background fill.

`computeSize`: `width*ts + 2*(ts/2)` per axis (margin = `ts/2` floored).

## D7 — `shuffle` promotion

Mosaic's generator shuffles the clue-visit list and the hidable-clue list;
Galaxies carries the identical local Fisher-Yates over `RandomState`
(matching upstream `misc.c shuffle`). Second consumer ⇒ promote to
`src/native/engine/shuffle.ts` unchanged and repoint Galaxies. No
behavioural change; Galaxies' generator tests cover it.

## D8 — Status and statusbar

- `status`: `notCompletedClues === 0` → `"solved"`, else `"ongoing"`. No
  loss state. The midend maps a Solve-command win to solved-with-help
  itself.
- `statusbarText`: `"Clues left: N"`, `"COMPLETED!"` (finished unaided), or
  `"Auto solved"` (finished via Solve) — upstream's strings, including
  cheating being a per-state flag so undoing past the solve restores the
  live count.
- `flashLength`: 0.5s when a move completes the board without cheating;
  `animLength` 0.

## Testing

- **Tier-1 logic** (`mosaic.test.ts`, `mosaic-solver.test.ts`): params
  round-trip incl. `h0` suffix + validation bounds; desc codec round-trip
  (digits, letter runs incl. the 26-run `z` boundary) + `validateDesc`
  rejections; `populateCell` clue/full/empty on interior, edge, corner;
  generator boards are valid (every desc parses, board deduction-solvable,
  clue density sane) for several sizes/seeds incl. aggressive on/off;
  `solveCell` deduction cases + contradiction; `solveGameActual` solves a
  generated board; toggle cycle incl. flag stripping; drag paint
  only-unmarked semantics; solved/error clue marking
  (`updateBoardStateAround`); completion counting; solve-move bitmap
  decode; `findMistakes` empty-on-correct / flags-wrong-cell; status +
  statusbar strings.
- **Tier-2 render-ops** (`mosaic-render.test.ts`): recording `GameDrawing` —
  unmarked/marked/blank tile colours, clue text emission and error/solved
  text colour, cursor edge recolour, flash inversion, mistake outline,
  margin closing lines, cache suppresses unchanged tiles.
- **Midend integration** (`mosaic-midend.test.ts`): new game → moves →
  undo/redo → solve → status, through the real `Midend` (the
  Flood/Samegame shape).
- **Differential**: advisory/deferred (no gated corpus), per
  Cube/Fifteen/Blackbox precedent.
