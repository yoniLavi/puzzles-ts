# Design: Singles (Hitori) TS port

## Long-tail-risk pre-flight (all clear)

Read `puzzles/singles.c` against the playbook's checklist:

- **`midend_supersede_game_desc`** — not used. The desc is the fixed number grid
  and never changes.
- **Undo via state-string equality** — not used. Every cell toggle is locally
  decidable (`interpret_move` emits a definite `B`/`C`/`E` move per click), and
  completion is a pure function of the flags (`check_complete`).
- **`#ifdef EDITOR` move letters** — none.
- **`printing.c`** — Singles has a `game_print`, but printing has no TS
  replacement fork-wide and is out of scope for every port so far. Not ported.

## Cell semantics

Each cell carries an immutable number `nums[i]` in `1..max(w,h)` and a mutable
`flags[i]` bitmask: `F_BLACK` (blackened), `F_CIRCLE` (the player's "this is
white" mark), `F_ERROR` (a live rule violation, recomputed each `executeMove`),
and the solver-only `F_SCRATCH` (flood-fill / sneaky marking). A correctly
completed board: no number repeats among white cells of any row/column, no two
`F_BLACK` cells are orthogonally adjacent, and the white cells form one connected
region. `nums` is an immutable `Int8Array` shared by reference across a game's
states; `flags` is a mutable `Uint8Array` cloned per move.

## Move model

Upstream `interpret_move` emits one of `B x,y` / `C x,y` / `E x,y` (and `S` for
solve, plus the multi-cell solve diff `S;Bx,y;Cx,y;…`). Clicking a cell that is
already black or circled emits `E` (empty); otherwise `B` (left) or `C` (right).
`execute_move` always clears both bits first, then sets the chosen one. We model
this as the Range-style discriminated union:

```ts
type SinglesMove = {
  sets: { x: number; y: number; value: "black" | "circle" | "empty" }[];
  solve?: boolean;
};
```

A single click → one `sets` entry; solve → `solve: true` with one entry per cell
that differs from the current state (mirroring `game_state_diff`). `executeMove`
clears `F_BLACK|F_CIRCLE` on each target then applies the value, sets
`usedSolve` when `solve`, and finally runs `checkComplete(MARK_ERRORS)` to set
`completed` and the live `F_ERROR` highlights — exactly as upstream.

`textFormat` reproduces the C two-line-per-row format (numbers/`*`, then a `~`
row for circles) so the format round-trips.

## Solver

The solver works on a mutable scratch copy of `{ nums, flags }`. It is the
op-queue cascade from `singles.c`:

- **Op queue** (`solverOpAdd`/`solverOpsDo`): adding a black auto-queues circles
  on its four neighbours; adding a circle auto-queues blacks on same-numbered
  cells in its row and column. Contradictions (blacken a circle, circle a black,
  a white cell with no white escape) set `impossible`.
- **Once-only deductions** (number-only, run before the loop): `singlesep`
  (`A_A` → middle white), `doubles` (`AA` pair → other `A`s in line black),
  `corners` (the QC/TC/DC 2×2-corner rules), and `offsetpair` (the IP rule,
  Tricky only).
- **Loop deductions** (re-run to fixpoint): `allblackbutone` (a white cell whose
  only non-black neighbour must be white) and `removesplits` (Tricky only — a
  cell diagonally adjacent to a black that, if blackened, would disconnect the
  white region, so it must be white; contiguity via a BFS flood fill matching
  the C `solve_hassinglewhiteregion`).
- **`sneaky`** marks every cell whose number is unique in its row *and* column
  as white. This is **not** implied by the rules — it is an artefact of how the
  generator lays numbers — so it is used only to prove a Tricky board isn't
  also Easy-solvable with this freebie (`new_game_is_good`), never in `solve`.

`checkComplete(flags)` mirrors `check_complete`: clears errors (in `MARK_ERRORS`
mode), builds the black/white adjacency `Dsf` (shared `engine/dsf.ts`), in
`MUST_FILL` (solver) mode counts any still-undecided cell as an error, flags
black groups of size > 1, runs `checkRowcol` for every row and column, and marks
all-but-the-largest white regions erroneous. Returns "no errors".

`solveSpecific(diff, sneaky) → -1 | 0 | 1` (`impossible` / stuck / solved)
reproduces the C driver order and fixpoint exactly so the difficulty grading
matches C — required for the byte-match differential, since the generator's
published board is decided by the solver's verdict.

## Generator (byte-match faithful)

The generator must reproduce the C desc byte-for-byte for a given seed, so the
RNG draw order is preserved end to end. The chain:

1. **`matchingWithScratch`** — an idiomatic but RNG-faithful port of
   `matching.c` (BFS layering + DFS augmenting paths). The two RNG-bearing
   steps are reproduced exactly: `shuffle(Lorder)` once per BFS pass, and the
   in-place `random_upto` swap that permutes the remaining adjacency list during
   the DFS. The adjacency lists are mutated in place (as in C) because that swap
   is observable through later draws. No external scratch buffer — idiomatic
   arrays — but the *algorithm and draw sequence* match.
2. **`latinGenerate(o, rs)`** — shuffle the row order, then build each row by
   matching columns to unused numbers. `latinGenerateRect(w, h)` crops the
   `o×o` square (`o = max(w,h)`) to `w×h`.
3. **`newSinglesDesc`** — Latin rectangle → place blacks in shuffled cell order,
   running `solverOpsDo` / `allblackbutone` / `removesplits` between placements
   to lay forced whites (restart on `impossible`) → re-lay numbers under blacks
   via `bestBlackCol` (shuffled number choice, preferring a number that removes a
   Latin-square uniqueness, else the first non-unique) → `newGameIsGood`
   difficulty gate (`solveSpecific(diff)` must solve, `solveSpecific(diff-1,
   sneaky)` must fail) with `MAXTRIES = 20` re-randomise then full regenerate.
   Tricky downgrades to Easy when `min(w,h) < 4` (matching C). No `aux` (Solve
   re-derives via the solver, faithful to C).

## Rendering

Palette is index-for-index with the upstream `enum` (`0 COL_BACKGROUND, 1
COL_UNUSED1, 2 COL_LOWLIGHT, 3 COL_BLACK, 4 COL_WHITE, 5 COL_BLACKNUM, 6
COL_GRID, 7 COL_CURSOR, 8 COL_ERROR`) so any future `paletteOverrides` keyed by
index land correctly. `COL_BACKGROUND`/`COL_LOWLIGHT` come from `mkhighlight`;
the rest are the fixed upstream values (`COL_BLACK` black, `COL_WHITE` white,
`COL_BLACKNUM` 0.4 grey, `COL_GRID == COL_LOWLIGHT`, green cursor, red error).

`redraw` draws the `!started` grid frame + background once, then a per-tile diff
loop keyed on an `Int32Array` packed flag word (black/circle/error/cursor/
flash/black-num/impossible + a `findMistakes` overlay bit). `tile_redraw`:
background or black/error fill, a circle ring for a white mark, the number
(always for white; on black only when the show-black-numbers preference is on),
cursor corners, and a red outline when the board is `impossible`. The completion
flash (`flashLength`) fires only on a genuine completion, not a solved-with-help.

## Preferences

The single upstream preference `show-black-nums` ("Show numbers on black
squares") is exposed through the engine `prefs` hook as a boolean stored on the
`Ui` (`showBlackNums`), the same shape Untangle established. `redraw` reads it
off the ui. Upstream also toggles it by clicking off-grid; we keep that as an
extra `UI_UPDATE` path in `interpretMove` so both routes work.

## findMistakes (Check & Save)

Singles has a unique solution, so it ships `findMistakes` (the playbook makes
this part of "done" for a solvable game — without it Check & Save silently saves
a wrong board). Re-solve a blank copy of the board (just `nums`) with
`solveSpecific(DIFF_ANY)`. If it solves uniquely, every solved cell is
definitively black or white; flag each player cell whose mark contradicts the
solution (black where the solution is white, or circled where the solution is
black). Undecided cells are never mistakes. Returns `[]` when the board isn't
uniquely deducible (defensive — generated boards always are).

## Differential

Singles earns a gated byte-match differential: a faithful generation chain over
the bit-identical `random.ts` reproduces the C desc exactly. `singles-trace.c`
(`#include "../singles.c"`) prints `{ seed, desc, w, h, diff }` per fixture;
`singles-differential.test.ts` asserts
`newSinglesDesc(params, randomNew(seed)).desc === fixture.desc` across both
difficulties and several sizes via `describeDescDifferential`, plus an inline
check that the TS solver solves each decoded board at the recorded difficulty
and fails one level below. A live `scripts/diff-singles.test.ts` shells the C
trace binary while `singles.c` exists; both the trace harness and the advisory
script are deleted with the C at acceptance.
