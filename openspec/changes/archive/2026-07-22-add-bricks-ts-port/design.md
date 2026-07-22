# Design — add-bricks-ts-port

## Context

Bricks (Tawamurenga, invented by Nikoli) is a hexagonal shading puzzle from the
x-sheep/puzzles-unreleased collection, bundled by this fork and already shipping as
a C/WASM catalog game. Unlike an `unfinished/` game, its whole frontend is real —
`interpret_move`, `execute_move`, `game_redraw`, the solver, the generator and the
codec all work — so this is an ordinary idiomatic port, not a "finish the frontend"
job (playbook §1.1). The C is ~1,777 lines and **self-contained**: `solver(bricks)`
in `puzzles/unreleased/CMakeLists.txt` names no leaf sources, so the port depends on
nothing beyond `random.ts` (already ported) and the shared `mkhighlight` palette
helper.

Because bricks already ships as C/WASM, the **normal two-stage parity gate applies**
(playbook §6), *not* the collapsed unfinished-game variant: stage 1 registers the TS
impl with the C/WASM build left in place as the in-app fallback for smoke-testing;
stage 2 (owner-accepted) flips `TS_PORTED` and deletes the C.

The single insight the whole port turns on is the C header's rule set plus its grid
representation: the play area is a **hexagon stored as a padded parallelogram**. The
user-friendly `w`/`h` are not the array dimensions; the array is `w + ⌈h/2⌉ − 1` wide
with `F_BOUND` cells masking off the corners (`bricks_apply_bounds`), and the six hex
neighbours are a fixed step table (`{0,−1},{1,−1},{−1,0},{1,0},{−1,1},{0,1}`).
Everything below follows from that.

**Long-tail risk checklist (playbook §1) — clean.** Bricks' `set_public_desc` is
`NULL` and it does not supersede its desc; it compares no stringified state for undo
(no-op moves are suppressed *locally* by returning `MOVE_NO_EFFECT`/`null` in
`interpret_move`); it has no `#ifdef EDITOR` move letters; and while `game_print` is
a *real* routine (not a stub), `printing.c` was deleted at fork so no port promises
printing — bricks makes no new promise. None of the long-tail traps bite.

## Decisions

### D1 — Idiomatic port, C as a logic reference (not a transliteration)

Port to the idiomatic multi-file shape (`state`/`solver`/`generator`/`render`/`index`,
+ `moves.ts` if the paint helpers are shared with `render`), reading the C for *what*
the deductions and generator do, not as a control-flow template (playbook §3.1). The
`cell` bit-field (`NUM_MASK 0x7`, `F_BOUND 0x8`, `COL_MASK 0x30` with
`F_SHADE`/`F_UNSHADE`/`F_EMPTY`, the `FE_*` error flags) can stay a packed
`Uint8Array`/`Uint16Array` grid — it clones cheaply per `executeMove` and keys the
render cache directly (playbook §3.2) — but the *play* value (shade / unshade /
empty / number / bound) is exposed as a clean discriminated shape at the boundaries,
not raw masks leaking into game logic.

### D2 — Hex geometry is bespoke, not `grid.ts`

The hexagonal board is **not** built on the shared `grid.ts` tiling engine, and does
not need it. It is a rectangular `w×h` typed array where:

- the actual stored width is `w = params.w + ⌈params.h / 2⌉ − 1` (`bricks_grid_size`);
- `bricks_apply_bounds` masks the two triangular corners to `F_BOUND`, leaving a
  hexagon of exactly `params.w × params.h` playable cells;
- neighbours are the fixed six-step table above; there is **no** per-tiling geometry.

Rendering offsets each row rightward by `tilesize/2` per row (`tx += (i/w)*ts/2`) to
shear the array into the drawn hexagon; the offset origin is computed by
`game_set_offsets` (`offsetx = BORDER − ((h/2)−1)*ts`, minus another `ts` when `h` is
odd). This is a display concern (playbook §3.3): match the *look* of the sheared hex,
not the pixels. Port the bounds mask and the six-step table verbatim — they gate the
codec cell count and the neighbour-count validity, so they are logic, not display.

### D3 — Solver: contradiction + bounded lookahead, three difficulty tiers

`bricks_validate` is the core oracle: it runs three independent checks over a grid
and returns `COMPLETE` / `UNFINISHED` / `INVALID`, localising each violation into
error flags (reused by `findMistakes`, D7):

- **threes** — three consecutive `F_SHADE` in a row is `INVALID`;
- **gravity** — a shaded cell with no shaded cell below-left or below (both are
  walls/unshaded/out-of-bounds) is `INVALID`; a shaded cell whose supporters are
  merely still-empty is `UNFINISHED`;
- **counts** — a numbered cell whose shaded-neighbour count exceeds its clue, or
  whose non-unshaded neighbours can no longer reach the clue, is `INVALID`; fewer
  than the clue so far is `UNFINISHED`.

The solver (`bricks_solve_game`) drives to a fixpoint:

- `bricks_solver_try` — for each `F_EMPTY` cell, tentatively shade it; if that makes
  the grid `INVALID`, the cell is forced *unshaded* (and vice-versa). Single-cell
  contradiction. This is the `Easy` tier.
- `bricks_solver_recurse` — the same, but "does this shading lead to a
  contradiction?" is decided by a **recursive** `bricks_solve_game(maxdiff − 1)`, i.e.
  bounded lookahead. `Normal`/`Tricky` add successively deeper recursion.

All tiers are **pure deduction** — every placement is *proved* by contradiction, no
guess-and-verify-the-final-board — so bricks satisfies the guess-free-generation
policy (`feedback_guess_free_generation`); there is **no** guessing ("Unreasonable")
tier. Port the tiers idiomatically with a discriminated `COMPLETE|UNFINISHED|INVALID`
result rather than C's `char` status codes and magic `max()` folding, but keep the
deduction identical — the generator gates uniqueness on it, so any divergence changes
which boards exist (playbook rule 3, byte-match surface).

**Known upstream quirk, preserved:** the min-difficulty gate rejects only puzzles the
`Easy` solver *completes* (`params.diff > DIFF_EASY && spaces > 6 && solve(EASY) ==
COMPLETE → regenerate`); it does **not** guarantee the puzzle strictly *requires* the
selected tier. So "Tricky may yield a Normal-difficulty board" (docs) is intended
behaviour, not a defect — do not "fix" it (playbook rule 3). Record it in
`solver.ts`.

### D4 — Generator: byte-match portable

`new_game_desc` is a pure function of the seed and is ported faithfully:

1. `bricks_apply_bounds` + `bricks_fill_grid` — fill bottom-up, choosing shade/unshade
   under the gravity and no-three-run constraints with `random_upto(rs, 3)` variety.
2. `bricks_build_numbers` — replace every non-shaded cell with its shaded-neighbour
   count.
3. Solve at `EASY` to expose ambiguity, re-number, then enforce
   `shaded/area ≥ MINIMUM_SHADED (0.4)` — regenerate the whole board if not met.
4. `bricks_remove_numbers` — `shuffle` the cell order once, then blank each numbered
   cell in that order, keeping the blank only if the puzzle still solves uniquely at
   the target difficulty (`bricks_solve_game(diff, …, strict) == COMPLETE`).
5. Enforce the min-difficulty gate (D3), else regenerate.

The RNG surface is exactly `random_upto` (fill) + one `shuffle` (removal), both over
`random.ts`, so the desc reproduces byte-for-byte from a seed. That is the byte-match
differential (D8). Port the retry-until-valid loop faithfully, including the
"regenerate on min-shaded / min-difficulty failure" restarts — they consume RNG in the
same order as C, so a paraphrase that draws differently diverges.

### D5 — Codec: run-length numbers + blanks, bounds implicit

The desc encodes only the *playable* hexagon (exactly `params.w × params.h` cells);
`F_BOUND` padding is re-derived by `bricks_apply_bounds` on decode and is never
emitted. Encoding (`new_game_desc` tail):

- a numbered cell `0`–`7` → its decimal digits, with a literal `_` separator inserted
  between two adjacent numbers (so `12` reads as clue `1` then clue `2`, not clue
  twelve);
- a run of playable (non-number, `COL_MASK`-set) cells → run-length lowercase, `a`=1
  … `z`=26, chaining `z` for longer runs.

`validate_desc` counts decoded cells and rejects "Not enough spaces" / "Too many
spaces" (distinguishing which), and "Number is out of range" for a clue `> 7`.
`new_game` walks the desc against the bounds mask, skipping `F_BOUND` positions. Port
encode/decode/validate as exact inverses — this is byte-match surface (D8). The
`7` clue is upstream's "unknown"/`?` sentinel and is preserved.

### D6 — Move model: a discriminated union, paint + solve

Model the move as a discriminated union, not upstream's `A%d;B%d;…` / `S…` strings
(the Loopy D5 / Pearl / Tracks precedent):

```ts
type BricksMove =
  | { kind: "paint"; cells: ReadonlyArray<{ index: number; to: CellColour }> }
  | { kind: "solve"; grid: ReadonlyArray<CellColour> };  // 'S' full-board set
```

where `CellColour` is `shade | unshade | empty` (upstream's `A`/`B`/`C`).
`interpretMove` builds these directly; `executeMove` applies each cell, then sets
`completed` when `bricks_validate(strict) == COMPLETE`. Input phases (all on the
ephemeral `Ui`, never the state):

- **Grab** (`IS_MOUSE_DOWN`): pick the target colour by cycling the cell's current
  colour (left: unshade→empty, shade→unshade, else→shade; right: the reverse), seed
  `ui.drag`. `LEFT_BUTTON`/`RIGHT_BUTTON` differ only in the cycle direction.
- **Drag** (`IS_MOUSE_DRAG`): accumulate painted cells into `ui.drag`, `UI_UPDATE`.
- **Release** (`IS_MOUSE_RELEASE`): emit one `{ kind: "paint" }` for the accumulated
  run over cells that are actually playable, else `UI_UPDATE`.

Coordinate conversion undoes the per-row `tilesize/2` shear before flooring to a cell
(`ox -= gy*ts/2` after subtracting the offsets), via the shared `fromCoord` idiom
(playbook §2.3). No-op paints are suppressed locally (return `null`), matching
upstream's `MOVE_NO_EFFECT` — never state-string equality (playbook §1).

**Keyboard cursor** is hex-aware: up/down from an even/odd row alternates between an
orthogonal and a diagonal step, and numpad `1/3/7/9` are the diagonals (playbook §3.8a
frontend trap — the web frontend never sets `MOD_NUM_KEYPAD`, so also accept the bare
digits). `Enter`/`Space`/`0`/`1`/`2` set the cursor cell's colour. Port the cursor
clamp to the hexagon (`ui.cx` bounded by the row's bound columns).

### D7 — `findMistakes`: bricks is uniquely solvable and self-validating

Bricks is a **deductive puzzle with a unique solution**, and `bricks_validate`
already localises every rule violation (three-in-a-row `FE_LINE_*`, gravity
`FE_ERROR`/`FE_TOPLEFT`/`FE_TOPRIGHT`, over-count `FE_ERROR`). So it ships
`findMistakes` (playbook §3.5): the hook runs the same validity pass and returns the
offending cells/edges, Check & Save hard-blocks on a non-empty result, and the render
overlay reuses the flags. `canFindMistakes` is true.

**Live errors vs on-demand.** Upstream draws these errors *live* every frame
(`bricks_validate` runs inside `game_redraw` on the drag-preview grid). That live
feedback is part of the game's designed UX and is cheap, so **keep rendering the
rule-violation marks live** (three-in-a-row bars, gravity diamonds, over-count
numbers) *and* expose the same computation through `findMistakes` for Check & Save.
The two share one validity module; they are not in tension. (Contrast Galaxies, whose
mistakes are only meaningful against a re-solve — bricks' violations are intrinsic to
the current grid, so live display is correct here.)

### D8 — Differential: byte-match on desc, the default for a generator/solver/codec game

Add `puzzles/auxiliary/bricks-trace.c` on the established pattern (its `cliprogram()`
line in the auxiliary CMake), dumping, per seed, the generated desc. Then
`bricks-differential.test.ts` asserts the TS `newDesc` reproduces the C desc
**byte-for-byte** across every preset and a small size sweep. Because generation is
solver-gated at every removal, that single byte-match assertion validates the
generator, the solver (every deduction) and the codec together over the bit-identical
`random.ts` — the strongest check available and the default for this class of game
(playbook §4.3, `feedback_byte_parity_scope`). A tier-1 test additionally round-trips
the codec and checks a fresh solve of each C board reaches `COMPLETE`.

### D9 — `textFormat` returns the ASCII board; no statusbar

`game_can_format_as_text_now` is `true` and `game_text_format` renders the sheared hex
as ASCII (`#` shade, `-` unshade, `.` empty, digit clue, `?` unknown). Port it;
`textFormat` returns that string (`canFormatAsText` static `true`). `wants_statusbar`
is **false**, so there is no move-count/status surface to wire — simpler than the
movement ports.

## Risks

- **The hex shear is the only genuinely new geometry.** It is small (a bounds mask +
  a six-step table + a per-row draw offset) and fully determined by the C, but it is
  the one place a coordinate-conversion bug hides. Ship a tier-2.5 render-scenario
  test (a numbered board, a shaded run, a three-in-a-row error frame, a completion
  flash) and a tier-1 test that click coordinates map to the right cell across rows.
- **Generator retries.** The regenerate-on-min-shaded / min-difficulty loop can run
  several full generate+solve passes for a seed; the differential must budget time
  accordingly, not assume one pass. This is upstream's behaviour, not a regression.
- **Byte-match is load-bearing.** Any paraphrase of the fill/removal RNG order, the
  solver deductions, or the codec breaks the differential and (worse) silently changes
  which boards exist. Keep those three verbatim; idiomatic freedom is at the
  boundaries and in the render (D1, D3, playbook rule-of-thumb).

## Open questions for the owner

None blocking. Bricks already ships as a catalog C/WASM game, so unlike an
`unfinished/` port there is no "should this be in the catalog?" decision — stage 2 is
a straight `TS_PORTED` flip on owner acceptance. The presets (six: `7×6` and `10×8` ×
Easy/Normal/Tricky) are ported as-is; the owner may trim at acceptance.
