# Design: Towers TS port

## D1. The generic Latin solver lives in `engine/`, not in `towers/`

`towers.c`'s solver is two small Towers-specific `usersolver`s riding on the
large, generic `latin_solver` framework (`latin.c`). That framework — the
candidate cube, positional/numeric/set elimination, forcing chains, recursion —
is shared upstream by Towers, Solo, Unequal, Keen and Group. Porting it into
`towers/` would force the next Latin game to either depend on a sibling game or
re-port it. So it goes in **`src/native/engine/latin.ts`** as a `LatinSolver`
class + a `latinSolver(grid, o, maxdiff, …, usersolvers, valid, ctx)` entry
point, generic over the per-game callbacks exactly as upstream.

Idiomatic shape, faithful logic: the `o³` cube is a `Uint8Array` indexed by the
upstream `cubepos(x,y,n) = (x·o + y)·o + (n−1)`; `place`/`elim`/`set`/`forcing`
become methods; scratch buffers are owned by the solver instance (GC, no
`new_scratch`/`free_scratch`); the result sentinels stay the upstream numeric
values (`DIFF_IMPOSSIBLE = 10`, `DIFF_AMBIGUOUS = 11`, `DIFF_UNFINISHED = 12`)
so the generator's `ret <= diff` / `ret != diff` comparisons port verbatim.
Recursion allocates a sub-solver per guess (GC-collected), mirroring
`latin_solver_recurse`.

## D2. Promote the Latin *generator* on second use

`matching` (RNG-faithful bipartite matching), `latinGenerate`, and
`latinGenerateRect` already exist, byte-faithful and differential-tested, in
`singles/generator.ts`. Towers is the second consumer, so per the playbook they
move to `engine/latin.ts` and Singles imports them. The move must be
behaviour-preserving; the Singles byte-match differential is the guard (it must
stay green after the move, before any Towers code is trusted).

## D3. Difficulty mapping

Towers difficulties (0..3) map onto the `latinSolver` difficulty parameters
exactly as `towers.c`:

| Towers diff | char | usersolver | latin layer |
| --- | --- | --- | --- |
| Easy | `e` | `solverEasy` | `diffSimple` (positional/numeric elim) |
| Hard | `h` | `solverHard` | `diffSet(false)` (row/col set elim) |
| Extreme | `x` | — | `diffSet(true)` + `forcing` |
| Unreasonable | `u` | — | recursion |

`solveTowers` calls `latinSolver(soln, w, maxdiff, simple=EASY, set0=HARD,
set1=EXTREME, forcing=EXTREME, recursive=UNREASONABLE, [solverEasy, solverHard],
towersValid, ctx)`. The generator's "exactly this difficulty, not below" gate
(`ret != diff → regenerate`) and the small-Easy empty-grid special case are
ported verbatim.

## D4. State shape

- **Params** `{ w, diff }` — square grid only (`w === h`), `3 ≤ w ≤ 9`. Encoded
  `{w}` / `{w}d{c}` (full), `c ∈ {e,h,x,u}`.
- **Immutable, shared by reference:** `clues: Int32Array(4w)` (top/bottom/left/
  right edge clues, `0` = no clue) and `immutable: Int8Array(w²)` (given grid
  digits, `0` = blank). A `cloneState` shares these and copies only the mutable
  arrays.
- **Mutable, cloned per move:** `grid: Int8Array(w²)`, `pencil: Int32Array(w²)`
  (bit `1<<n` set = pencil mark `n`), `cluesDone: Uint8Array(4w)` (clue
  struck-through), plus `completed`/`cheated` booleans.
- **Moves** (discriminated union): `{ type: "set", x, y, n, pencil }` (the
  `R`/`P` real/pencil entry; `n = 0` clears), `{ type: "clueDone", index }` (the
  `D` clue strike toggle), `{ type: "pencilAll" }` (the dev-only `M` fill), and
  `{ type: "solve", grid }` (the `S` auto-solve).
- **Ui** `{ hx, hy, hpencil, hshow, hcursor, threeD, pencilKeepHighlight }` —
  the last two are the persisted preferences (defaults: `threeD = true`,
  `pencilKeepHighlight = false`).

## D5. Clue geometry helpers

The `STARTSTEP`/`CSTARTSTEP`/`CLUEPOS` macros (clue index ↔ grid scan
start+step, and clue index ↔ border cell coordinate) port to small pure
functions in `state.ts`, used by the solver, the generator, `check_errors`, and
the renderer alike. They are the one piece of shared geometry the whole port
turns on, so they get their own unit tests.

## D6. Rendering: faithful 3D + 2D, `(w+2)²` clue border

`game_redraw`'s model — a `(w+2) × (w+2)` tile array with the clue cells on the
border ring and the play area inside — is ported as-is, including the four-tile
overlap redraw (a 3D tower protrudes up-left into its neighbours, so a changed
tile repaints its right/below neighbours too). The per-tile cache packs the
tile `long` into the `Int32Array` cache; because a tower's protrusion depends on
neighbours, the cache key is the upstream four-corner `(tl,tr,bl,br)` tuple
folded together (the same signal upstream diffs on). 3D vs 2D is read off the
`threeD` preference; the 2D branch simply skips the tower polygons and draws the
digit centred. `mkhighlight` supplies the highlight/lowlight/done colours; the
palette is index-for-index with the C `COL_*` enum so any future
`paletteOverrides` keyed by index land correctly.

## D7. `findMistakes`

Towers uniquely determines its solution, so `findMistakes` re-solves a copy
seeded from `immutable` to the full solution (`solveTowers` at the maximum
difficulty) and flags every *player-entered* grid cell whose digit differs from
the solution. Pencil marks are never mistakes. Returns `[]` if the board isn't
uniquely solvable from the givens (defensive; generated boards always are).

## D8. `aux` and Solve

`new_game_desc` emits an `aux` solution string (`'S'` + digits). The port keeps
it: `newDesc` returns `{ desc, aux }`, and `solve(orig, curr, aux?)` returns the
`aux` solution directly when present (a freshly generated game), else re-derives
via `solveTowers` at max difficulty (a `:desc` id or loaded save), faithful to
`solve_game`. Solve is tested through a real `Midend` so the `aux` threading is
exercised, per the playbook.

## D9. Differential

Byte-match is achievable (bit-identical RNG + faithful generator), so the gated
`towers-differential.test.ts` asserts `newTowersDesc(p, randomNew(seed)).desc`
equals the frozen C desc across each difficulty, plus a solver-agreement check
(the TS solver grades each C board at exactly its recorded difficulty). The
trace harness `puzzles/auxiliary/towers-trace.c` `#include`s `../towers.c` and
prints `{seed, w, diff, desc, solverDiff}` JSON; it and `towers.c` are deleted
together at acceptance. No advisory live `scripts/diff-towers.test.ts` is
shipped: the trace binary has hard-coded seeds (= the fixture's), so a live
advisory check would only re-read the same fixture the gated test already reads —
"no signal" by the playbook's own lifecycle note. The gated byte-match over the
10-fixture difficulty spread is the durable check; regenerate it from the harness
while `towers.c` exists.

## Long-tail risks: none triggered

No `midend_supersede_game_desc` (desc is immutable), no undo-by-state-equality
(moves are definite toggles; `interpretMove` returns `null` for a no-op),
no real `#ifdef EDITOR` letters (the dev-only `M` key is kept verbatim and maps
to a normal move, not editor state).
