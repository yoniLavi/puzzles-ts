# Design — add-rect-ts-port

Only the non-obvious decisions; the mechanical port follows the playbook.

## D1 — Edge model: `vedge`/`hedge` as `Uint8Array`, shared semantics

Upstream stores two edge grids over `w*h`:
- `vedge(x,y)` = a vertical edge on the **left** side of cell `(x,y)` (between
  `x-1` and `x`); meaningful for `x ∈ [1, w-1]` (`VRANGE`: `x ≥ 1`).
- `hedge(x,y)` = a horizontal edge on the **top** side of cell `(x,y)` (between
  `y-1` and `y`); meaningful for `y ∈ [1, h-1]` (`HRANGE`: `y ≥ 1`).

Kept verbatim as two `Uint8Array(w*h)` on the immutable `RectState`, plus the
`grid` numbers (`Int32Array`) and the computed `correct` overlay (`Uint8Array`).
`cloneState` copies the three mutable arrays and shares the immutable `grid`
(the numbers never change after `newState`). This is the "shared frozen matrix"
pattern (playbook §3.1) — `readonly` is the whole guarantee (no `Object.freeze`
on a populated typed array).

## D2 — Move model: a discriminated union, not the C string

C emits move strings `R x,y,w,h` / `E x,y,w,h` / `H x,y` / `V x,y` / `S…`. We
model `RectMove` as a discriminated union:
- `{ type: "rect"; erasing: boolean; x, y, w, h }` — draw outline (`R`) or erase
  interior (`E`), applied via the ported `gridDrawRect`.
- `{ type: "edge"; edge: "h" | "v"; x, y }` — toggle a single edge (`H`/`V`).
- `{ type: "solve"; hedge: string; vedge: string }` — the full solution edges
  (from `solve`/`aux`), applied wholesale.

`interpretMove` builds these; `executeMove` applies them purely, recomputes
`correct`, and sets `completed`. A move that changes no edge returns `null`
(local no-op suppression — the struck state-string-undo risk does not apply).
The `S` string form is only ever an internal `aux`/`solve` payload, so the
`solve`/`aux` edge bit-strings are kept as-is inside the move rather than
re-encoded.

## D3 — Rendering: corners + edge-value cache, drag preview

The per-cell cache word packs exactly what upstream's `visible[]` did — the four
edge values (0/1/2/3) around the cell (2 bits each), the four corner values
(2 bits each), plus `CORRECT` and `CURSOR` bits — into an `Int32Array` (not
`BigInt64Array`; the used range is 18 bits, playbook §3.2). The drag preview and
corner computation follow `game_redraw` exactly: when `ui.dragged`, a scratch
copy of the edges has the preview rectangle drawn into it in colour 2 (draw) or
3 (erase) before the corner pass. Because the whole preview lives in the cache
word, it repaints and clears with no extra sidecar.

`COL_CORRECT` is upstream's own `0.75 × background` grey — the same shade the
shared `correctRegionColour` helper produces — but rect predates that helper's
palette-index convention and drives its highlight through the cache word, not a
region pass, so we keep rect's native `COL_CORRECT` enum index (index 1,
matching the C `enum`) rather than routing through the shared helper. Palette is
index-for-index with the C `enum` (no dark-mode `paletteOverrides` for rect, so
the indices are free, but matching them keeps the diff trivial to read).

## D4 — `findMistakes`: player edges absent from the unique solution

Rect has no upstream mistake concept (only the grey correct-fill). Our
divergence: re-run `rectSolver` from the fixed numbers (each number a single
candidate point) to the unique solution's `hedge`/`vedge`; if it does not solve
uniquely, return `[]`. Otherwise flag every edge the player has **set** that the
solution does **not** contain (a definite wrong edge; a *missing* edge is merely
incomplete, never a mistake). A `RectMistake` is `{ edge: "h" | "v"; x, y }`;
render recolours those edges with a dedicated `COL_MISTAKE` (appended past the C
enum), folded into the cache word so it paints and clears like the other
overlays (playbook §3.2). This is the same shape as Tracks' edge-mistake flag.

## D5 — `expandfactor` is a byte-match float hazard

`expandfactor` is a C `float`, encoded with `%g` and decoded with `atof`
(playbook §3.4). All presets use `expandfactor = 0`, so it never appears in a
preset desc, but the params codec must still reproduce `%g`/`atof`/single-
precision faithfully for custom params and the `params#seed` round-trip. Reuse
`formatG` and `Math.fround` at the boundaries; `parseConfigInt` for the integer
width/height, a NaN-guarding float parse for the factor.

## D6 — Differential scope

Byte-match desc **and** `aux` (both are pure functions of the seed once the
solver verdict is fixed). The generator's only data-dependent branch is
`rect_solver`'s uniqueness verdict, which we port faithfully, so a divergence in
either the generator's RNG order or the solver shows up as a mismatched desc.
Fixtures span the presets plus a non-square size and a non-preset size; a
`unique=false` fixture exercises the `ret == 1` "any placement" shortcut. No
advisory live diff (the trace has fixed seeds = the fixtures, so it adds no
signal — same as Towers, playbook §4).

## Documented skips (checked against the C)

- **`midend_supersede_game_desc`** — not used (desc is immutable numbers).
- **State-string undo** — not used; no-op moves suppressed locally.
- **`#ifdef EDITOR`** — rect has none.
- **`game_request_keys`** — NULL upstream; no keypad hook.
- **Hint** — deferred to a future `add-rect-hint` (the solver is a strong
  Palisade-bar candidate: narrate each forced placement/elimination).
