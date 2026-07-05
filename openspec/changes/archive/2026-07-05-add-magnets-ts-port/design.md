# Design — add-magnets-ts-port

## Context

Magnets (`magnets.c`, ~2700 lines) fills a grid of pre-laid dominoes: each
domino is either a **magnet** (one `+` cell and one `−` cell) or **neutral**
(both cells blank). Constraints: no two orthogonally-adjacent cells share a
polarity, and each row/column contains exactly its clue count of `+` and of
`−`. Some dominoes are fixed singleton squares (permanently neutral). The
domino layout is a fixed given; the player decides each domino's content.

Closest ported exemplar: **Tents** (recent, self-contained, side clues, live
error highlighting, `findMistakes`, byte-match differential). This port
mirrors its file layout and packed `Int32Array` render cache.

## Long-tail risk clearance

- **`midend_supersede_game_desc`**: not used (`set_public_desc` is NULL). ✓
- **Undo via state-string equality**: not used — moves are explicit cell
  edits; `interpretMove` returns `null` / `UI_UPDATE` / a move. ✓
- **`#ifdef EDITOR` move letters**: none. ✓
- **`printing.c`**: upstream has a print path; we do not port printing
  (documented fork stance). ✓

## Decisions

### D1 — Port `domino_layout` as a shared `engine/laydomino.ts` leaf

`magnets.c` calls `domino_layout(w, h, rs)` (`laydomino.c`) to lay a random
perfect (or near-perfect, for odd area) 2×1 domino tiling. Dominosa also uses
it, so it lands in `engine/` rather than game-local. The port is idiomatic
(typed arrays, no `grid2`/`list` scratch juggling exposed) but **RNG-faithful**
(byte-match critical): the initial `shuffle(list)` of the `2wh − w − h`
candidate positions and the per-BFS-node `shuffle(d, nd)` of neighbour
directions must reproduce C's draw order exactly, and the chessboard-parity
singleton-fixup BFS is ported step-for-step. The shared `engine/shuffle.ts`
`shuffle` already matches `misc.c shuffle` byte-for-byte.

### D2 — State shape: shared frozen "common", cloned working fields

Upstream splits the state into a refcounted `common` (dominoes + row/col
counts — never change once the game is made) and per-state working fields.
The TS state shares the frozen parts by reference and clones the rest:

- `dominoes: Int32Array` (each cell → the index of its domino partner, or
  itself for a singleton), `rowcount`/`colcount: Int32Array` (`3·h` / `3·w`,
  the `[+, −, neutral]` targets, `−1` for a stripped clue) — **shared frozen**.
- `grid: Int8Array` (EMPTY / POSITIVE / NEGATIVE), `flags: Int32Array`
  (GS_SET / GS_ERROR / GS_NOTNEUTRAL), `countsDone: Uint8Array` (`2·(w+h)`,
  the clue-grey toggles) — **cloned per move**.

Only three flag bits persist in gameplay: `GS_SET` (the domino's content is
decided), `GS_ERROR` (live, from the completion check), and `GS_NOTNEUTRAL`
(the not-neutral `?` mark). The solver's richer NOT-mask flags
(GS_NOTPOSITIVE/NEGATIVE) live only in its own scratch, never in game state.

### D3 — Move representation

Three move kinds, all JSON-save-safe. A magnet/neutral edit always touches
**both** cells of a domino (setting one end sets the partner to the opposite),
so the move names one cell and `executeMove` derives the partner:

- `{ type: "set"; idx; which }` — set a magnet (`which` ∈ {POSITIVE,
  NEGATIVE}): `grid[idx] = which`, `grid[partner] = opposite`, both GS_SET,
  clear NOT flags.
- `{ type: "flag"; idx; mode }` — the neutral/clear cycle over a domino,
  `mode` ∈ {`neutral` (`.`: both EMPTY + GS_SET), `notneutral` (`?`: both
  EMPTY, clear GS_SET, set GS_NOTNEUTRAL), `empty` (` `: both EMPTY, clear
  everything)}.
- `{ type: "clue"; clue }` — toggle `countsDone[clue]` (the grey aid).
- `{ type: "solve"; solution: number[] }` — the full solution grid; sets
  every non-singleton cell + GS_SET (upstream's `S;…` diff / `solve_from_aux`).

`interpretMove` reproduces upstream's cycle logic exactly (magnet cycle can't
start from a placed neutral; neutral cycle can't start from a magnet).

### D4 — The solver, and `findMistakes` vs live `check_completion`

The solver (`solveState`) works on a scratch `{ grid, flags }` with the full
NOT-mask machinery, ported function-for-function from `solve_state` and its
helpers. It is the single engine behind: the generator's difficulty gate, the
`solve()` action, and `findMistakes`.

- **`check_completion`** is upstream's always-on state check: it sets the live
  red `GS_ERROR` bit on two touching identical terminals and reports
  over-committed/under-committed clue counts (the red numbers are computed in
  render via `count_rowcol`). Kept faithfully — run inside `executeMove` so
  `GS_ERROR` is fresh, and re-derived in render for the count colours.
- **`findMistakes`** is the fork's Check-&-Save contract: re-solve from the
  dominoes + clue counts to the unique solution (`solveState` at the top
  difficulty) and flag every GS_SET player cell whose value differs. Blanks
  and not-neutral marks are never mistakes; a non-uniquely-solvable board
  yields none. Rendered as an inset red outline (the cross-game mistake
  styling), distinct from the live error red.

### D5 — Palette index-for-index, mistake overlay appended

`colours()` mirrors the C enum indices 0–10 (BACKGROUND, HIGHLIGHT, LOWLIGHT,
TEXT, ERROR, CURSOR, DONE, NEUTRAL, NEGATIVE, POSITIVE, NOT). `augmentation.ts`
has no `paletteOverrides` for magnets, but keeping index parity is the
standing rule and costs nothing. The fork mistake overlay colour is appended
at index 11 (`COL_MISTAKE`).

### D6 — Params / config

Params are `w`, `h`, `diff` (Easy/Tricky), `stripclues` (boolean).
`describeParams` returns `{ width, height, difficulty, "strip-clues" }`
matching the existing `augmentation.ts` template
`{width}x{height} {difficulty:Easy|Tricky}{strip-clues:|, strip clues}`
(the choice values are numeric indices, `strip-clues` a boolean). `paramConfig`
is `dimensionParamConfig()` + a difficulty choice + a strip-clues boolean.
`validateParams` enforces w,h ≥ 2, the Easy w/h ≥ 3 and Tricky w/h ≥ 5 floors,
and the area bound. Difficulty and strip-clues affect only generation.

### D7 — NARROW_BORDERS geometry

The web C build defines `NARROW_BORDERS` (`cmake/platforms/webapp.cmake`), so
`BORDER = 0` and the grid is `(w+2) × (h+2)` tiles: a one-tile clue margin on
each side plus the `w × h` play area. `COORD(n) = (n+1)·TS`,
`FROMCOORD(px) = ⌊px/TS⌋ − 1`. `computeSize = { TS·(w+2), TS·(h+2) }`. Parity
is with what the browser actually shows.

## Byte-match feasibility

`random.ts` is bit-identical to `random.c`. The generator's RNG draws are, in
order: `domino_layout` (`shuffle(list)` + per-BFS-node `shuffle(d)`),
`lay_dominoes` (`shuffle(scratch)`, repeated per failed attempt), and — only
when `stripclues` — the clue-strip `shuffle(scratch)`, all looping until a
board grades at exactly the target difficulty. No `qsort`, no float grid. So a
byte-for-byte desc match is feasible (§4.3), the strong bar; the differential
also grades each C board with the TS solver (§4.4 — the generator is
solver-gated, so the TS solver must reach C's exact verdict on each board).
