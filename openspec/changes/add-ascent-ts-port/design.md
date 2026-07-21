# Design — add-ascent-ts-port

## Context

Ascent (`puzzles/unreleased/ascent.c`, ~4,140 lines, © 2015 Lennard Sprong) is a
Hidoku/Hidato implementation from the x-sheep third-party collection. The player
fills a grid so the numbers 1..n form a single connected path, each number
adjacent (orthogonally or diagonally, depending on mode) to its successor. It is
a **genuine deductive logic puzzle with a unique solution**, graded across four
difficulty tiers, and it is a fully-shipped C/WASM catalog game today (not a
stubbed `unfinished/` experiment) — so it has a working in-app fallback during
the two-stage parity gate.

Five grid modes ride on one square-grid substrate (`ascent.c:99-169`):

- **Rectangle** (`RECT`) — 8-way movement.
- **Rectangle, no diagonals** (`ORTHOGONAL`) — 4-way movement.
- **Hexagon** (`HEXAGON`) and **Honeycomb** (`HONEYCOMB`) — drawn as a square grid
  with a half-tile row offset; movement disallows the top-left/bottom-right
  diagonal (6-way). Padding cells become walls (`NUMBER_WALL`/`NUMBER_BOUND`).
- **Edges** (`EDGES`) — the *1to25* variant: the grid is ringed by arrow clues
  (`NUMBER_EDGE(n)`) pointing down a row, column or diagonal at where `n` sits.

The whole design turns on one fact the C makes explicit: the solver is a
**fixpoint of pure-deduction rules** (`ascent_solve`, `ascent.c:1467`) with no
backtracking at any tier, and the generator is **solver-gated** — it removes a
clue only if the graded solver still solves the result. That gate is what makes a
byte-match differential validate generator, solver and codec at once (D7).

**Long-tail risk checklist (playbook §1) — clean.** Ascent has no
`set_public_desc` and does not supersede its desc (`new_game_desc` emits a static
description; there is no first-click reveal). It compares no stringified state for
undo — `execute_move` applies `P`/`L`/`D`/`C`/`S` move fragments and suppresses
no-ops locally in `interpret_move`, exactly as Galaxies returns `null`. It has no
`#ifdef EDITOR` move letters. And while `game_print_*` exist in the C, this fork
deleted `printing.c` at the fork and makes no print promise — the port omits
print, as every prior port does. None of the long-tail traps bite.

## Decisions

### D1 — Desc codec: the run-length number/blank/wall encoding, byte-match portable

`new_game_desc` / `validate_desc` / `new_game` (`ascent.c:1708-1953`) encode the
padded grid in row-major order:

- a **number** as its decimal value `n+1` (a `_` separator precedes a number that
  directly follows another number, so adjacent numbers stay parseable);
- a **run of empty cells** as `a`–`z` (1–26), repeating `z` for longer runs;
- a **run of wall cells** as `A`–`Z` (1–26), repeating `Z` for longer runs;
- in **Edges** mode the arrow clues are ordinary numbers on the padding ring;
  `new_game` re-tags border numbers as `NUMBER_EDGE` after decode.

The desc carries no trailing coordinates or minmoves (unlike Slide) — it is the
grid alone. Port the encoder and decoder as exact inverses; this is byte-match
surface (D7). `validate_desc` reproduces upstream's checks: reject a number
greater than the cell count, and distinguish "Not enough spaces" from "Too many
spaces" by decoded area vs `w*h` (after `ascent_grid_size` padding).

`ascent_grid_size` (`ascent.c:1543`) is load-bearing and frozen into game IDs:
Honeycomb widens `w` by `((h+1)/2)-1`; Edges adds a 2-cell border to both `w` and
`h`. The **user-facing** `w`/`h` in params differ from the **physical** grid the
codec and solver use; keep both explicit (as the C does with `params->w` vs
`state->w`).

### D2 — Grid modes ride one square substrate; a movement table, not five geometries

Model the five modes with a single `AscentMovement { dircount, dirs: Step[] }`
table selected by mode (`ascent_movement_for_mode`, `ascent.c:162`), exactly as
the C does — **not** as five separate grid geometries and **not** via
`engine/grid.ts`. Hexagon/Honeycomb are square grids with wall padding and a
6-direction movement set; the half-tile visual offset is a *render* concern
(D9), not a state concern. `is_near` (`ascent.c:435`) — the adjacency predicate —
follows directly from the mode. This keeps `state.ts` geometry-free: every mode
is `(w, h, mode, grid, movement)`.

Wall handling: padding cells are `NUMBER_WALL`, promoted to `NUMBER_BOUND` when
they touch the border (`new_game`'s flood, `ascent.c:1931-1950`); `IS_OBSTACLE`
covers both. Port the promotion faithfully — it affects `check_completion`'s
`last` count and therefore win detection.

### D3 — Solver: a four-tier deductive fixpoint, pure deduction at every tier

`ascent_solve` (`ascent.c:1467`) runs deduction rules to a fixpoint, gated by
difficulty (Easy / Normal / Tricky / Hard). The rules, ported idiomatically with
discriminated progress codes (not C's magic `-1/0/1`):

- **Easy+**: `solver_single_position` (a number with one candidate cell),
  `solver_proximity_simple` (a placed number forces its neighbour set).
- **Normal+**: `solver_update_path` / `solver_adjacent_path` /
  `solver_remove_endpoints` / `solver_remove_path` / `solver_proximity_full` —
  path-segment reasoning over the drawn/deduced line.
- **Hard (or Edges)**: `solver_overlap`.
- **Tricky+**: `solver_single_number` (simple form at Tricky, full form at Hard).

Every rule is a deduction; **no tier guesses or backtracks** — so Ascent already
satisfies the guess-free-generation policy (`feedback_guess_free_generation`) at
all four tiers, unlike the games that spawned `strengthen-undead-deduction`.
Record this in `solver.ts` so no one "adds an Unreasonable tier" it does not have.

The solver state (`solver_scratch`) is `positions[]` (cell of each number),
`grid[]`, a `marks` candidate bitmap (`cell*number`), and path-tracking; port it
as typed arrays. The Edges generator calls the solver inside a matching loop, so
the solver must run cleanly on a partially-edged grid (D4).

### D4 — Generator: backbite Hamiltonian path, then solver-gated clue removal

`new_game_desc` (`ascent.c:1708`) loops until success:

1. **`generate_hamiltonian_path`** (`ascent.c:676`) — place mode-specific walls,
   pick a random start, then run the **backbite** algorithm (`backbite_left`/
   `backbite_right`, `ascent.c:621-674`): repeatedly extend or reflect the path
   end in a random direction until it fills every non-wall cell or stalls for
   `MAX_ATTEMPTS` (1000). The sole RNG surface is `random_upto` per step, so the
   path is a pure function of the seed.
2. **Clue reduction**, mode-dependent:
   - **Non-Edges**: `ascent_remove_numbers` (`ascent.c:1667`) — `shuffle` the
     cell order once, then for each cell (and its symmetric partner when
     `symmetrical`) blank it, re-run the graded solver, and keep the blank only
     if the puzzle stays uniquely soluble; honour `removeends` (keep 0 and the
     last number).
   - **Edges**: `ascent_add_edges` (`ascent.c:1557`) — build a bipartite graph
     of inner cells ↔ edge slots, find a maximal **matching** (the shared
     `matching` leaf, D8), move matched numbers out to their arrows, and accept
     only if the graded solver still solves it; retry up to `MAX_ATTEMPTS`.

Both paths are deterministic given the seed and gated by `ascent_solve`, so the
desc reproduces byte-for-byte (D7). Port `backbite` and the reduction loops
verbatim (byte-match surface); the RNG draw order (`random_upto`, `shuffle`,
`matching(..., rs)`) must match exactly.

### D5 — Input: a discriminated move union over three entry methods + path drawing

Upstream's move string packs five fragment kinds (`ascent.c:3074`): `P<i>,<n>`
(place number `n` at cell `i`), `L<i>,<i2>` / `D<i>,<i2>` (draw / erase a path
segment between adjacent cells), `C<i>` (clear a cell and its path), and `S…`
(the full solved grid). Per the repo convention (Loopy D5, Pearl, Tracks) model
the move as a discriminated union that `interpretMove` builds and `executeMove`
consumes:

```ts
type AscentMove =
  | { kind: "place"; cell: number; number: number }
  | { kind: "line"; from: number; to: number; erase: boolean }
  | { kind: "clear"; cell: number }
  | { kind: "solve"; grid: ReadonlyArray<number> };
```

A single user gesture may emit several fragments (the C joins them with `;`), so
`AscentMove` values are applied as an ordered batch (or the batch is itself the
move — decide in implementation; `executeMove` runs the C's per-fragment loop
either way). The three documented entry methods (`docs/ascent.md`) all reduce to
these fragments:

1. **Click a number, then an adjacent cell** (or drag) → place the successor.
2. **Click an empty cell, then type digits**, confirmed by Enter / arrow / click
   → place a typed number.
3. **Edges mode**: drag from an arrow clue, release in a same-line empty cell →
   place that arrow's number.

Plus **free-form path drawing** (left-drag to draw a line, right-click/drag to
erase) which emits `line`/`clear` fragments; `execute_move`'s post-pass
(`ascent_clean_path` / `ascent_apply_path`, `ascent.c:3172-3195`) resolves a
fully-drawn path into placed numbers. This ephemeral entry state (held number,
typing buffer, drag anchor, cursor) lives on the `Ui` (`game_ui`, `ascent.c:2062`),
never on the state — mirror it. Coordinate conversion uses the shared `fromCoord`;
`BORDER = 0` under `NARROW_BORDERS` (D9).

This is the most intricate part of the port. Keyboard cursor + Enter emulate
mouse clicks (`docs/ascent.md`); port that mapping. No `#ifdef EDITOR` letters.

### D6 — `findMistakes`: re-solve and flag contradicting numbers (ships)

Ascent has a **unique solution**, so it qualifies for `findMistakes` (playbook
§3.5) and SHALL implement it — this is a deliberate-divergence product value the
C build lacks. Approach: solve a clues-only copy to the canonical solution, then
flag every user-placed number that differs from the solution at that cell. This
is distinct from upstream's in-play error shading (`COL_ERROR`), which only marks
a **duplicated** number (`positions[n] == CELL_MULTIPLE`) or a path segment that
violates adjacency (`FLAG_ERROR`) — those stay as ordinary render state, but they
are *not* the mistake overlay. Check & Save therefore hard-blocks on a
contradiction, as for Galaxies.

Defer the exact overlay encoding (a cache sidecar vs a spare key bit) to
implementation, following Galaxies' `wrongEdges` precedent. Tier-1 tests: a board
with a wrong number reports it; a correct partial board reports none.

### D7 — Differential: byte-match on desc across every mode and difficulty

Because generation is solver-gated (D4), a single byte-match assertion validates
the generator, the graded solver and the codec together — the strongest check
available. Add `puzzles/auxiliary/ascent-trace.c` on the established pattern
(`#include "../unreleased/ascent.c"`, a `cliprogram()` line) dumping the generated
desc for `(params, seed)` tuples, and `ascent-differential.test.ts` asserting the
TS `newDesc` reproduces the C desc **byte-for-byte**. The fixture matrix spans all
five modes × the difficulty tiers (plus `symmetrical` and `removeends` variants
and a small size sweep), since each mode drives a different generation path
(backbite walls, matching, symmetry).

Budget generation time: the Edges matching loop and the solver-gated removal can
be slow on larger grids (each removal re-runs the full graded solver). Keep the
fixture sizes modest, as the C presets are (7×6, 10×8, 5×5 Edges).

### D8 — Leaf-lib reuse: `matching` from `latin.ts`; nothing else new

Ascent's only leaf dependency is `matching.c` (its `solver(ascent …)` line),
used by the Edges generator. That is already ported as
`export function matching(nl, nr, adjlists, adjsizes, rs?)` in
`src/native/engine/latin.ts` (returns the left→right assignment, `-1` for
unmatched — the exact analog of C's `match[]`). Reuse it directly; the `rs`
argument threads `random.ts` so the Edges draw order matches. No `dsf`,
`tree234`, `findloop` or `grid` dependency — the movement table (D2) replaces
grid geometry, and the solver's own structures replace the rest.

### D9 — Rendering: NARROW_BORDERS, per-mode offset, arrows, flash; no animation

`game_anim_length` returns `0.0F` (`ascent.c:3863`) — moves are **instant**; the
only motion is the completion flash (`game_flash_length`, `FLASH_FRAME = 0.03`,
`FLASH_SIZE = 4`, a wave `flash >= n && flash <= n+FLASH_SIZE` down the path).
`render.ts` needs no interpolation path.

- **Border**: `cmake/platforms/webapp.cmake` defines `NARROW_BORDERS`, so
  `BORDER = 0` (`ascent.c:3207-3211`) — the zero-border arm, checked not assumed
  (the same fact Loopy/Slide rely on).
- **Per-mode offset**: `game_set_offsets` (`ascent.c:3258`) applies the half-tile
  row shift for Hexagon/Honeycomb; this is display geometry, outside byte-parity
  scope — match the *look*, prefer clean code.
- **Arrows**: Edges mode draws arrow clues around the border (`ascent_draw_arrow`,
  `horizontal_arrow`/`diagonal_arrow`, `ascent.c:3375-3438`).
- **Endpoint hints**: a single-number path shows the one or two candidate numbers
  for its endpoints (`docs/ascent.md`; `prevhints`/`nexthints` on the Ui).
- **Palette** in C enum order (`COL_MIDLIGHT … COL_ARROW`, `ascent.c:33-44`),
  derived from the app background; do not luminance-adjust for dark mode (the app
  owns it). `COL_ERROR` is pure red.

Per-tile cache keyed on an `Int32Array` (playbook §3.2 — packed bits, **not**
`BigInt64Array`); every drag/typing/error/flash overlay in the diff key or it
won't repaint. The engine paints no pixels of its own; Ascent fills its own
background in the `!ds.started` branch.

### D10 — Stage-2 catalog mechanics: flip the existing `unreleased` entry to `TS_PORTED`

Unlike Tatham's `unfinished/` games (gated behind `PUZZLES_ENABLE_UNFINISHED`,
absent from the catalog), the `puzzles/unreleased/` games — including ascent —
**already build into the catalog with a working C/WASM fallback**. So stage 1 is
a clean registration: add `ascent` to `ts-ported-ids.ts` + `games/index.ts`; the
empty-registry fallback keeps the C/WASM ascent live for smoke-testing. Stage 2,
on owner acceptance, adds `TS_PORTED` to the existing `puzzle(ascent …)` entry in
`puzzles/unreleased/CMakeLists.txt` (it stays in place — no CMake *move*, unlike
the unfinished games), drops the `solver(ascent …)` line, deletes
`puzzles/unreleased/ascent.c`, and rebuilds with a cleared `build/wasm/` cache.

## Risks

- **Input model complexity.** Three entry methods + free-form path drawing +
  Edges drag is the largest interpret/execute surface since Galaxies. The
  `ascent_clean_path` / `ascent_apply_path` resolution pass is subtle (it turns a
  drawn line into placed numbers and can loop); port it carefully and cover it
  with tier-1 tests before wiring input.
- **Generator/solver time.** Solver-gated removal re-runs the graded solver per
  candidate cell, and the Edges path adds a matching retry loop; both can be slow
  on larger grids. Keep differential fixtures modest; a pathological Custom size
  being slow is upstream's behaviour, not a regression.
- **`ascent_grid_size` padding.** The user-facing vs physical `w`/`h` split
  (Honeycomb/Edges) is easy to get wrong in the codec and is frozen into game
  IDs. Byte-match differential across those modes is the guard.
- **`findMistakes` correctness (D6).** The re-solve must reach the *canonical*
  unique solution; verify against the differential's known-unique boards.

## Open questions for the owner

None blocking. Stage-2 catalog inclusion (D10) is the standard owner-acceptance
gate, and Ascent already ships in the catalog, so there is no "should it ship"
question as there was for Slide — only "is the TS port at parity".
