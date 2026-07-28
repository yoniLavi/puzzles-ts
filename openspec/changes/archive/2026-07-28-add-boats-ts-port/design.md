# Design — add-boats-ts-port

## Context

Boats is **Battleships**: locate a known fleet of boats in a grid, where the
numbers on the right and bottom edges give the occupancy count of each row and
column, a handful of boat *segments* are given (with orientation), and two boats
may never touch — not even diagonally. When a boat is completely surrounded by
water it is crossed off the fleet list at the bottom. It is a genuine deductive
logic puzzle with a **unique solution** at every difficulty.

Unlike the movement ports (Slide, Sokoban), boats is a member of the **deductive
family**, so this port exercises the full solvable-game contract: a solver that
gates generation, a `findMistakes` hook that Check & Save hard-blocks on, and a
later explained-hint candidate. It is otherwise self-contained: its only leaf
dependency is `dsf` (already ported to [`engine/dsf.ts`](../../src/native/engine/dsf.ts)),
and its `game_anim_length` is `0` (no move animation, only a completion flash).

The C source is ~4,237 lines. The bulk is the four-tier solver (a long ladder of
named deduction techniques) and the solver-gated generator; the frontend, codec
and rendering are ordinary. Everything below records the decisions that are *not*
mechanical.

**Long-tail risk checklist (playbook §1) — one live item (print).**

- **`midend_supersede_game_desc` / `set_public_desc`** — `NULL`; boats does not
  supersede its desc. Clean.
- **Undo via state-string equality** — none. `strcmp`/`memcmp` in `boats.c`
  appear only in config-keyword parsing and the standalone-CLI arg parser, never
  for undo. No-op moves are suppressed *locally* in `interpretMove` /
  `boats_validate_move` (playbook §1). Clean.
- **`#ifdef EDITOR` move letters** — none (grep-confirmed). Clean.
- **`printing.c` / `game_print`** — boats has a **real** `game_print` +
  `game_print_size`. `printing.c` was deleted at fork and there is no TS
  replacement, so the port ports **no** print path and makes no print promise
  (D9). This is the one long-tail item that bites, and the stance is "don't
  promise it," identical to every prior port.

## Decisions

### D1 — Codec shape: params `%dx%df%d[d%c][S],<fleet>`, desc = border clues + run-length grid

**Params** (`decode_params`/`encode_params`, `boats.c:241`/`296`). The game ID is
`<w>x<h>f<fleet>[d<diffchar>][S],<fleet-config>`:

- `w`/`h` are the grid dimensions; `f<n>` is the **maximum boat size** ("fleet
  size" in the UI — the largest boat that can appear), default 4.
- `d<c>` is the difficulty, `c ∈ {e,n,t,h}` for Easy/Normal/Tricky/Hard, emitted
  only on `encode_params(_, full=true)` (a `#seed` id), read leniently (an
  unknown char sets an invalid `diff` that `validate_params` rejects).
- `S` (optional, `full` only) is the **remove-numbers / strip** flag.
- `,<fleet-config>` is a comma-separated list: `fleetdata[k]` = how many boats of
  size `k+1` appear (e.g. `,3,2,1` = three 1-boats, two 2-boats, one 3-boat). A
  missing list uses `boats_default_fleet(fleet)` (the classic
  size-1×fleet…size-fleet×1 pyramid). Port `boats_decode_fleet`/`_encode_fleet`
  (`boats.c:144`/`163`) and `boats_default_fleet` (`boats.c:131`) exactly — the
  fleet drives generation, so it is byte-match surface.

Model params as `BoatsParams { w, h, fleet, diff, strip, fleetData }` with the
difficulty as a string-union member (not the magic `DIFF_*` int) and `fleetData`
a `number[]`. `describeParams` must emit the keys `augmentation.ts` already reads
— `width`, `height`, `fleet-size`, `difficulty` (0-based index into
`["Easy","Normal","Tricky","Hard"]`), `remove-numbers` (0/1), `fleet-configuration`
(the comma list string) — or the type-menu header shows the literal template
(playbook §3.4). `paramConfig` supplies the Custom dialog form with those slugs.

**Desc** (`new_game`/`new_game_desc`/`validate_desc`, `boats.c:401`/`2885`/`479`).
The desc is two concatenated parts:

1. **Border clues** — `w+h` comma-terminated tokens, each a decimal count
   (`"3,"`) or `"-,"` for a *hidden* clue (`NO_CLUE`, the remove-numbers
   mechanic). Order is the `w+h` edge slots (columns then rows, per
   `boats_create_borderclues`).
2. **Run-length grid clues** — lowercase `a`–`z` = a run of `letter−'a'+1` empty
   squares (max run 26 = `z`); uppercase = a *given* clue at one square:
   `W`=water, and the ship-segment shapes `S`(single) `V`(vague/unknown)
   `T`(top) `B`(bottom) `L`(left) `R`(right) `C`(center). `new_game` seeds
   `grid[j]` from each given clue (a ship clue → `SHIP_VAGUE` playable, water →
   `WATER`). No trailing minmoves/aux.

Port the codec as exact inverses (byte-match surface). `validate_desc` reproduces
upstream's checks: unknown character, and — implicitly via the RLE — the right
number of squares and clue slots; distinguish over- from under-full where the C
does. `aux` is unused (the C's `solve_game` re-runs the solver — D2/D7), so no
`aux` threading (playbook §3.6).

### D2 — Solver: four pure-deductive tiers, no guessing at any level

`boats_solve_game(state, maxdiff)` (`boats.c:2488`) runs a fixpoint loop of named
techniques, each gated by a `maxdiff` threshold, and returns the **highest
difficulty actually needed** (`DIFF_EASY..DIFF_HARD`) or `-1` for
insoluble/contradiction. It **never guesses or backtracks** — there is no
recursion, no `dup_game`-and-try. Consequence, stated so it isn't re-litigated:

- **Boats satisfies the guess-free-generation policy at every named tier**
  (`feedback_guess_free_generation`). Easy/Normal/Tricky/Hard are progressively
  harder *deduction*, not a guessing tier — there is no "Unreasonable"
  guess-required level to exempt. Port the ladder faithfully; do not add a knob.

The technique ladder (function names for the port to mirror, `boats.c`):

- **Easy**: `boats_solver_initial` (seed given clues), `boats_solver_check_fill`
  (a row/column whose count is already met → fill the rest with water; whose
  blanks exactly complete the count → fill with ship), `boats_solver_check_counts`,
  `boats_solver_centers_trivial`, `boats_adjust_ships` (diagonal-neighbours-are-
  water + segment-shape resolution).
- **Normal** (adds `dsf`): `boats_solver_remove_singles`,
  `boats_solver_centers_normal`, `boats_solver_min/max_expand_dsf`
  (`boats.c:1718`–`1866`, boat-run growth bounds via a dsf over ship runs),
  `boats_solver_find_max_fleet`, `boats_solver_split_runs`.
- **Tricky**: `boats_solver_shared_diagonals`, and — when `remove-numbers`
  hid clues — `boats_solver_borderclues_fill`/`_last` (deduce a missing border
  number, solve, then restore).
- **Hard**: the row/column *hypothesis* techniques
  `boats_solver_attempt_ship_rows` / `_attempt_water_rows` /
  `boats_solver_centers_attempt` (try a fill on a scratch grid, keep what every
  consistent completion agrees on) — still deduction, no board-wide guess.

Return-code convention: an idiomatic discriminated result
(`IMPOSSIBLE` / a reached-`Difficulty`) over the shared
[`runDeductionFixpoint`](../../src/native/engine/deduction-fixpoint.ts) **only if**
its restart-on-firing + max-rung-cap bookkeeping matches boats' loop; the
`hascenters`/`hasnoclue` optimisation flags and the border-clue restore/restore
protocol may not fit (playbook §4 "check what a shared runner's bookkeeping
decides"), in which case port the loop directly. Decide by reading the loop, not
by assumption — the solver's verdict gates the desc, so its exploration order is
byte-match surface.

### D3 — `dsf` reuse, and the root-identity trap

Boats uses `dsf` (its `solver(boats … dsf.c)` line) to group ship squares into
connected boats. Reuse [`engine/dsf.ts`](../../src/native/engine/dsf.ts) `Dsf`
(union-by-size), **not** a re-rolled union-find — because `boats_check_dsf`
(`boats.c:1197`) reads `state->grid[dsf_canonify(dsf, i)]` as an **element**
("the canonical index always points to the first square of a boat"), so a
deduction *branches on the canonical root's identity*, not merely on connectivity
(playbook §4.4). The shared `Dsf` was already aligned to `dsf.c`'s root choice
(tie → second `merge` arg; larger class otherwise) for exactly this class of
game, so it is byte-match portable — but the port must not substitute a different
root rule, and the differential (D6) is what proves it did not.

### D4 — Input: a line-fill drag + cycle, on the ephemeral `Ui`

`interpret_move` (`boats.c:3203`) is a fill-a-line-of-cells drag, all state on the
`game_ui` (ephemeral, mirrors upstream):

- **Left-click** a cell cycles its content: empty→ship, ship→water, water→empty.
- **Right-click** toggles water: empty→water, water→empty.
- **Drag** (press then move) constrains to one row *or* column (whichever axis the
  pointer moved further along), previewing a run; **release** commits a `move`
  filling `[xmin..xmax]×[ymin..ymax]` (a line) from the drag's `from` to `to`.
- **Keyboard**: a cursor (arrows) with `CURSOR_SELECT`/`\b` placing a ship,
  `CURSOR_SELECT2` placing water; **Ctrl/Shift + arrow** fills a line as it moves.

Upstream's move string is `P<xmin>,<ymin>,<xmax>,<ymax>,<from>,<to>` where
`from`/`to ∈ {'-'(empty), 'B'(ship), 'W'(water), '*'(any)}`; `boats_validate_move`
(`boats.c:3161`) rejects a no-op run. Per the repo convention (Loopy D5, Slide
D4), model the move as a **discriminated union** built directly by `interpretMove`,
not the string:

```ts
type BoatsMove =
  | { kind: "fill"; x0: number; y0: number; x1: number; y1: number;
      from: BoatsCell | "any"; to: BoatsCell }
  | { kind: "solve"; grid: ReadonlyArray<BoatsCell> };
```

`executeMove` applies the fill, then runs `boats_adjust_ships` (`boats.c:773`) —
the "unknown `SHIP_VAGUE` rectangle auto-resolves to the correct
top/bottom/left/right/center/single shape once its neighbours are known, and
diagonal neighbours of a ship become water" behaviour — and updates the
auto-cross-off fleet accounting (D5/win). Coordinate conversion uses the shared
`fromCoord`; the C widens the click target on the far edges (`gx==w → w-1`),
which the port reproduces so edge rows/columns are easy to fill.

### D5 — `findMistakes`: reuse the C's live provably-wrong checker

Boats has a unique solution, so it **MUST** ship `findMistakes` — Check & Save
hard-blocks only when `canFindMistakes` is true (playbook §3.5). Boats is unusual
in that the C **already computes a set of provably-wrong cells on every redraw**
and colours them with `COL_SHIP_ERROR` / `COL_COUNT_ERROR` /
`COL_COLLISION_ERROR`. The producing functions are:

- `boats_count_ships` (`boats.c:676`) — a row/column with *more* ship squares
  than its clue count (over-filled).
- `boats_check_collision` (`boats.c:853`) — two boats touching diagonally (the
  never-adjacent rule violated).
- `boats_check_fleet` (`boats.c:884`) + `boats_check_dsf` (`boats.c:1197`) — a
  completed boat of a size the fleet has no room for (overpopulated fleet).
- `boats_validate_gridclues` (`boats.c:1126`) — a placed segment contradicting a
  given clue.

**Decision: `findMistakes` re-solves to the unique solution (the playbook §3.5
standard); the C's live rule-violations are additionally rendered for immediate
feedback.** Two layers, because they serve two purposes and are not equivalent:

- **The Check & Save hook — re-solve to the unique solution and flag every placed
  cell that contradicts it** (the Unruly/Towers/Rectangles shape, playbook §3.5),
  `[]` when the board is not yet uniquely forced. This is the **primary** basis
  because the live rule-checks are *not sufficient* for Check & Save: a player can
  place a locally-legal boat in a cell the unique solution has as water without yet
  exceeding a count or touching another boat — a wrong-but-rule-legal state the live
  checker misses, so a live-only hook would let Check & Save save a wrong board (the
  exact bug §3.5 was written to prevent). Re-solve is a **strict superset** of the
  live set: an over-count, a collision and an over-populated fleet each also
  contradict the unique solution, so nothing the live checker catches is lost.
  (Boats' solver is guess-free and deterministic — D2 — so the re-solve is cheap and
  exact.)
- **The live rule-violations — render them regardless** (over-count
  `COL_COUNT_ERROR`, collision `COL_COLLISION_ERROR`, over-full fleet / contradicted
  given `COL_SHIP_ERROR`), faithful to what the C draws as you play (parity, playbook
  §4.8 aside). These need no solver call and give the same immediate feedback the C
  build does, independently of a Check.

Render both via the `COL_*_ERROR` palette indices, folded into the per-tile cache
diff key with an `OverlaySidecar` (playbook §3.2 — an overlay not in the diff key
never repaints; do not hand-write the two-array dance). Check & Save's hard-block
follows for free from `canFindMistakes`.

### D6 — Differential: byte-match on the solver-gated generator

The generator (`new_game_desc`, `boats.c:2885`) is solver-gated: it places a
random fleet (`boats_generate_fleet`, `boats.c:2705`), derives border clues
(`boats_create_borderclues`, `boats.c:2866`), then — for a `strip` puzzle —
removes border numbers one at a time keeping each removal only while
`boats_solve_game(state, diff)` still solves, and finally `goto restart`s unless
the board is solvable at **exactly** the target difficulty
(`boats_solve_game(state, diff) != diff → restart`). So the published desc depends
on the solver's verdict on every intermediate board — a **byte-match differential
is the strongest check available** and validates generator + solver + codec + the
dsf root choice (D3) together over the bit-identical `random.ts` (playbook §4.4).

- **Gated, committed**: `boats-differential.test.ts` asserts
  `newDesc(params, randomNew(seed)).desc === fixture.desc` via
  [`describeDescDifferential`](../../src/native/engine/testing/differential.ts),
  with a follow-on `validateDesc` check. Fixtures span every preset, **both**
  `remove-numbers` states, and a size/fleet sweep.
- **Trace harness**: `puzzles/auxiliary/boats-trace.c` `#include`s
  `../unreleased/boats.c` (the unreleased path) and dumps the desc for each
  `(params, seed)`; add its `cliprogram(boats-trace boats-trace.c)` line. Build
  pure-C (`-DUSE_TS_RANDOM=0`, playbook §4.2) so `random_upto` links.

RNG surface to reproduce in order: the fleet placement draws in
`boats_generate_fleet` and the clue-removal iteration order in `new_game_desc`. A
generator that *rejects* a candidate (a merge/removal that breaks solubility)
still spent its draws — reproduce the rejection, not a cleaned-up version
(playbook §4.3).

### D7 — `solve()` re-runs the solver; no `aux`

`solve_game` (`boats.c:2659`) runs `boats_solve_game(dup, DIFFCOUNT)` on a copy
and, if solved, emits the full solution grid as a move. The port's `solve()`
re-derives the solution the same way (it ignores `aux`, which is `NULL`), and
returns `{ kind: "solve", grid }`. Test Solve **through a real `Midend`**
(playbook §3.6). Because the solver is guess-free and deterministic, this always
finds *the* unique solution when one is deducible at max difficulty.

### D8 — Stage-2 catalog mechanics: flag in place, no move

Boats already ships in the catalog as a C/WASM game (its `puzzle(boats …)` entry
in `puzzles/unreleased/CMakeLists.txt` is built into `catalog.json`). So — unlike
the `unfinished/` ports (Sokoban, Slide) that had to be *moved* into the main
`CMakeLists.txt` to become visible — boats needs **no catalog move**:

- **Stage 1**: register in `ts-ported-ids.ts` + `games/index.ts`. The C/WASM
  build remains the in-app fallback (boats stays in `unreleased/CMakeLists.txt`
  without `TS_PORTED`), so the empty-registry-fallback path covers smoke testing
  exactly as a normal port (playbook §6). `ts-ported-ids.test.ts` stays green
  because `boats` is already in `catalog.json`.
- **Stage 2 (owner-accepted)**: add `TS_PORTED` to the existing
  `puzzle(boats …)` entry in `puzzles/unreleased/CMakeLists.txt`, delete
  `puzzles/unreleased/boats.c` + the trace harness, `rm -rf build/wasm/` and
  rebuild (no `boats.wasm`). Icons already exist.

### D9 — Rendering: faithful palette, narrow border, completion flash only

Port `game_redraw`/`draw_tile` (`boats.c`) with a per-tile `Int32Array` cache
(playbook §3.2). The palette is the `COL_*` enum in order (`boats.c:52`):
`BACKGROUND(0) GRID(1) CURSOR_A(2) CURSOR_B(3) WATER(4) SHIP_CLUE(5)
SHIP_GUESS(6) SHIP_ERROR(7) SHIP_FLEET(8) SHIP_FLEET_DONE(9) SHIP_FLEET_STRIPE(10)
COUNT(11) COUNT_ERROR(12) COLLISION_ERROR(13) COLLISION_TEXT(14)` — keep the
indices C-identical, since `augmentation.ts` darkens **index 4 (water)** via
`paletteOverrides: { 4: 0.6 }` and a reindexed palette would mis-target it
(playbook §3.3).

- **Geometry** (`game_compute_size`, `boats.c:3944`): width
  `2*BORDER + (w+1)*TILESIZE` (the `+1` column holds the row-count clues), height
  `2*BORDER + GUTTER + (h+1+fleetHeight)*TILESIZE − padding` (the `+1` row holds
  the column-count clues, then the fleet display). `webapp.cmake` defines
  **`NARROW_BORDERS`**, so **`BORDER = 0`** — port that arm, checked not assumed
  (playbook §3.2). Render the fleet list at the bottom (each boat as segments,
  crossed off / striped when completed) and the count clues on the right/bottom
  edges.
- **Cell content**: water, the six ship-segment shapes + single + vague
  rectangle, given-clue vs player-guess colouring, and the live error overlays
  (D5).
- **Animation/flash**: `game_anim_length` is `0` (instant moves —
  `boats.c:3957`); `game_flash_length` returns `FLASH_TIME` on the not-completed→
  completed transition only (`boats.c:3963`). Port the completion flash, no
  interpolation.
- **`textFormat`**: `game_text_format` (`boats.c:572`) renders the board as text;
  `can_format_as_text_now` is static `true`. Port it (widen to `string` — a
  normal adopter).

## Findings — decisions the implementation overturned or added

Recorded after the port landed. Numbered `F<n>` per the repo convention; each
supersedes or extends the `D<n>` above it.

### F1 — `validate_params` is the *only* guard against an infinite generation hang

`new_game_desc` retries fleet placement in an **unbounded** loop
(`while(!boats_generate_fleet(...))`), so a fleet that cannot physically fit
spins for ever rather than failing. Nothing downstream bounds it. The one guard
is `validate_params`' final check, which *actually places the whole fleet* with
the RNG-free first-fit — so it is load-bearing behaviour, not a nicety, and the
port reproduces it exactly (including upstream's normalisation of the board to
`min(w,h) × max(w,h)`, which makes the verdict orientation-independent).

Measured with a throwaway C probe over `w,h ∈ [2,12]`, `fleet ∈ [1,5]`: the
default pyramid needs `5×5` at fleet 3, `7×7` at fleet 4 and `10×10` at fleet 5.
The first fixture sweep hit this — a `5×4 f3` case hung the trace harness for
ten minutes before it was traced to an unfittable fleet upstream would have
refused. This is **not** a Seismic-style size cap: nothing generable is slow
(the whole 34-fixture sweep generates in under a second), so `validateParams`
alone is the right and sufficient guard. A `retryLimit` backstop wraps the outer
loop anyway, because upstream's own relaxation ladder ends in an `assert` that a
release build compiles out.

### F2 — Upstream's solver is **not monotone in `maxDiff`**, and that silently broke Solve and Check & Save on Easy boards

The single most consequential finding. Raising the difficulty cap can turn a
solved board into a stuck one:

- `boats_check_dsf` runs only from Normal upward. Its final loop adds each
  **unfinished** run of length `k` to `tempfleet[k-1]` as though it were a
  finished size-`k` boat, then flags `STATUS_INVALID` when a size that is
  already fully placed appears to overflow. A partial run that will still grow
  therefore reports a contradiction the board does not have.
- `boats_validate_full_state` returns that INVALID, which **breaks the solve
  loop immediately**; the final verdict pass runs without the dsf, sees merely
  INCOMPLETE, and reports "stuck".

Measured across the twelve presets, 20 seeds each: **13–17 of 20 Easy boards are
stuck at the maximum cap** while solving fine at Easy; Normal, Tricky and Hard
are never affected (an Easy board is the only kind the generator never gates
against these techniques). Not one stuck board carried a wrong square — the
solver *stops*, it does not err, and no board ever produced a differing
solution. **Confirmed identical in the C** via a throwaway `boats-dbg` harness
(`maxdiff 0 → 0`, `maxdiff 1..4 → -1` on the same desc), so this is upstream's
behaviour, not a porting divergence.

It matters because `solve_game` and `findMistakes` both solve at `DIFFCOUNT`:

- **Solve** returned an error (upstream: a partial fill that leaves the board
  unsolved) on ~70% of Easy boards — three of the twelve presets.
- **`findMistakes` returned `[]`**, so `canFindMistakes` stayed true while
  Check & Save checked nothing and would happily store a wrong board. That is
  precisely the failure playbook §3.5 exists to prevent, and the same class as
  the Mathrax ambiguous-tier defect.

**Fix: at the call sites, not in the solver** (`solveAtAnyTier` in `solver.ts`)
— try each difficulty cap in ascending order and take the first that solves.
Rationale, and why this beats the Spokes/Seismic `upstream*` flag shape here:

- A false *abort* only ever makes the solver **weaker**, never wrong, and the
  generator re-verifies every board with the same solver — so every generated
  puzzle is correct and uniquely solvable exactly as it stands. Playbook §4
  rule 3: a weaker solver is the difficulty curve upstream shipped.
- Repairing `checkDsf` would change the solver's verdict on intermediate
  boards, hence which puzzles exist, hence **every** description — costing the
  byte-match oracle to fix something that was never wrong in generation.
- Asking each cap costs at most four solves on a path that runs once per Solve
  or Check press, and leaves the solver byte-exact against the C.

Verified in the browser: on a 10×10 Easy board, Solve now completes the fleet
and Check & Save hard-blocks a provably-wrong cell ("1 mistake found").

### F3 — `game_can_format_as_text_now` is param-dependent; widen the return, don't add a hook

D9 said to "port `game_text_format`, `can_format_as_text_now` is static
`true`". It is not: `boats.c:567` returns `params->w <= 10 && params->h <= 10`
(an 11-wide board's numbers have no single-character column). The static
`Game.canFormatAsText` flag cannot express that, so — following playbook §3.3
and the Loopy precedent — `textFormat` returns `undefined` for the params it
cannot render, and no `canFormatAsTextNow?(params)` hook is added.

### F4 — the desc encoder never flushes its **trailing** run (byte-match surface)

`new_game_desc`'s run-length loop emits a run only when it meets a clue or hits
the 26-square cap, so a board whose last squares carry no clue simply encodes
short — and an all-clue-less grid encodes as *no grid part at all* (the 4×4
Easy fixture's desc ends at its last comma). `validate_desc` accordingly
rejects only a grid that is **too long**. The spec delta's "distinguishing too
much from too little" for grid squares was wrong on this point and is corrected;
the distinction it describes applies to the border-clue count, which does have
both messages.

### F5 — `validateFullState` mutates the board, and the solver depends on it

`boats_validate_full_state` calls `boats_adjust_ships`, which rewrites every
`SHIP_VAGUE` into its resolved shape. Several deductions test for a specific
shape, and the fleet inventory only counts boats whose ends it can see, so
porting the validator as a pure predicate would silently disable much of the
solver (the playbook §4.4 mutating-validate hazard, as with Clusters' `F_ERROR`).
This is why the solver and generator work on a mutable `BoatsBoard` and only
`executeMove`/`redraw` touch the immutable `BoatsState`.

### F6 — `boats_solver_place_ship`'s `assert` is undefined behaviour; bounds-check instead

Upstream asserts its square is in bounds where `place_water` returns 0. A
release build compiles the assert out and indexes out of bounds — so the C has
no defined behaviour there (playbook §4 rule 1) and the port returns 0. Not
reachable from a generated board, but a hand-written game ID can reach it via
`centersTrivial` on an edge-row centre clue.

### F7 — Solve reports an error rather than applying a partial fill

Upstream's `solve_game` returns the solver's *partial* grid when the deduction
does not finish (only `diff == -2` is an error), so upstream's Solve can leave a
board part-filled, unsolved, and with `cheated` unset. The port returns an error
instead. This is the playbook §3.6 rule ("Solve MUST complete the game") applied
to a case upstream got wrong, and it is safe on a byte-matched port because the
differential exercises only `newDesc`/solver/codec, never `executeMove`. With
F2 in place it is also nearly unreachable: every generated board solves at some
tier.

## Risks

- **The solver is the bulk of the port and its verdict gates the desc.** ~1,000
  lines of deduction techniques across ~20 functions; a single technique that is
  *stronger or weaker* than the C removes or keeps a clue and diverges the desc
  (playbook §4.4). The byte-match differential (D6) is what catches this, so
  budget most of the port's time on getting each technique's verdict identical to
  the C on every intermediate board.
- **The `dsf` root-identity dependence (D3)** is a quiet trap: a re-rolled
  union-find with a different root rule passes connectivity tests but diverges the
  desc. Use the shared `Dsf` and let the differential prove it.
- **Generation can be slow at the `remove-numbers`/higher-difficulty end** (each
  removed clue re-runs the full solver, and `goto restart` re-rolls on a
  difficulty miss). This is inherent to a solver-gated minimiser, not a port
  regression; budget the differential's time accordingly rather than assuming
  sub-second generation.
- **First deductive port in this batch** — carries the full solvable-game
  contract (`findMistakes` + Check & Save) the movement ports skip; ship the
  paint-twice mistake-overlay test (playbook §3.2) and a tier-2.5 render scenario.

## Open questions for the owner

None blocking. One flagged, deferrable:

1. **Explained hint** — a Battleships deduction hint (Palisade-grade) is a
   compelling follow-up but is out of scope here, its own change per every prior
   port.
