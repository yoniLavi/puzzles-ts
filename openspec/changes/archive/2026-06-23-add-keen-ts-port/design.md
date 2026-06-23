# Design: Keen TS port

Context: migration-order port #21, the second Latin-square-family game (Unequal →
Keen → Undead → Solo). Reuses the shared `engine/latin.ts` framework. The Towers
and Unequal ports are the structural exemplars; this document records only the
Keen-specific decisions and the long-tail-risk stances.

## D1 — Reuse `engine/latin.ts` unchanged; Keen is the third consumer

Keen's C solver calls `latin_solver(soln, w, maxdiff, DIFF_EASY, DIFF_HARD,
DIFF_EXTREME, DIFF_EXTREME, DIFF_UNREASONABLE, keen_solvers, keen_valid, &ctx,
NULL, NULL)`. This maps directly onto `latinSolver(grid, o, cfg)` with:

| `cfg` field | Keen value |
| --- | --- |
| `diffSimple` | `DIFF_EASY` (0) |
| `diffSet0` | `DIFF_HARD` (2) |
| `diffSet1` | `DIFF_EXTREME` (3) |
| `diffForcing` | `DIFF_EXTREME` (3) |
| `diffRecursive` | `DIFF_UNREASONABLE` (4) |
| `usersolvers` | `[solverEasy, solverNormal, solverHard, null, null]` |
| `valid` | `keenValid` |

Keen has five difficulty levels (Easy/Normal/Hard/Extreme/Unreasonable); the
framework loop `for i in 0..maxdiff` already handles any count, applying
`usersolvers[i]` plus the generic deduction keyed to that index: `DIFF_EASY` (0)
runs `solverEasy` + generic `diffSimple`; `DIFF_NORMAL` (1) runs `solverNormal`;
`DIFF_HARD` (2) runs `solverHard` + `diffSet(false)`; `DIFF_EXTREME` (3) runs
`diffSet(true)` + `forcing`; `DIFF_UNREASONABLE` (4) recurses. **No framework
change is required.** The solver context (the immutable cage decomposition) never
mutates during solving, so we share one ctx and omit `cfg.ctxNew` (exactly as
Towers/Unequal). No `cubeOut` is needed — unlike Unequal/Solo, Keen's generator
does **not** grade clues by remaining-possibility counts; it grades by whole-board
solver verdict only.

### The `solver_easy` omission hack

Upstream `solver_easy` returns 0 immediately when `ctx->diff > DIFF_EASY` (the
NORMAL deductions are a superset, so running EASY at a higher target wastes time
and muddies diagnostics). This means difficulty grading must re-solve at the level
*below* and confirm it fails — which the generator already does. We thread
`maxdiff` into the Keen ctx and reproduce the early `return 0`, so the byte-match
generator stays faithful.

## D2 — The transposed cube indexing is ported verbatim, with comments

`keen.c`'s solver works in a **transposed** cell space: `boxlist[m] = (j%w)*w +
(j/w)` and it reads the candidate cube as `solver->cube[sq[i]*w + n-1]`. Because
`latin.ts`'s cube is `cubepos(x,y,n) = (x·o+y)·o + n−1`, a transposed index `s =
x·w + y` makes `cube[s·w + n−1] = cubeGet(x,y,n)` exactly. So Keen keeps
`boxlist`/`whichbox`/`sq` in the transposed `x·w+y` space and indexes the cube
flat (`solver.cube[s*w + n-1]`), and reads the result grid (reading-order `y·w+x`)
via `grid[transpose(s)]` in `keenValid` — verbatim to C. Per playbook §2.2 (the
Unequal `gg_best_clue` transposition trap), re-deriving these into `cubeGet(x,y,n)`
calls is error-prone; the faithful flat port with a clear comment is the
low-risk choice and required for differential parity.

## D3 — The cage `Dsf` needs a *minimal-element* map (`dsf_new_min`)

`keen.c` uses `dsf_new_min`: a dsf whose `dsf_minimal(i)` returns the
*smallest-indexed* element of `i`'s class. Keen stores each cage's clue at its
minimal cell, and the desc encodes clues in minimal-cell order, so this identity
is load-bearing (not just connectivity). The shared `engine/dsf.ts` `Dsf` uses
union-by-size and does not track a minimal element.

Rather than add a min-dsf variant to the shared leaf, Keen precomputes a
`minimal: Int32Array` once after the dsf is finalised: `minimal[i] =` the smallest
`j` with `canonify(j) === canonify(i)` (built by a single ascending pass —
`root2min[canonify(i)] = first i seen`). All merges complete before any
`dsf_minimal` read in both generation and `parse_block_structure`, so a
post-construction precompute is correct and O(a). `KeenClues` carries this map
alongside the `Dsf`. The shared `Dsf` (already tie-broken to match `dsf.c`) is
used for `equivalent`/`size`/`canonify`.

## D4 — Block-structure desc codec (edges, not per-cell)

Keen's desc is two parts joined by a comma:
1. **Block structure** — the pattern of internal dividing lines, encoded as
   run-lengths of *non*-edges over the `2w(w−1)` internal grid lines (vertical in
   reading order, then horizontal in transposed order), `_`/`a`..`y` for run
   length 0..25, `z` as "25 and no following edge", then a second compression pass
   replacing same-letter runs with `letter + count`. Ported verbatim
   (`encodeBlockStructure`/`parseBlockStructure`).
2. **Clue list** — for each cage in minimal-cell order, an op tag (`a`/`s`/`m`/`d`)
   + the decimal value.

`validateDesc` re-parses the block structure (catching malformed runs / over- or
under-full grids) and checks the clue count + that `s`/`d` cages have area 2.

## D5 — Generator is partition-then-clue, solver-gated (no greedy assemble)

Unlike Unequal/Solo (greedy `gg_best_clue` assembly), Keen builds the cages
*structurally*: `latin_generate` the solution, place dominoes at random (prob 3/4
via `random_upto(rs,4)` non-zero, preferring the lowest-`revorder` neighbour),
fold remaining singletons into a neighbouring block under `MAXBLK = 6`, and
restart the whole attempt if a singleton is stranded. Clue *types* are then chosen
to keep the four operations balanced, drawing from per-block "good" candidate
buckets (avoiding low-quality clues — sums of 3/4/2w−2/2w−1, single-option
products above Normal, differences of w−1, quotients > w/2) and falling back to a
"bad" bucket (`<< BAD_SHIFT`) when no good one is left. Finally the board must
solve at *exactly* the target difficulty (solvable at `diff`, not at `diff−1`),
else regenerate; 3×3 above Normal is dialled to Normal (upstream's documented
ungenerable-difficulty exception). Every RNG draw is reproduced in order, so the
desc is byte-identical to C for the same seed (playbook §4.3).

This is a **solver-gated generator** (playbook §4.4): the published board depends
on the TS solver reaching the identical solved/stuck *verdict* as C on the
candidate board. The differential therefore asserts both the byte-match desc and
that the TS solver grades each board at the C-recorded difficulty. A capped
regenerate backstop turns any porting slip into a loud failure rather than a hang.

## D6 — `findMistakes` + note-mistakes (the Check & Save contract)

Keen is uniquely solvable, so it ships `findMistakes` (a solvable game without it
silently saves a wrong board — playbook §3.5). Re-solve from the (player-input-
free) clue structure to the unique solution; flag every filled player cell whose
digit contradicts it (`"cell"`), and every empty cell whose **non-empty** pencil
notes have crossed out its solution digit (`"note"`) — the cross-game note-mistake
convention. The solution is derived from the clues only, never the notes. Keen has
**no givens** (every cell starts blank), so unlike Towers/Unequal there is no
immutable-cell exception. Both render as the red inset overlay, tracked in the
diff key via a `drawnWrong` sidecar (§3.2) so Check & Save repaints it even when
the cell's tile is otherwise unchanged.

## D7 — Pencil-mark UX inherited from Towers/Unequal

Keen is a pencil-mark game, so it carries the full §3.7 note-taking UX:
`canMarkAll: true` (handles `M`/`m` → `pencilAll`), sticky pencil mode +
keep-highlight + auto-pencil preferences via the `prefs` hook, and the
CapsLock-style pencil-mode corner indicator. `pencil-keep-highlight` is the one
preference Keen actually has upstream (`PREF_PENCIL_KEEP_HIGHLIGHT`); sticky-pencil
and auto-pencil are the established fork divergences (default on), matching Towers
and Unequal so the family plays consistently for owner acceptance. Keen has the
`BORDER = TILESIZE/2` margin around the grid, so — like Unequal — the indicator is
painted in the empty top-right border corner (no cache-safe tile available), via
the shared `drawPencilGlyph`. The pencil-mode body colour is a palette index
appended past the upstream enum — safe because Keen has no dark-mode
`paletteOverrides` in `augmentation.ts`.

## D8 — Cage rendering uses the on-screen `draw_tile` approach, not the print tracer

`keen.c` has two ways to draw the thick cage boundaries: the interactive
`draw_tile` widens each cell's background by `GRIDEXTRA` toward same-cage
neighbours (so adjacent same-cage cells visually merge, with explicit corner-jut
rectangles), while `game_print` traces each block's perimeter as one polygon. We
port the **interactive** approach (the print path is out of scope fork-wide). The
clue text is drawn at each cage's minimal cell top-left, with the operation symbol
(`+`/`−`/`×`/`÷`, using the Unicode glyphs) omitted for area-1 cages and for
multiplication-only puzzles (matching upstream `only_one_op`). The diff cache keys
on the packed tile value (digit | pencil | highlight | error flags) as in
Towers/Unequal; the cage geometry depends only on the (immutable) dsf, so it needs
no extra cache key.

## D9 — Long-tail-risk stances

- **`midend_supersede_game_desc`**: not used. The desc is a fixed block structure
  + cage clues and never changes during play.
- **Undo-by-state-equality**: not used. Every move is a definite cell/pencil
  toggle; completion is locally decidable (`check_errors`), and `interpretMove`
  returns `null`/`UI_UPDATE` for no-op input exactly as upstream.
- **`#ifdef EDITOR` move letters**: none — Keen has no editor input.
- **`printing.c`**: out of scope (no fork-wide TS replacement).
