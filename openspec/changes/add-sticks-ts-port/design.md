# Design — add-sticks-ts-port

## Context

Sticks (Tatebo-Yokobo, a Nikoli type) is one of the 13 third-party
`puzzles/unreleased/` games this fork is porting to native TS. Unlike Tatham's
`puzzles/unfinished/` experiments, it already **ships as a C/WASM catalog game**,
so its C/WASM build is a live fallback throughout stage 1.

The rules: fill every white cell with a horizontal or vertical line through the
cell centre. A number **on a line** (in a white cell) states that line's length;
a line may overlap at most one number. A number **in a black cell** states how
many lines connect to that black cell. The board is a `w × h` grid; each cell is
one of blank / horizontal line / vertical line / black, plus an optional clue
number. It is a **genuine deductive logic puzzle with a unique solution** — the
generator (`new_game_desc`) loops until `sticks_solve_game` deduces the board to
completion and then removes clues only while the solution stays unique. This one
fact drives the whole design: there is a real solver to port, a byte-match
differential to gain from it, and a `findMistakes` obligation to meet.

**Long-tail risk checklist (playbook §1) — clean.** Sticks' `set_public_desc` is
`NULL` and it does not supersede its desc; it compares no stringified state for
undo (no-op moves are suppressed *locally* in `interpret_move`, which returns
`NULL` "to not put no-ops on the undo chain" — D4); it has no `#ifdef EDITOR`
move letters; and `game_print` is an empty stub, so it makes no print promise.
None of the long-tail traps bite.

## Decisions

### D1 — Codec: the run-length blank encoding, ported as an exact inverse

`new_game_desc`'s encoder and `new_game`'s decoder are a run-length scheme over
the `w*h` cells in row-major order (`slide.c`-style but simpler):

- A run of **plain blank** cells (no clue, not black) is emitted as lowercase
  letters: `a` = 1 … `z` = 26, chaining `z` for runs over 26 (`z` then the
  remainder). The decoder advances `pos` by `(c - 'a') + 1`, with `z` meaning
  advance 26 and continue.
- `_` is an explicit **separator** the encoder emits before a non-black,
  clue-bearing cell that directly follows a previous emitted cell (so adjacent
  numbers do not run together).
- `B` marks a **black** cell; if a digit follows, that digit is the black cell's
  clue and the same cell is not double-advanced (the `B`-then-number case shares
  one cell — mirror the C's `if(!isdigit(*(p+1))) pos++` exactly).
- A run of **decimal digits** is an inline clue **number** on the current cell.

Model the state as a typed grid plus a clue array (D-below), and port the encoder
and decoder as exact inverses. This is byte-match surface (D6): the differential
asserts the TS encoder reproduces the C desc verbatim, so the `_` placement and
the `B`+digit sharing must match the C to the character. `validateDesc`
reproduces the C's position count: reject a desc that decodes to more or fewer
than `w*h` cells (distinguishing "too long" from "too short") and reject unknown
characters.

**State shape.** `SticksState { w, h; grid: Uint8Array; numbers: Int16Array;
completed; cheated }`, where `grid[i]` is a small bitset (`F_HOR | F_VER |
F_BLOCK`) and `numbers[i]` is the clue (`-1` for none). Black cells and clue
numbers are **fixed puzzle data** decoded from the desc and never change; only
`F_HOR`/`F_VER`/blank on white cells is player state. Clone is a typed-array copy
(GC, no `free`).

### D2 — Solver: contradiction-based single-cell deduction to a fixpoint

`sticks_solve_game` is a **single-technique deductive solver, no backtracking**:

1. Clear every non-black cell.
2. Repeat: run `sticks_validate` (COMPLETE / UNFINISHED / INVALID). While
   UNFINISHED, call `sticks_try` — for each blank cell, tentatively set it to
   `F_HOR`; if the board becomes provably INVALID, the cell **must** be `F_VER`
   (and vice-versa); commit that forced line and continue. Stop when no cell is
   forced.

`sticks_validate` is the constraint checker and the deduction oracle. It builds a
**dsf** merging adjacent same-orientation line cells into segments, then for each
segment checks it against the (single) clue on it (too long ⇒ invalid; too short
but cannot possibly grow to the clue length ⇒ invalid, via
`max_size_horizontal`/`vertical` reachability); and for each black clue cell
checks the connected-line count and the free-neighbour count against the clue.
Port all of `sticks_make_dsf`, `sticks_max_size_horizontal/vertical`,
`sticks_validate`, `sticks_try` and `sticks_solve_game` idiomatically — the
logic is what matters, not the control flow.

Because generation gates on this solver, the solver is a **single implicit
difficulty tier** and it is guess-free: every generated board is solvable by this
deduction alone. That satisfies the guess-free-generation policy
(`feedback_guess_free_generation`) — Sticks has no "Unreasonable" tier and needs
none.

**Leaf reuse (D7).** The solver's only leaf dependency is `dsf` — reuse the
shared `src/native/engine/dsf.ts` (`dsf_new_min` ≈ a fresh `Dsf`, `dsf_merge`,
`dsf_canonify`, `dsf_size`, `dsf_minimal`, `dsf_reinit`). No `latin`/`grid`/
`tree234`/`findloop` needed.

### D3 — Generator: symmetric blacks, random fill, solve-gated retry, greedy minimisation

`new_game_desc` (byte-match portable, port faithfully over `random.ts`):

1. **`set_blacks`** (copied by upstream from `lightup.c`): place a `blackpc`
   fraction of black squares in a fundamental region and mirror/rotate them by
   the chosen symmetry (`SYMM_NONE`/`REF2`/`ROT2`/`REF4`/`ROT4`). Port the region
   sizing, the `random_upto` rejection-sampling placement, the reflection/rotation
   copy, and the `SYMM_ROT4` odd-centre fix-up verbatim — it is RNG-order
   sensitive.
2. **Fill + clue** loop: randomly set each white cell `F_HOR`/`F_VER`, build the
   segment dsf, then assign clues — a count to each black cell (its connected
   lines) and a length to each segment (placed on a `random_upto`-chosen cell of
   the segment). Retry the whole fill until `sticks_solve_game` deduces it to
   COMPLETE (guarantees a unique deductive solution).
3. **Greedy minimisation**: `shuffle` the `w*h` cell indices once, then walk them
   removing each clue and keeping it removed only if the board still solves to
   COMPLETE.

The RNG surface is exactly upstream's (`set_blacks` draws, the fill/clue draws,
the `sticks_solve_game` gate is deterministic, one `shuffle`), so the desc is a
pure function of the seed and reproduces byte-for-byte (D6). There is **no `aux`**
— `solve_game` re-runs `sticks_solve_game` from the state, so nothing needs
threading through `newDesc` (playbook §3.6).

### D4 — Input and move model: a discriminated union of cell settings

Sticks' `interpret_move` emits a semicolon-separated batch of per-cell settings
(`A%d` = set horizontal, `B%d` = set vertical, `C%d` = clear) or a Solve string
(`S` + one char per cell). Per the repo convention (Loopy D5, Pearl, Tracks),
model the move as a discriminated union, not a string:

```ts
type LineSet = { index: number; line: "hor" | "ver" | "none" };
type SticksMove =
  | { kind: "set"; changes: ReadonlyArray<LineSet> }
  | { kind: "solve"; grid: ReadonlyArray<"hor" | "ver" | "none"> };
```

`interpretMove` builds these; `executeMove` applies each `LineSet` to a cloned
grid (ignoring black cells, as the C does), sets `completed` when `sticks_validate
== COMPLETE`, and sets `cheated` on a solve. The three input phases live on the
**ephemeral `Ui`** (mirrors upstream `game_ui`, never serialised):

- **Drag to draw** (`LEFT`/`RIGHT` down → drag): accumulate the drag's bounding
  box; once it exceeds `DRAG_DELTA` in a dominant axis, the drag draws that
  orientation (`F_HOR` for a mostly-horizontal drag) across the cells it passes,
  toggling to a clearing drag if it starts on an existing matching line — port
  the `DRAG_START`/`DRAG_LINE`/`DRAG_CLEAR` state machine.
- **Click** (release without a qualifying drag): left-click cycles
  blank→vertical→blank on that cell, right-click cycles blank→horizontal→blank
  (the `LEFT_RELEASE`/`RIGHT_RELEASE` arms).
- **Keyboard**: arrow keys move the cursor (`UI_UPDATE`); Enter/`1` place a
  vertical line, Space/`0`/`2` a horizontal line, backspace clears; Shift/Ctrl +
  arrow draws/clears a line across the two cells (the `A`/`B`/`C` shift-drag arm).

No-op settings (a line already in that state) are suppressed *locally* by not
emitting them, exactly as the C returns `NULL` "to not put no-ops on the undo
chain" (playbook §1 — do not reach for state-string equality). Coordinate
conversion uses the shared `fromCoord` (playbook §2.3): round the possibly
fractional pointer to a cell, offset by `BORDER` (D8).

### D5 — `findMistakes`: Sticks is uniquely solvable, so it ships it

Sticks has a **unique solution**, so per the solvable-game contract (playbook
§3.5) it MUST ship `findMistakes` — Check & Save hard-blocks a save only when
`canFindMistakes` (= `game.findMistakes !== undefined`) is true, and a
uniquely-solvable game without it would silently save a wrong board.

`findMistakes(state)` **re-solves from the fixed clues** — clear every white
cell, run `sticks_solve_game` to the unique solution — then flags every white
cell where the player's line contradicts the solution's line (a placed line that
the solution does not have there). A *missing* line is merely incomplete, never a
mistake. Return `[]` when the clues do not uniquely determine the board (defensive
— generated boards always do). Render the flagged cells with a distinct
`COL_ERROR` overlay folded into the per-tile cache word (§3.2 — the overlay must
be in the diff key or it will not repaint).

Note upstream *also* computes live constraint-violation errors in
`sticks_validate` (the `F_ERROR` bit — a segment already too long, a black cell
over its count). That is a legitimate second signal, but the cross-game
`findMistakes`/Check-&-Save contract is "contradicts the unique solution", so the
re-solve-and-compare form above is the one this port implements; the constraint
check remains available if a later change wants live in-cell error highlighting.

### D6 — Differential: byte-match on desc via `sticks-trace.c`

The default for a solver-gated generator (playbook §4.3): a new
`puzzles/auxiliary/sticks-trace.c` (`#include "../unreleased/sticks.c"`, plus its
`cliprogram()` line) dumps the generated desc for a matrix of `(params, seed)`
tuples across both presets and a size/`blackpc`/`symm` sweep. `sticks-differential.test.ts`
asserts the TS `newDesc` reproduces each C desc **byte-for-byte**. Because
generation is gated by `sticks_solve_game` at every fill retry and every clue
removal, one byte-match assertion validates the generator, the solver **and** the
codec together — the strongest check available. Keep an advisory ungated live
variant only if a later port needs it; the frozen-fixture form is the gate-safe
default.

### D7 — Leaf-lib reuse: `engine/dsf.ts` only

Sticks' `solver(sticks ${CMAKE_SOURCE_DIR}/dsf.c)` line names its sole leaf
dependency: `dsf`. Reuse `src/native/engine/dsf.ts` idiomatically (a `Dsf`
instance per validate call, or a reused-and-`reinit`ed one on the hot path). No
new leaf port is needed.

### D8 — Rendering: no animation, completion flash, `NARROW_BORDERS` geometry

`game_anim_length` returns `0` — moves are **instant**; the only motion is a
completion **flash** (`FLASH_TIME = 5 × 0.1 = 0.5 s`, `game_flash_length`
non-zero only on the not-cheated completion transition, blinking the lines off on
alternate frames). `render.ts` needs no interpolation path.

Port `game_redraw`/`draw_tile` faithfully: per-tile cache keyed on an
`Int32Array` (the packed cell state — `F_HOR`/`F_VER`/`F_BLOCK`, the cursor bit,
the flash bit and the `findMistakes` error bit; small, so no `BigInt` — playbook
§3.2), grid lines drawn once, each line as a green (`COL_LINE`) centre bar, clue
numbers as text (white on black cells, dark on white cells, red when flagged),
and the cursor outline. The engine paints no pixels of its own; Sticks fills its
own background in the `!ds.started` branch (playbook rendering doctrine).

**Border geometry:** `cmake/platforms/webapp.cmake` defines `NARROW_BORDERS`, so
Sticks' compiled arm is `BORDER = tilesize/10` (note: **not** `0` — Slide and
Sokoban used the `0` arm; Sticks' narrow border is a tenth of a tile, checked in
the source, not assumed). `computeSize` is `w*tilesize + 2*BORDER − 1` by
`h*tilesize + 2*BORDER − 1` (the `-1` matches the grid-outline size the C draws).
`coord`/`fromCoord` offset by `BORDER`.

Ship a tier-2.5 render-scenario test + snapshot for: an opening frame, a frame
with lines and a clue drawn, a `findMistakes`-flagged frame, and a
completion-flash frame.

### D9 — Params, symmetry and validation

`SticksParams { w, h, blackpc, symm }`. Presets: `7×7 20% ROT2` and
`10×10 20% ROT2`. `encodeParams` emits `%dx%db%ds%d` (full) / `%dx%d` (short);
`decodeParams` reads `w`, optional `xh`, optional `b<blackpc>`, optional
`s<symm>`, with the C's quirk that a bare `WxH` without an `s` downgrades
`SYMM_ROT4` to `SYMM_ROT2` when `w != h`. `validateParams` (upstream order):
`w ≥ 2` and `h ≥ 2`; then on a full check `blackpc` in `[5, 100]`, `SYMM_ROT4`
only on a square grid, and a known `symm`. `paramConfig` exposes Width, Height,
"%age of black squares", and a Symmetry choice (None / 2-way mirror / 2-way
rotational / 4-way mirror / 4-way rotational — order matching the C enum
`NONE, REF2, ROT2, REF4, ROT4`), with keys matching the C config slugs
(playbook §3.4). `textFormat` returns the board text
(`.`/`-`/`|`/`#`); `canFormatAsText` is static `true`. No statusbar
(`wants_statusbar` is false).

### D10 — Stage-2 catalog mechanics

Sticks already ships as a C/WASM catalog game from `puzzles/unreleased/`, so
stage 1 simply registers the TS port (the C/WASM build stays as the live
fallback). Stage 2, on owner acceptance: add `TS_PORTED` to the
`puzzle(sticks …)` entry in `puzzles/unreleased/CMakeLists.txt`, drop its
`solver(sticks ${CMAKE_SOURCE_DIR}/dsf.c)` line, delete
`puzzles/unreleased/sticks.c` (and the `sticks-trace` harness + its
`cliprogram()` line), then `rm -rf build/wasm/` and rebuild (no `sticks.wasm`).
Icons already exist.

## Risks

- **Byte-match sensitivity of `set_blacks` + the fill/clue loop.** The generator
  draws many `random_upto` values in a fixed order; any deviation (region sizing,
  rejection-sampling order, the `SYMM_ROT4` odd-centre fix-up, the per-segment
  clue-cell pick) diverges the desc. Port the RNG-touching code verbatim and let
  the differential catch a slip.
- **Generator retry cost.** The fill loop retries until `sticks_solve_game`
  completes, and minimisation runs the solver `O(w*h)` times. Upstream accepts
  this; the differential should budget time rather than assume sub-second
  generation on the larger preset.
- **`findMistakes` re-solve correctness.** The re-solve must clear only white
  cells and preserve black cells + clues; a bug there would flag a correct board.
  Unit-test it against a known board and its unique solution.
- **Stage 2 deletes one file** and edits one CMake entry — small, gated on owner
  acceptance per the parity gate.

## Open questions for the owner

None blocking. The C survey settles the codec, solver, generator, input,
`findMistakes` and differential decisions above. The only owner-facing gate is
stage-2 acceptance (register-and-smoke-test first, flip `TS_PORTED` + delete the
C on acceptance), which is the standard parity gate, not a design question.
