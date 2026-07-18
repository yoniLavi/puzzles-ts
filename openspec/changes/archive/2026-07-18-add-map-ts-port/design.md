# Design — add-map-ts-port

Only the non-obvious decisions; the mechanical port follows the playbook.

## D1 — The `MapData` structure: shared by reference, GC not refcount

Upstream's `struct map` is refcounted and shared across every `dup_game`
(nothing mutates it after `new_game`). In TS we drop the refcount and share the
one `MapData` object by reference across every cloned `MapState`; `cloneState`
copies only the mutable per-region arrays (`colouring: Int32Array`,
`pencil: Int32Array`) and shares `MapData`. This is the "shared frozen matrix"
pattern (playbook §3.1) — `readonly` is the whole guarantee (no `Object.freeze`
on a populated typed array).

`MapData` holds: `map: Int32Array(4*wh)` (the four TE/BE/LE/RE quadrant planes —
region index per triangular quadrant of each cell), `graph: Int32Array` +
`ngraph` (the sorted adjacency edge list, entry `i*n+j`), `immutable:
Uint8Array(n)` (which regions are fixed clues), `edgex/edgey: Int32Array(ngraph)`
and `regionx/regiony: Int32Array(n)` (canonical label points, ×2 coords).

## D2 — `newState` does real, RNG-bearing work (all deterministic from the desc)

`newState` is not a plain parse. After `parseEdgeList` fills quadrant 0 (region
numbers via a union-find over non-edges) and the clue list sets
`colouring`/`immutable`, it:
1. copies quadrant 0 into quadrants 1–3 (`map[i] = map[i % wh]` for `i ≥ wh`);
2. runs the **diagonal-smoothing pass** — a *second* RNG seeded from the desc
   string itself (`randomNew(desc)`), shuffling the cell list and repeatedly
   converting a cell that borders one region on two sides and another on the
   other two into a diagonally-split cell (mutating its TE/BE/LE/RE planes);
3. computes canonical edge/region label points via the two-pass float averaging
   (accumulate average position per class, then pick the nearest candidate).

Steps 2–3 are **deterministic functions of the desc**, so a save/load and a
shared game ID reproduce the identical geometry. Step 3's float math is
display-only (label/error-marker placement) — per the byte-parity scope doctrine
(playbook §4 intro) we port it faithfully enough to place markers sensibly, not
to bit-match a `sqrt`. Step 2, however, changes which region a corner click
selects (via `region_from_coords`), so it is ported exactly and covered by a
codec round-trip test.

## D3 — Move model: a discriminated union, not the C string

C emits `;`-separated tokens `<c>:<r>` (colour, `c ∈ {C,0,1,2,3}`),
`p<c>:<r>` (pencil toggle / `pC` clear), and `S` (solve). We model `MapMove` as
a discriminated union of ops:

- `{ type: "colour"; region; colour: number | null }` — set/clear a region's
  colour (clears its pencil, upstream).
- `{ type: "pencil"; region; bit: number | "clear" }` — toggle one pencil bit or
  clear all (only legal on an uncoloured region — `executeMove` throws otherwise,
  mirroring the C `return NULL`).
- `{ type: "solve"; ops: {region; colour}[] }` — the full colouring from
  `solve`/`aux`, applied wholesale, sets `cheated`.

A single drag-drop can emit **both** a colour change and pencil toggles in one
move (upstream builds one `;`-joined string), so `MapMove` is
`{ ops: MapOp[]; solve?: boolean }` — a list. `interpretMove` builds the op list
in `drag_dropped`; `executeMove` applies them purely, recomputes completion (all
regions coloured **and** no adjacent pair shares a colour), and sets
`completed`/`cheated`. A drop that produces an empty op list returns `null`
(local no-op suppression — the struck state-string-undo risk does not apply).

## D4 — Drag interaction lives on the `Ui`, and the blob is a blitter sprite

The drag/cursor state is exactly upstream's `game_ui`: `dragColour`
(−2 idle / −1 blank / ≥0 a colour), `dragPencil` (bitmask), `dragx/dragy`, and
the cursor fields. `interpretMove` returns `UI_UPDATE` for press/drag/cursor
motion and only emits a `MapMove` on release/drop. The floating blob (the colour
being dragged, plus its pencil dots) is drawn in `redraw` over the settled
board using a **blitter drag sprite** (save the background under the blob, draw
the circle, restore it next frame) — the same pattern Pegs uses. The blob is not
part of the per-cell cache (it floats between cells), so it needs no cache key.

## D5 — Rendering cache: the packed `unsigned long`, faithfully

Upstream packs each cell's draw descriptor into an `unsigned long`:
`tv*FIVE + bv` (top/bottom quadrant colours, `FOUR` = uncoloured) in the low
bits, then pencil-top (4 bits) + pencil-bottom (4 bits), a show-numbers bit, and
9 error-marker bits (a 3×3 sub-grid). We keep this exact layout in an
`Int32Array` cache word (playbook §3.2 — the used range is ~32 bits; the top
error bit lands on the int32 sign bit, which is harmless for `!==` equality).
`redraw` fills a `todraw` word per cell, ORs in error bits by walking the graph
for adjacent same-coloured pairs (placing bits at each edge's canonical point,
split across up to four cells exactly as C), then redraws only changed cells.
The **mistake overlay** (D6) folds a bit into the same word so it paints and
clears like any overlay.

## D6 — `findMistakes`: regions whose colour ≠ the unique solution

Map's boards are uniquely solvable (the generator gates on `map_solver == 1`),
so any region coloured differently from the unique solution is a *definite*
mistake — it can never complete. `findMistakes` re-solves from the immutable
clues at full recursion (`DIFFCOUNT-1`); if that is not a unique solution it
returns `[]` (faithful: a non-unique board has no ground truth), else it flags
every region `r` with `colouring[r] >= 0 && colouring[r] !== solution[r]`. A
`MapMistake` is `{ region }`; render outlines every cell of a flagged region
with a dedicated `COL_MISTAKE` (appended past the C enum), folded into the cache
word. This is a deliberate divergence: upstream shows only the always-on red
*adjacency* diamonds (kept as well — they are two different signals: "these two
touching regions clash" vs "this region's colour is wrong"). Check & Save
depends on the hook and refuses to save while any mistake is present.

## D7 — Preferences via the `prefs` hook

Upstream's three `get_prefs`/`set_prefs` items map straight onto the declarative
`prefs` array over `MapUi`: `flash-type` (choices: Cyclic / Each to white / All
to white), `show-numbers` (boolean), `stipple-style` (choices: Small / Large).
Keywords match the C `kw` slugs exactly so a TS and a C build show the identical
dialog. `newUi` sets the upstream struct defaults (`flashType = CYCLIC`,
`showNumbers = false`, `largeStipples = false`); the app's per-puzzle override
map (`src/store/settings.ts`) is checked before treating a smoke-test default as
a bug (playbook §3.4). The `MAP_ALTERNATIVE_FLASH` env override and
`PUZZLES_SHOW_CURSOR` are dropped (no env in the browser). The `l`/`L` in-play
number toggle stays.

## D8 — Difficulty grading and the RECURSE tier

Map has four difficulties; **Unreasonable (RECURSE) legitimately requires
guessing** and is the one tier exempt from the guess-free policy (it is upstream's
explicitly-named hard tier, exactly as the policy allows). The solver's recursion
block both proves uniqueness (for every tier) and does the guessing (for RECURSE
grading). `gradeMap` solves at each difficulty 0..DIFFCOUNT-1 and returns the
first that yields a unique solution, matching the C standalone rater — the
byte-match differential asserts this verdict per board (§4.4-style: the desc
depends on the solver's verdict during clue reduction).

## D9 — Differential scope

Byte-match desc **and** aux (both pure functions of the seed once the solver
verdicts are fixed). The generator's data-dependent branches are all
`map_solver` uniqueness verdicts during clue reduction and the difficulty gate,
which we port faithfully, so any divergence in RNG order (`genmap`'s
cumulative-frequency draws, `fourcolour`'s shuffle + random-most-constrained
pick, the clue-reduction shuffle) or solver power shows up as a mismatched desc.
Fixtures span all six presets, each difficulty, and a non-preset size. No
advisory live diff (the trace has fixed seeds = the fixtures, so it adds no
signal — same as Towers/Rect, playbook §4).

## Documented skips (checked against the C)

- **`midend_supersede_game_desc`** — not used (desc is immutable regions).
- **State-string undo** — not used; no-op moves suppressed locally.
- **`#ifdef EDITOR`** — Map has none.
- **`game_request_keys`** — NULL upstream; no keypad hook.
- **`MOD_STYLUS` / `MOD_NUM_KEYPAD`** — Map reads no raw button bits; the midend
  strips `MOD_STYLUS` (playbook §3.8b), and Map binds no keypad digits.
- **`game_print`** — the print path (region-boundary polygon tracing) is dropped
  with `printing.c` at the fork; not ported.
- **Hint** — deferred to a future `add-map-hint` (the graded deductive solver is
  a strong Palisade-bar candidate: narrate each forced colour placement /
  exclusion).
