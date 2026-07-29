# Design — add-salad-ts-port

## Context

Salad (`puzzles/unreleased/salad.c`, ~2,645 lines) is a **pseudo-Latin-square**
puzzle: place each of `nums` characters exactly once in every row and column of an
`order × order` grid; the remaining `order − nums` squares in each line stay empty.
It has **two game modes** in one implementation:

- **ABC End View** (`GAMEMODE_LETTERS`) — clues sit on the grid's four borders,
  each naming the first character seen looking inward along that row/column.
- **Number Ball** (`GAMEMODE_NUMBERS`) — clues sit *inside* the grid: a **ball**
  (circle) marks a square that must hold a number, a **cross** marks one that must
  stay empty.

It is a member of the Latin-square family, so the port is largely an exercise in
reusing [`engine/latin.ts`](../../src/native/engine/latin.ts) (playbook §2.2) — the
shared `latinSolver` framework and the RNG-faithful `latinGenerate` — the way
Towers/Unequal/Keen/Solo/Group already do. Unlike Tatham's `unfinished/` games
(Sokoban, Slide), Salad is **already a shipped catalog puzzle** running on C/WASM,
so the two-stage parity gate applies unchanged: stage 1 registers the TS port with
the C/WASM build as a live fallback; stage 2 (owner-accepted) flips `TS_PORTED` and
deletes the C.

**Long-tail risk checklist (playbook §1) — clean.** `set_public_desc` is `NULL` and
Salad does not supersede its desc; it compares no stringified state for undo (no-op
moves are suppressed *locally* in `interpret_move`, which returns `NULL` /
`MOVE_UI_UPDATE`); it has no `#ifdef EDITOR` move letters; and while `game_print` is
non-trivial, printing was deleted at fork and this port promises no TS replacement.
None of the long-tail traps bite.

## Decisions

### D1 — Two game modes carried on the params, branched throughout

`mode ∈ {LETTERS, NUMBERS}` is a `SaladParams` field, exactly as upstream. It fans
out into four places, and only those four:

- **Generator**: `salad_new_letters_desc` vs `salad_new_numbers_desc` (D7).
- **Desc codec**: letters descriptions are `<borderclues>,<gridclues>`; numbers
  descriptions are `<gridclues>` alone (D4).
- **Solver**: the border-clue deduction (`salad_letters_solver`) runs only in
  letters mode; the hole deductions run in both (D3).
- **Render**: letters mode draws border clues in the margin and no ball backgrounds;
  numbers mode draws balls/crosses and no border clues (D10).

The state model itself is mode-agnostic (`grid`, `holes`, `borderclues`,
`gridclues`, `marks`), so there is one `SaladState`, not two.

### D2 — Pseudo-Latin-squares-with-holes via a full order-`o` Latin square (`latin.ts` unchanged)

The whole "some squares empty" mechanic is faked, cleverly, without any new leaf:
`latin_generate(o, rs)` produces a *complete* order-`o` Latin square, then symbols
with value `> nums` are reinterpreted as **holes** (empty squares). Because a full
Latin square already places each of the `o` symbols once per line, exactly
`o − nums` squares per line become holes automatically. This is why Salad can reuse
the shared [`latinGenerate`](../../src/native/engine/latin.ts) and the generic
`latinSolver` cube untouched — the "empty" symbol is just symbols `nums+1..o`
collapsed together. Upstream's own status note flags this as a workaround pending
"latin squares where the empty square can appear more than once per row"; the port
reproduces the workaround rather than inventing that framework.

Consequence for the solver: the `latinSolver` cube is order `o` (all `o` symbols);
the salad `usersolver` translates between "this square is a hole" and "the cube has
no candidate ≤ nums here" (`latinholes_solver_sync`).

### D3 — Solver: a `latin.ts` consumer with a hole-aware `usersolver` (playbook §2.2)

Salad's `solver.ts` is its own deductions plus a thin driver, exactly the family
shape. The `usersolver` (upstream `salad_solver_easy`) runs, in order:

1. **`latinholes_solver_sync`** — if a square can hold no symbol `≤ nums`, it must be
   a hole (cross); if it can hold no symbol `> nums`, it must be a number (circle).
2. **`salad_letters_solver`** (letters mode only) — the border-clue deduction: near a
   border clue, rule out every symbol *but* the clue until the first non-hole square;
   past the reachable range, rule out the clue symbol. Distance bookkeeping accounts
   for confirmed holes.
3. **`latinholes_solver_count`** — per row/column: once `order − nums` crosses are
   known, the rest are circles; once `nums` circles are known, the rest are crosses.

The `valid` callback is trivially `true` (Salad has no whole-grid post-check beyond
what `latinholes_check` does). **Two difficulties**, mapped onto `latinSolver`'s
`cfg` like the family:

- **Normal** (`DIFF_EASY`) — the salad `usersolver` plus the generic Latin *simple*
  positional/numeric elimination.
- **Extreme** (`DIFF_HARD`) — additionally the generic Latin set-elimination
  techniques. Upstream gives Extreme **no** salad-specific `usersolver` (the
  `DIFFLIST` entry is `NULL`); the salad `usersolver` still runs at the easy tier
  within the same `latin_solver_main` sweep, so Extreme = salad hole/border
  deductions + generic set elimination.

**Both tiers are guess-free.** Upstream calls `latin_solver_main(…, diff_recursive =
DIFF_IMPOSSIBLE, …)`, so recursion/backtracking is never invoked at Normal or
Extreme — satisfying the guess-free-generation policy (`feedback_guess_free_generation`)
without an explicitly-named guessing tier. Port the `cfg` thresholds faithfully; do
not "strengthen" Extreme into a guessing solver.

A `latinholes_check(state)` completion predicate (every line has the right hole
count and each symbol once) plus `salad_checkborders` (letters mode) decide
`completed` in `executeMove`.

### D4 — Desc codec: mode-dependent run-length block encoding (byte-match surface)

Upstream's `salad_serialize` writes a run-length stream: a run of `k` empty cells is
one lowercase letter (`'a' - 1 + k`, capped at 26 per run), a cross is `X`, a circle
is `O`, and a symbol value `v` is `v + base`. The **base differs by array**: border
clues use `'A' - 1` (so `1 → 'A'`), number-mode grid clues use `'0'` (so `1 → '1'`).
The full descriptions:

- **Letters mode**: `<borderclues>,<gridclues>` — `order·4` border entries, then a
  comma, then `order·order` grid entries.
- **Numbers mode**: `<gridclues>` alone — `order·order` grid entries, no border.

`load_game` decodes the inverse, accepting both `1-9` and `A-I` digit forms plus
`O`/`X` markers and lowercase run letters. Port encode/decode as exact inverses;
this is a byte-match surface (D9). `validate_desc` is `load_game` with the state
discarded, so validation reproduces its messages verbatim, distinguishing:
*border too long*, *border invalid characters*, *border clue out of range*,
*description too short*, *grid too long*, *grid invalid characters*, *grid clue out
of range*.

### D5 — Params and config

`SaladParams { order, nums, mode, diff }`. Codec (upstream `encode_params` /
`decode_params`): `"%dn%d%c"` — order, `n`, nums, then `L` (letters) or `B` (ball /
numbers) — followed by `d%c` (the difficulty char `e`/`x`) when `full`. `decode`
reads a leading integer for `order`, an optional `n<nums>`, an `L`/`B` mode letter,
and an optional `d<char>` difficulty.

`validateParams` in upstream order: `nums ≥ 2` → `nums < order` → `order ≥ 3` →
`nums ≤ 9` → `diff` in range.

Presets (all eleven upstream, `DIFF_EASY`):

| order | nums | mode | label |
| --- | --- | --- | --- |
| 4 | 3 | Letters | `Letters: 4x4 A~C` |
| 5 | 3 | Letters | `Letters: 5x5 A~C` |
| 5 | 3 | Numbers | `Numbers: 5x5 1~3` |
| 5 | 4 | Letters | `Letters: 5x5 A~D` |
| 6 | 3 | Numbers | `Numbers: 6x6 1~3` |
| 6 | 4 | Letters | `Letters: 6x6 A~D` |
| 6 | 4 | Numbers | `Numbers: 6x6 1~4` |
| 7 | 4 | Letters | `Letters: 7x7 A~D` |
| 7 | 4 | Numbers | `Numbers: 7x7 1~4` |
| 8 | 5 | Letters | `Letters: 8x8 A~E` |
| 8 | 5 | Numbers | `Numbers: 8x8 1~5` |

**`paramConfig` + `describeParams` (playbook §3.4)**: the `augmentation.ts` `salad`
entry already exists and reads the slugs **`game-mode`** (0 = ABC End View / Letters,
1 = Number Ball / Numbers), **`size`**, **`symbols`**, **`difficulty`** (0 = Normal,
1 = Extreme). So `describeParams` must return exactly those keys (indices for the two
choices, strings for `size`/`symbols`), and `paramConfig` builds the "Custom type…"
form from the same slugs — `game-mode` and `difficulty` as `choices`, `size` and
`symbols` as numeric strings via `parseConfigInt`. The C config field order is Game
Mode, Size, Symbols, Difficulty; keep it.

### D6 — Move model: a discriminated union, not the `R`/`P`/`M`/`S` strings

Upstream serialises moves as characters — `R x,y,c` (ink), `P x,y,c` (pencil),
`M` (fill all candidates), `S…` (solve). Per the repo convention (Loopy D5,
Towers, Keen), model the move as a discriminated union that `interpretMove` builds
directly and `executeMove` consumes, e.g.

```ts
type SaladMove =
  | { kind: "set"; x: number; y: number; value: SaladCell }   // ink: digit | cross | circle | clear
  | { kind: "pencil"; x: number; y: number; value: SaladMark } // toggle a pencil mark
  | { kind: "markAll" }                                         // fill every empty cell's candidates
  | { kind: "solve"; grid: ReadonlyArray<number> };            // the solved grid
```

`interpretMove` reproduces the C input model (playbook §3.8 traps apply — the web
frontend never sets `MOD_NUM_KEYPAD`, but Salad reads only bare characters and
cursor keys, so no keypad-modifier binding is at risk):

- **Left-click** a selectable cell (empty or a circle-only clue) → select in *ink*
  mode; **right-click** → select in *pencil* mode; clicking the already-selected
  cell in the same mode deselects. `UI_UPDATE`.
- **Middle-click** an empty non-clue cell → cycle nothing → circle → cross → nothing
  (a `set` move).
- **Digit / letter** while selected → place that symbol (or a pencil mark in pencil
  mode); **`X`/`x`/`-`/`_`** → cross (or its pencil mark); **`O`/`o`/`+`/`=`** →
  circle; **Backspace/Space** → clear.
- **Arrow keys** → move the cursor; **`Enter`/`CURSOR_SELECT`** → toggle ink/pencil;
  **`M`/`m`** → fill all candidates (emitted only when it would change something).

The C stores a wrong-but-legal cell freely; a no-op (e.g. a marker on a fixed clue)
returns `null` locally — no state-string comparison (playbook §1). Move-application
in `executeMove` rebuilds state immutably (`cloneState`, GC, no `dup`/`free`).

### D7 — Generator: `latinGenerate` + solver-gated clue removal (byte-match portable)

Both generators are solver-gated retry loops over `random.ts`, so each desc is a
pure function of the seed and reproduces byte-for-byte (D9):

- **Numbers** (`salad_new_numbers_desc`): `latinGenerate(o)` → grid clues (value
  `> nums` → cross, else the number). Shuffle the cells; for each, first weaken a
  numbered ball to a bare circle and solver-gate, then try removing the ball
  entirely and solver-gate — keeping a removal only while the puzzle stays uniquely
  solvable at `diff`. A **quality check** discards any puzzle whose holes are all
  placeable with no numbers entered (`salad_solve(state, DIFF_HOLESONLY)`), looping
  for a fresh grid.
- **Letters** (`salad_new_letters_desc`): `latinGenerate(o)` → grid clues; derive the
  four border clues via `salad_scan_dir`. For `order < 8` a quality rule forces an
  **empty grid** (remove all grid clues, require solvable at `diff`, else retry);
  otherwise strip grid clues then border clues by the same shuffle-and-solver-gate
  (`salad_strip_clues`). Serialize border + grid.

`newDesc` returns the desc; `aux` carries nothing (Salad's `solve` re-runs the
solver from the clues), so no `aux` threading (playbook §3.6). Port `salad_scan_dir`,
`salad_strip_clues` and the two generators faithfully — the removal decisions gate
solubility and therefore the published desc.

### D8 — `findMistakes`, pencil-mark UX, and the on-screen keypad

Salad has a **unique solution** (solver-gated generation), so per playbook §3.5 it
**ships `findMistakes`** — without it Check & Save silently degrades to a plain
quick-save and would save a wrong board. `findMistakes(state)` re-solves from the
fixed clues to the unique solution and flags every player entry that contradicts it:
a placed symbol that isn't the solution's, a cross where the solution holds a number,
a circle where the solution holds a hole — and, first-class per §3.7, an empty cell
whose **non-empty** pencil notes have crossed out its unique-solution value
(`kind: "note"`). Returns `[]` when the board isn't uniquely deducible. Render flags
via a `COL_MISTAKE`-style overlay folded into the per-tile cache diff key (§3.2).

This is distinct from the **live error highlight** the C already draws (a red
duplicate symbol in a row/column, a red border-clue violation) — that is immediate
rule-violation feedback and is ported in `render.ts` as its own flag bits; it is not
`findMistakes`, which is solution-contradiction on demand for Check & Save.

Salad has pencil marks, so it carries the **full note-taking UX** (playbook §3.7):
the `M` mark-all handler already exists (surface it as `canMarkAll`), sticky pencil
mode via the `prefs` hook, a mode indicator, and notes-as-first-class in
`findMistakes` (above). And upstream defines `game_request_keys`, so the port
implements **`requestKeys`** (playbook §3.8): `nums` symbol keys (`A…`/`1…`), then
`X`, `O`, and a clear key — or the keypad is lost on the TS path. The keypad's symbol
base and count come from `mode`/`nums`.

### D9 — Differential: byte-match on desc across modes/difficulties/presets

Salad's generator is solver-gated at every clue removal, so the desc depends on the
solver's verdict on every intermediate board. A single **byte-match on the generated
desc** therefore validates the generator, the solver, and the codec together over
the bit-identical `random.ts` — the strongest check available (playbook §4.4). Add
`puzzles/auxiliary/salad-trace.c` on the established pattern
(`#include "../unreleased/salad.c"`, linking `latin.c` and its own deps to mirror
`solver(salad …/latin.c)`), dumping the generated desc for `(params, seed)` tuples.
`salad-differential.test.ts` asserts the TS `newDesc` reproduces the C desc
byte-for-byte across **both modes, both difficulties, and every preset**, plus a
small size sweep. Keep the C reference (`salad.c` + the trace harness) until stage-2
acceptance.

### D10 — Rendering: display-only, faithful look

Not byte-parity (playbook §3.2 — display was never in scope); match the *look* with
clean code. The board is `(order + 2)² · tilesize` with a **one-tile clue margin**
all around (`FROMCOORD(x) = x/TILE_SIZE − 1`) — a genuine margin holding the border
clues, *not* the `NARROW_BORDERS` zero-border case, so no `#ifdef` arm to pick.
`render.ts` draws, per tile: the cell background/cursor/pencil-triangle highlight,
the square border, a **ball** (two concentric circles, mode-dependent background) for
a circle, an **X** for a cross, the symbol glyph, and pencil marks (the
`solo.c`-style grid of candidates). Border clues render in the margin (letters mode).
A **completion flash** plays over `FLASH_TIME = 0.7 s` as a three-phase diagonal wave
(`(int)(flashtime / FLASH_FRAME) % 3`). Palette in C enum order (background /
highlight / lowlight / border / border-clue / pencil / immutable + guess + error
triples). Per-tile `Int32Array` cache; every overlay (cursor, pencil, error,
mistake, flash phase) in the diff key (§3.2). Tier-2.5 render-scenario tests +
snapshots for: a selected ink cell, a pencil-marked cell, a ball/cross clue, a live
error, a `findMistakes` overlay, and a completion-flash frame.

### D11 — Stage-2 catalog mechanics (the gate does *not* collapse)

Salad, unlike Tatham's `unfinished/` games, **already ships as a catalog puzzle on
C/WASM**, so the two-stage gate applies in full and the C build is a live fallback
throughout stage 1:

- **Stage 1**: register in `ts-ported-ids.ts` + `games/index.ts`. The TS port serves
  Salad; the C/WASM build remains present and is the fallback if the port regresses.
  No CMake change yet — `puzzles/unreleased/salad.c` still builds `salad.wasm`.
- **Stage 2 (owner-accepted)**: add `TS_PORTED` to `puzzle(salad …)` in
  `puzzles/unreleased/CMakeLists.txt` (and drop the `solver(salad …/latin.c)` line),
  delete `puzzles/unreleased/salad.c` and the `salad-trace` harness, `rm -rf
  build/wasm/` and rebuild (Salad in the catalog, no `salad.wasm`), then archive and
  commit port + archive together.

## Risks

- **Byte-match fidelity of the solver-gated generator.** The desc reproduces only if
  the salad `usersolver`, the generic `latinSolver` thresholds, *and* the RNG draw
  order all match. This is the payoff of the byte-match differential (D9): a red test
  localises to generator/solver/codec, and the family precedent (Towers/Keen/Unequal)
  shows it is achievable — but the two-mode, two-difficulty matrix is the real work.
- **The pseudo-Latin trick (D2) must not leak.** The cube is order `o`, not `nums`;
  the `usersolver` mediates hole↔candidate. Getting the sync/count deductions wrong
  produces a *weaker or wronger* solver that diverges the desc — caught by D9.
- **Two modes double the surface** (codec, solver branch, generator, render). Each is
  small, but the differential must exercise both, and the render tests both.

## Open questions for the owner — both resolved during implementation

1. **Statusbar — kept.** `cmake/platforms/webapp.cmake` defines `NARROW_BORDERS` but
   **not** `STYLUS_BASED`, so the C/WASM build this port replaces *does* show the
   `A~C` range label and sets `wants_statusbar`. Parity therefore means keeping it:
   the port sets `wantsStatusbar: true` and implements `statusbarText`.
2. **Presets — all eleven kept**, as the stated default.

## Findings from implementation

### F1 — `latinSolver` gained a `seed` hook (a shared-engine change)

Salad's ball/cross grid clues rule candidates out of a cell **without placing a
digit**, so they cannot travel through the grid `latinSolver` seeds itself from.
Upstream applies them in the gap between `latin_solver_alloc` and
`latin_solver_main`, and that gap had no TS equivalent. `LatinSolverConfig` now
carries an optional `seed?: (solver: LatinSolver) => void`, invoked exactly there.

It is deliberately **not** re-applied inside `latinSolverRecurse`, because upstream's
recursion likewise re-allocs a bare sub-solver and re-runs only `latin_solver_top`;
that is sound for Salad, which passes `diffRecursive = DIFF_IMPOSSIBLE` and never
recurses. The hook is documented with that caveat so a future recursing consumer
has to think about it rather than inherit a silent bug.

### F2 — the differential: 28/28 byte-for-byte, first run

`puzzles/auxiliary/salad-trace.c` records all eleven presets × both difficulties plus
a six-case size sweep (3×3 up to 9×9, including 9n8 — the densest legal board — and
both sides of the `order < 8` empty-grid rule). The TS `newDesc` reproduces the C
description byte-for-byte on **every** fixture, on the first run, and the TS solver
reaches the same minimal-difficulty verdict the C recorded. Generation is fast: the C
harness's own `genMs` runs 0.1 ms – 273 ms across the whole matrix.

### F3 — `salad_solve` is a boolean, and a solved board legitimately leaves holes blank

D3 read as though the solver produces a full order-`o` square. It does not, and the
distinction matters for `findMistakes` and for reading the solver's output. The hole
symbols (`nums+1 .. order`) are **interchangeable** — nothing in the puzzle decides
which of them sits where — so the cube never collapses on those cells and the solver
leaves them at 0. Upstream's acceptance test is `latinholes_check`, which counts a 0
*or* an above-`nums` symbol as a hole, so this is correct rather than "unfinished",
and `salad_solve`'s return is a plain solved/not-solved boolean with the difficulty
`latin_solver_main` reports discarded. The port therefore derives a cell's solution as
`grid[i] <= nums ? grid[i] : 0` and reads `holes[i]` for the marker, and the tests
assert exactly that (rather than the fuller square the design implied).

### F4 — the author's Status notes, triaged (playbook §1.0)

`puzzles/unreleased/docs/salad.md` names two faults:

- *"The system for pseudo-latin squares is currently fairly messy, and doesn't allow
  for more complex solver techniques… would greatly benefit from upstream support for
  latin squares where a symbol can appear more than once per row."* — **recorded and
  declined.** This is a `latin.ts` framework project (a repeats-aware cube), not a
  port; taking it on would also change every board Salad generates and so throw away
  the byte-match oracle that made this port verifiable. The messiness is confined to
  the hole↔candidate translation, which `solver.ts` documents at its head.
- *"The Number Ball generator currently doesn't create puzzles that make good use of
  the concept, in my opinion."* — **recorded and declined for the port**, for the same
  byte-match reason, and flagged as the natural follow-up if the owner wants it: the
  fix is a different clue-selection strategy, which is a design change with its own
  taste call. Upstream's own quality gate (throw the board away if every hole falls
  out with no number entered, `DIFF_HOLESONLY`) is ported faithfully.

One thing the docs *do* fix for free: they document Space as a clear key, which the C
never wired up (`interpret_move` accepts only `'\b'`). The port accepts Space, Delete
and the app's `CURSOR_SELECT2` alongside Backspace — a free, clearly-right divergence
that also makes the shared keypad's clear key work.

### F5 — declines, recorded

- **`adaptiveMarkAllMove` not adopted.** Salad's `M` stays fill-only. Its pencil
  bitmap is `1 << (n−1)` where the candidate-family helper assumes `1 << n`, and its
  extra "might be empty" mark (bit `nums`) is not a row/column candidate at all, so
  the "strike the obvious candidates" pass would need a Salad-specific meaning before
  it could run. Revisit with a Salad hint, where the same model is needed anyway.
- **No `order` upper bound in `validateParams`.** Upstream has none, and the measured
  cost does not justify inventing one: the largest legal board on the shipped
  presets generates in 30 ms, and the 9×9 sweep cases in 10–19 ms. This is *not* the
  Seismic situation (a generator that provably cannot produce large boards); if a
  Custom board ever proves slow, measure the tail before setting a bound (playbook
  §4.4).
- **Upstream's `DIFFCOUNT` off-by-one is not reproduced.** `lenof(salad_diffchars)`
  counts the string's NUL, so the C's `validate_params` accepts `diff == 2`. The port
  uses `DIFFCOUNT = 2`. The difference is unreachable — `custom_params` can only emit
  0 or 1, and `decode_params` parks an unrecognised letter out of range either way.

### F6 — `findMistakes` has four kinds, not three

The design listed a wrong symbol, a cross where a symbol belongs, a circle where a
hole belongs, and a note that crosses out the solution value. That is what shipped
(`"cell"` / `"cross"` / `"circle"` / `"note"`), with one refinement: a square carrying
a *fixed* bare ball is still checked, because the ball is given but the symbol inside
it is the player's. All four render as the same inset red box — a wrong **empty**
square has no glyph to recolour, so the box is what makes it visible at all.

### F7 — the border clue's erase rect is asymmetric on purpose (owner-found)

Shipped in the first cut and fixed on owner report: the grid's right-hand cell
borders were missing on every row that carried a right border clue. Cause — each
clue tile repaints itself (fill background, draw letter), but the grid's
outermost border line is drawn by the neighbouring **cell**, and on the right
edge it lands at exactly `(order+1)·ts`, which is the right clue tile's own
origin. Upstream compensates with a one-off `tx+1, ty+1, TILE_SIZE-2` for the
right clue against `tx, ty, TILE_SIZE-1` for the other three; the port had
flattened all four into one uniform rect, which is precisely the tidy-up that
breaks it. The other three edges are safe because their boundary lines land at
`ts − 1` / `ts` / `(order+1)·ts − 1`, all outside their clue tile's erase.

Fixed by restoring the asymmetry (as a named `inset` with the reasoning at the
call site) and guarded by a tier-2.5 test asserting the **invariant** — no
clue-tile erase may overlap the grid's outline box — rather than the pixel
offset, so a different fix would still pass. Also added to the playbook (§3.2),
since every clue-ring game shares the shape. Method note: the missing hairline
is invisible at 1× and was found by eye in the app; a `toSvg` + `rsvg-convert`
dump at 3× shows it immediately, and that is now the recommended check.
