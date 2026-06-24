# Design: Undead TS port

Context: the "Haunted Mirror Mazes" port, listed in the Latin-family slot for its
pencil-mark UX but mechanically unrelated to Latin squares (no `engine/latin.ts`).
Towers/Unequal/Keen are the structural exemplars for the *pencil-mark UX, prefs,
and findMistakes* plumbing; the game's own logic (mirror-maze paths, the
candidate-enumeration solver) is unique. This document records the Undead-specific
decisions and the long-tail-risk stances.

## D1 — Differential is solver-agreement, not byte-match (qsort instability)

Every prior solver/codec port that earned a *gated* differential used the
**byte-match** bar (playbook §4.3): because `random.ts` is bit-identical to
`random.c`, a faithful generator reproduces the C desc exactly for the same seed.
**Undead cannot reach that bar**, and the reason is worth recording so a future
reader doesn't "fix" it:

`new_game_desc` calls `qsort(paths, num_paths, …, path_cmp)` to order paths by
`num_monsters` ascending, then seeds unique-solution paths (`get_unique`) in that
order up to a `filling` threshold. The seeded monsters become the solution, which
becomes the desc. `qsort` is **not stable**, and C's tie-ordering of equal-
`num_monsters` paths is implementation-defined — glibc (the native trace harness),
musl (the Emscripten/wasm build), and a TS stable sort all differ. So:

1. The desc the native `undead-trace` binary emits would not even match the desc
   the shipped wasm emits for the same seed — byte-match is meaningless *within
   the C side*, let alone against TS.
2. A TS port using a stable sort produces a self-consistent but different desc.

We therefore port the generator faithfully (natural shape, RNG draws in the same
order) and use a **stable** `paths.sort((a,b) => a.numMonsters - b.numMonsters)`
in TS — deterministic *within TS*, which is all a TS-only game needs (its shared
IDs are generated and replayed by TS).

The gated differential validates the **solver and codec** instead, on a frozen set
of **C-generated** boards, asserting only **order-independent** verdicts:

- **Uniqueness** — TS `solveBruteforce` finds exactly one solution.
- **Iterative solvability** — TS `solveIterative`-to-fixpoint matches the C
  recording (solved or not).
- **Post-fixpoint ambiguity count** — `count_ambiguous` (cells still ambiguous
  after the iterative fixpoint) matches C.

These three are provably independent of path order: the iterative fixpoint is the
intersection of monotone per-path constraints (unique regardless of application
order), `count_ambiguous` reads that fixpoint, and brute-force uniqueness scans
all assignments. The one *order-dependent* C quantity, `iterative_depth` (passes
to fixpoint), is **not** asserted — it only distinguishes Easy from Normal among
iteratively-solvable boards, and only at generation time. The C trace records each
board's desc + these three verdicts; the TS test re-derives them. (Playbook §4.4
analogue: match the *verdict*, but here the verdict is deliberately the
order-independent subset.)

The TS generator's own difficulty grading is self-consistent (it grades the boards
it generates with its own fixed path order), so a TS-generated "Easy" board is one
the TS solver grades Easy — correct by construction, just not identical to what C
would have produced from the same seed.

## D2 — `next_list`: the `{1,2,4}` odometer, ported verbatim

The solver's combinatorial core is `next_list(g, pos)`: an odometer over a list of
cells where each cell's digit is a monster value `1` (ghost), `2` (vampire), or `4`
(zombie), and `g->possible[pos]` is the bitmask of *allowed* values at that cell.
It increments cell `pos` to its next allowed value; on overflow it carries to
`pos-1` (recursively), returning `false` only when the whole list is exhausted. The
branch structure (including the `pos == 0` early-termination block and the exact
`possible`-value cases `1/2/3/4/5/6/7`) encodes the carry order `1 → 2 → 4`. It is
small, dense, and easy to get subtly wrong, so it is **ported branch-for-branch**
with a comment, not re-derived as a "cleaner" mixed-radix counter — the solver's
correctness and the differential depend on it enumerating the identical sequence.

## D3 — Immutable shared `UndeadCommon`; mutable `UndeadState`

C's `game_common` (refcounted, shared across undo states) holds everything derived
once from the desc: `params`, `wh`, the per-type totals, the traced `paths[]`, the
`grid`/`xinfo` arrays, and `fixed[]`. The mutable `game_state` holds `guess[]`,
`pencils[]`, the error overlays, `hints_done[]`, `solved`, `cheated`.

The port mirrors this split for cheap clones (playbook idiom — typed arrays clone
in O(cells), the shared `common` is referenced not copied):

- `UndeadCommon` — a frozen object built by `newState`/decode: `params`, `wh`,
  `numGhosts/numVampires/numZombies/numTotal`, `grid: Int32Array`,
  `xinfo: Int32Array`, `fixed: Uint8Array`, `paths: UndeadPath[]` (each path's
  `length`, `p`, `xy`, `mapping`, `gridStart`, `gridEnd`, `sightingsStart`,
  `sightingsEnd`, `numMonsters`).
- `UndeadState` — `{ common, guess: Uint8Array, pencils: Uint8Array, cellErrors,
  hintErrors, countErrors, hintsDone, solved, cheated }`. `cloneState` copies the
  typed arrays and shares `common`.

`guess[i]` is a 3-bit monster bitmask: `1` ghost, `2` vampire, `4` zombie; `3/5/6`
two-way ambiguous, `7` undecided, `0` inconsistent (solver-only). A *placed* cell
is `guess[i] ∈ {1,2,4}`; `pencils[i]` is the player's note bitmask (only meaningful
while `guess[i] == 7`).

## D4 — Desc codec

The desc is `G,V,Z,<grid>,<sightings…>`:

- **Totals** `numGhosts,numVampires,numZombies` (comma-separated decimals).
- **Grid** — reading-order over the `w·h` interior cells: a run of monster/empty
  cells is emitted as a single letter `a..z` (run length 1..26, with `z` flushing
  26 and continuing), a mirror as `L` (`\`) or `R` (`/`) preceded by the
  letter for any pending run, and a *fixed* monster (hand-entered puzzles only) as
  `G`/`V`/`Z`. `newState` walks this to populate `grid`/`xinfo`, assigning each
  non-mirror interior cell a monster index `0..numTotal-1` and marking fixed ones.
- **Sightings** — `,`-prefixed decimals, one per edge position `0..2(w+h)-1`
  clockwise from the top-left, written into the border `grid` cells.

`validateDesc` reproduces upstream's checks (three leading counts; grid fills
exactly `w·h`; monster-letter count equals the totals sum; exactly `2(w+h)`
sightings; no trailing data). After populating, `newState` runs `makePaths` and the
stable path sort.

## D5 — `makePaths`: the mirror-maze tracer

`makePaths` walks each of the `2(w+h)` edge entry points (skipping the inverse of an
already-traced path), following a direction that reflects at `L`/`R` mirrors, until
it re-hits the border. For each path it records: the cell-index list `xy[]`, the
per-step monster index `p[]` (`-1` at a mirror), the unique monster set `mapping[]`,
the two end clue positions `gridStart`/`gridEnd`, the two sightings, and
`numMonsters` (count of distinct monster cells on the path). `range2grid` maps an
edge index → interior `(x,y)` + entry direction; `grid2range` is its inverse (and
returns `-1` for non-edge / corner cells). Both are ported verbatim (pure index
arithmetic).

A path's two sighting counts are computed by one forward and one backward walk,
flipping a `mirror` flag at each `-1`: a ghost counts only while `mirror` is true, a
vampire only while false, a zombie always. `checkSolution` (solver) and
`checkPathSolution` (live error overlay) share this walk shape.

## D6 — Live error overlays vs `findMistakes` (two distinct red signals)

Upstream `execute_move` recomputes three overlays after every move and `redraw`
paints them red **live, as you play** — this is parity, not optional:

- `count_errors[t]` — monster type `t` over-placed, *or* the grid is full and the
  type's count ≠ its total. Reddens the count block and every placed cell of that
  type (`check_numbers_draw`).
- `hint_errors[end]` / `cell_errors[xy]` — a sightline whose current monsters
  already exceed its clue, or whose clue is unreachable even filling every blank.
  Reddens the clue and the whole line (`check_path_solution`).

The port recomputes these in `executeMove` and stores them on the state; `redraw`
shows them (each tracked in the diff key — playbook §3.2). They are a *legality*
signal (something is definitely wrong *now*), independent of the unique solution.

`findMistakes` (Check & Save) is the *separate*, stronger signal: re-solve the
board to its unique solution and flag each placed cell that contradicts it
(`"cell"`) and each empty cell whose non-empty notes crossed out its solution
monster (`"note"`) — playbook §3.5/§3.7. Both the live `cellErrors` and the
`findMistakes` overlay render as the red inset error treatment; they can coexist
(a cell can be both illegal-now and solution-contradicting) and both are in the
diff key via a `drawnWrong`/`drawnError` sidecar so Check & Save repaints them even
when the cell tile is otherwise unchanged.

## D7 — Pencil-mark UX + the three preferences

Undead is a pencil-mark game, so it carries the §3.7 note-taking UX: `canMarkAll`
(handles `M`/`m` → fill all blanks with all candidates), sticky pencil mode +
keep-highlight via the `prefs` hook, and the CapsLock-style pencil-mode corner
indicator (Undead has the `BORDER = TILESIZE/4` margin plus the count row, so the
indicator is painted in fixed border space, like Unequal/Keen — no cache-safe
tile). **Auto-pencil is *not* shipped** for the base port: it is a Towers/Keen
divergence tied to hint authoring; Undead's note-elimination semantics are added
with its hint change. The three real upstream preferences map through `prefs`:

| pref kw | type | Ui field |
| --- | --- | --- |
| `pencil-keep-highlight` | boolean | `pencilKeepHighlight` (default false) |
| `monsters` | choices `:pictures:letters` | `ascii` (0 → pictures, 1 → letters) |
| `count-style` | choices `:total:remaining:placed-total:left-total` | `countStyle` |

The `count-style` choice list gains a **fork-only fourth option, Left/Total**
(`COUNT_STYLE_REMAINING_TOTAL = 3`): the remaining-to-place count over the total,
e.g. `3/8` (8 needed, 5 placed → 3 to go), dimming to grey (`COL_DONE`) once 0
remain and reddening when over-placed — it reuses the shared count-block colour
logic. It is the **default** (`newUi`), a deliberate divergence from upstream's
Total default (owner-requested 2026-06-24), because showing the target *and* how
many are still needed at a glance is more useful than either alone. The other
three styles stay on the `c`/right-click cycle and in the preferences dialog.

`ascii` and `countStyle` are *also* live-toggleable in play (the `a` key flips
`ascii`; `c`/right-click on the count row cycles `countStyle`) — both emit
`UI_UPDATE` and mutate the Ui, exactly as upstream. The app's
`getPuzzlePreferences` defaults map already lists `pencil-keep-highlight: true` for
undead (a web-app divergence overriding `newUi`'s `false` — playbook §3.4); the
port matches upstream's struct default in `newUi` regardless.

The pencil-mode-indicator body colour is a palette index appended past the upstream
enum — safe because Undead has no dark-mode `paletteOverrides` in
`augmentation.ts`.

## D8 — Rendering: count row, hints, monster shapes

- **Geometry.** `BORDER = TILESIZE/4`; the grid is offset down by one `TILESIZE`
  row for the monster-count display. `computeSize = (2·BORDER + (w+2)·TILESIZE) ×
  (2·BORDER + (h+3)·TILESIZE)`. A cell `(x,y)` (1-based interior) draws at
  `BORDER + x·TILESIZE + TILESIZE/2`, `… + TILESIZE/2 + TILESIZE` (the trailing
  `+TILESIZE` is the count row).
- **Count layout** (`calculateCountLayout`) is ported faithfully — it sizes the
  font / block width / gap to fit three count blocks across the grid width under
  the chosen `count_style` (Total / Remaining `±n` / Placed/Total). Recomputed on
  first draw and when the style changes.
- **Monster shapes** (`drawMonster`: ghost wavy-bottom circle with eyes, vampire,
  zombie) are ported faithfully via the `GameDrawing` clip/circle/polygon/line
  primitives — mechanical but verbose. The ASCII path draws the letters
  `G`/`V`/`Z` instead, gated on the `ascii` ui flag.
- **Edge hints** (`drawPathHint`) draw the sighting number, coloured red on error,
  `COL_DONE` (dimmed) when struck through (`hints_done`), else `COL_TEXT`.
- **Cache.** A per-interior-cell `Int32Array` key packs `guess | pencils |
  highlight-state | hflash`; `cellErrors`/mistake overlays ride sidecar arrays
  checked in the cache-miss branch (playbook §3.2). The count blocks and edge
  hints have their own staleness checks mirroring `is_hint_stale`. The engine
  paints no pixels of its own; the `!started` branch fills the background and the
  grid frame.

## D9 — Long-tail-risk stances

- **`midend_supersede_game_desc`**: not used (`set_public_desc` is NULL). The desc
  is fixed at generation; play never changes it.
- **Undo-by-state-equality**: not used. Every move is a definite monster / pencil /
  clue-done toggle or mark-all; `interpretMove` returns `UI_UPDATE`/`null` for
  no-op input exactly as upstream, and completion is locally decidable
  (`executeMove`'s correctness sweep).
- **`#ifdef EDITOR` move letters**: none — Undead has no editor input.
- **`printing.c`**: out of scope (no fork-wide TS replacement).

## D10 — `solve()` and `aux`

`new_game_desc` does not naturally produce an `aux` (upstream's `solve_game`
re-solves from scratch), but the unique solution *is* known at generation time. The
port stashes it as an `aux` `S`-prefixed placement string (cheap; makes Solve a
no-recompute on freshly generated boards) and falls back to `findUndeadSolution`
(iterative + brute-force) when `aux` is absent (a `:desc` id or a loaded save) —
faithful to upstream, which re-solves and reports "unsolvable"/"inconsistent" when
it cannot. Solve is tested through a real `Midend` (the `aux` threading lives
there — playbook §3.6).
