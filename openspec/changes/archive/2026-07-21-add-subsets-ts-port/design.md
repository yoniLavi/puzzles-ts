# Design — add-subsets-ts-port

## Context

Subsets (Inaba Naoki's *サブセットリンク*) is a `puzzles/unreleased/` game from the
third-party `x-sheep` collection. It is a **finished, playable deductive puzzle**:
`interpret_move`, `execute_move`, `game_redraw`, the six-rule solver, and the
uniqueness-gated generator all work. Unlike Tatham's own `unfinished/`
experiments, these unreleased games ship a working C/WASM build, so stage 1 keeps
a real fallback.

The rules, from the C header and `docs/subsets.md`: the grid holds every set over
an `n`-letter universe, placed exactly once. A horseshoe arrow points from a
superset to the subset it contains; **all** valid arrows are shown, so the
*absence* of an arrow between two adjacent cells means neither set contains the
other. At `n = 4` the universe has `2^n = 16` sets and the grid is `4×4 = 16`
cells — a bijection between cells and set-values. Each cell is rendered as a small
`2×2` block of letter slots (`CELL_WIDTH = CELL_HEIGHT = 2`); the player toggles
each letter's membership in that cell's set.

The state carries four per-cell bitmasks over the `n` letters: `clues` (the fixed
arrow flags `F_ADJ_{UP,RIGHT,DOWN,LEFT}`), `immutable` (which letter bits are
givens), `known` (letters confirmed present), and `mask` (letters not yet ruled
out). A cell is *decided* when `known == mask`; a letter slot is Known (in both),
Unknown (in mask only), or Cleared (in neither).

**Long-tail risk checklist (playbook §1) — clean.** `set_public_desc` is `NULL`
and Subsets does not supersede its desc; it compares no stringified state for undo
(no-op moves return `MOVE_NO_EFFECT` locally in `interpret_move`); it has no
`#ifdef EDITOR` move letters; and `print_size`/`print` are `false`/`NULL`, so it
makes no print promise. None of the long-tail traps bite.

## Decisions

### D1 — Desc codec: the per-cell run-length arrow encoding, an exact inverse pair

`new_game_desc` emits one token per cell in row-major order, comma-separated: the
set number (decimal) if the cell is a given, else `_`; immediately followed by any
of `U`/`R`/`D`/`L` for the arrows that leave that cell (`adjthan[].enc`).
`attempt_load_game` is the inverse: read a number (range-checked `0 … 2^n − 1`)
or `_`, then zero or more `URDL` flags, then a `,` separator.

`validateDesc` reproduces upstream's checks exactly and distinguishes the cases:
too much data (`i ≥ w·h`), too little (`i < w·h` at end), a number out of range, a
missing separator, an unexpected character, an arrow that points off the grid, and
two arrows on an edge that contradict (`f` on one side, `fo` on the other). Port it
as the exact inverse of the encoder — it is byte-match surface (D6).

Model the codec as ordinary functions over the typed state; there is no `aux`
(Solve re-runs the solver, playbook §3.6), so no `aux` threading.

### D2 — Solver: the six-rule cube loop, ported *exactly as compiled* (byte-match-critical)

`subsets_solve_game` (`subsets.c:826`) runs a candidate-elimination fixpoint over
a **cube** `cube[cell][value]` — for each cell and each of the `2^n` possible
set-values, whether that value is still a candidate. The loop calls
`subsets_validate` for a status, then applies the rules in this fixed order,
restarting the loop on the first that makes progress:

1. `sync_cube` — drop a candidate value that isn't within the cell's `mask` or
   omits a confirmed `known` bit.
2. `cube_single_count` — a value already placed exactly once is removed as a
   candidate everywhere else (each set is placed exactly once).
3. `apply_arrows` — an arrow `i1 → i2` means `set(i2) ⊆ set(i1)`, so
   `known[i1] |= known[i2]` and `mask[i2] &= mask[i1]`.
4. `disjoint` — a **missing** arrow between adjacent cells means neither contains
   the other; rule out the empty and full sets for an undecided cell, and rule out
   any value that improperly overlaps a decided neighbour.
5. `bits_from_cube` — collapse the surviving candidates back into `known`/`mask`.
6. `solve_single_position` — a value placed nowhere with exactly one remaining
   legal cell is placed there.
7. `apply_arrows_advanced` — drop a superset candidate at `i1` that has no legal
   subset candidate at `i2`.

**The solver's *reachability* is byte-match surface.** The generator keeps a cell
blank only if the solver still reaches `STATUS_COMPLETE` after blanking it (D3), so
the exact set of deductions — and their strength — decides which cells stay givens,
and therefore the desc. Two consequences (playbook §4.4, "reproduce the quirk"):

- **Port all seven functions in the C's loop order.** A stronger or weaker solver
  changes every generated board.
- **Do not port the dead code.** `apply_arrows_advanced` has a large commented-out
  "remove options that don't fit the larger set" block (`subsets.c:738-759`,
  "TODO repair this"); it is *not compiled*. Porting it would strengthen the
  solver and diverge the desc. Leave it out, with a comment naming it so a future
  reader does not "restore" it.

The cube is tiny (`16 × 16` booleans at `n = 4`); the representation is free
(a `boolean[][]`, or a `Uint16Array` of candidate-value bitmasks per cell since
`2^n = 16` fits a `Uint16` — idiomatic and cheap). Only the *deductions* are
fixed, not the storage.

### D3 — Generator: assign-all-sets, derive-arrows, blank-while-still-unique

`new_game_desc` (`subsets.c:874`):

1. Seed `known[0 … 2^n − 1] = 0 … 2^n − 1` (every set), mark all immutable.
2. **One `shuffle(known)`** — the sole RNG draw — giving a random bijection of
   sets to cells; set `mask = known`.
3. Derive every arrow clue deterministically: for each adjacent ordered pair, set
   the arrow flag iff `set(i2) ⊆ set(i1)`.
4. **`shuffle(spaces)`** — the second and last RNG draw — then walk the cells in
   that order, tentatively clearing each cell's `immutable`, re-solving a fresh
   copy, and restoring `immutable` if the solver no longer completes.
5. Encode (D1).

The RNG surface is exactly `shuffle(known)` then `shuffle(spaces)`, and the solver
is deterministic, so the desc is a pure function of the seed and reproduces
byte-for-byte (D6). Port the generator faithfully — its "vary nothing else"
simplicity is the curve upstream shipped (playbook rule 3), not a defect.

### D4 — Input: a sub-cell tri-state toggle as a discriminated-union move

Each cell is a `CELL_WIDTH × CELL_HEIGHT` block of letter slots; slot
`cn = cy·cw + cx` is letter `cn` (present only for `cn < n`). Input targets a
single slot and cycles its tri-state:

- **Left-click / Enter** cycles Unknown → Known → Cleared → Unknown.
- **Right-click / Space** cycles Unknown → Cleared → Known → Unknown.
- **Middle-click / Backspace** resets the slot to Unknown.

Immutable slots reject the toggle (`MOVE_NO_EFFECT`). A keyboard cursor navigates
slots, skipping the one-cell gaps between cell blocks (`interpret_move`'s
`do { … } while` skip). Coordinate conversion uses the shared `fromCoord` pattern
(playbook §2.3) with the `FROM_COORD` half-tile offset.

Per repo convention (Loopy D5, Pearl, Tracks), model the move as a discriminated
union rather than upstream's `"%c%d,%d"` string:

```ts
type SubsetsMove =
  | { kind: "set"; type: "known" | "cleared" | "unknown"; pos: number; bit: number }
  | { kind: "solve"; known: ReadonlyArray<number>; mask: ReadonlyArray<number> };
```

`interpretMove` builds these directly; `executeMove` applies the bit edits
(`known`/`mask` per the `K`/`C`/`U` arms of `execute_move`) and sets `completed`
when `subsets_validate == STATUS_COMPLETE`. This is **not** a pencil-mark keypad
game (playbook §3.7/§3.8): there is no digit entry and no note grid — the tri-state
per letter slot *is* the whole marking model, ported as the C has it.

### D5 — `findMistakes`: ship it (uniquely solvable), from the rule validator

Subsets has a unique solution, so per the solvable-game contract (playbook §3.5)
it **MUST** ship `findMistakes` — Check & Save depends on it. `subsets_validate`
already computes exactly the error set the C renderer highlights in `COL_ERROR`:

- a **duplicated placement** — two decided cells holding the same set-value; and
- a **violated relation** on an edge — an arrow whose `set(subset) ⊄ set(superset)`,
  or a *missing*-arrow edge where one decided set actually contains the other.

`findMistakes(state)` returns those cells/edges (a discriminated
`SubsetsMistake = { kind: "cell"; pos } | { kind: "edge"; pos; dir }`), and
`render.ts` recolours them — the mistake overlay reuses the flags the redraw
already derives. This is a rule-based check, not a re-solve-and-diff; it is the
right one here because the C's own error display *is* the rule validator, and it
flags contradictions the moment they appear. (A re-solve-to-canonical alternative
exists but would flag fewer states and duplicate work the validator already does.)

Consequence stated plainly: Check & Save is a real check for Subsets
(`canFindMistakes` true), not the degraded plain Quick-save that the movement
games get.

### D6 — Differential: byte-match on the generated desc

`puzzles/auxiliary/subsets-trace.c` dumps `new_game_desc` for a sweep of seeds at
the single supported params (`4x4n4`); `subsets-differential.test.ts` asserts the
TS `newDesc` reproduces each C desc **byte-for-byte**. Because the generator is
solver-gated at every blanking step, that one assertion validates the generator,
the full six-rule solver (its exact strength decides the givens), and the codec
together over the bit-identical `random.ts` — the strongest check available, and
the standard pattern for a generator/solver/codec game (playbook §4.3).

A second, cheaper tier-1 check independently exercises the solver: every generated
board solves to `STATUS_COMPLETE` and its clue set is internally consistent.

### D7 — Leaf-lib reuse: only `shuffle`

The `solver(subsets)` / `puzzle(subsets)` CMake block names **no** leaf-lib
dependency, and the source uses only `shuffle` from `random.c` (already
`src/native/random`) plus core puzzle infrastructure. There is no
`latin`/`dsf`/`tree234`/`grid`/`findloop` to port or reuse. The cube is a plain
local array (D2). Nothing new lands in `src/native/engine/`.

### D8 — Params, presets and the (absent) Custom dialog

Upstream locks Subsets to `w = h = n = 4`: `validate_params` returns an error for
anything else, and the game's `configure`/`custom_params` slots are `false`/`NULL`
— there is **no** Custom-params dialog upstream. The port matches that:

- `SubsetsParams { w, h, n }` with `encodeParams` = `"%dx%dn%d"` and a lenient
  `decodeParams` (read `w`, optional `x h`, optional `n n`), for game-ID
  round-tripping.
- `validateParams` accepts only `4×4`, `n = 4` (the exact upstream message).
- **One preset**, `"4x4 Size 4"` (the sole `game_fetch_preset` entry);
  `describeParams` emits the key `augmentation.ts` reads.
- **No `paramConfig`** — with a single legal configuration there is nothing to
  configure, and shipping a degenerate dialog would diverge from upstream's
  `configure = false`. Other sizes are an upstream TODO (`CELL_WIDTH`/`CELL_HEIGHT`
  are stubbed to constant `2`); a future change can add them, and *that* is when a
  `paramConfig` earns its place.

### D9 — `solve()` and `textFormat`, ported faithfully

Upstream ships both. `solve()` re-runs `subsets_solve_game` on a copy and, unless
the board is `STATUS_INVALID`, returns a `{ kind: "solve", … }` carrying the solved
`known`/`mask` arrays (upstream's `'S'` move); `executeMove` writes them straight
in. `textFormat` renders the ASCII board (`game_text_format`): letter slots as
`A`+index / `.` / `?`, with `>`/`<`/`v`/`^` arrows between cells; `canFormatAsText`
stays static `true`. The `Game.textFormat` returning a `string` is the
already-supported shape.

### D10 — Rendering: cells, arrows, the set tally, completion flash — no animation

`game_anim_length` is `0`, so there is **no** move animation; the only motion is a
completion flash (`FLASH_TIME = 5 · FLASH_FRAME = 0.6 s`, toggling each
`FLASH_FRAME`). `render.ts` ports `game_redraw`:

- Per-cell letter slots with the highlight/inner-background bevel; a placed letter
  drawn `COL_FIXED` (given) or `COL_GUESS` (player). Cache keyed on a packed
  `Int32Array` of `known`/`mask` (plus the flash bit) per cell (playbook §3.2 —
  the packed-bits-in-`Int32Array` pattern, **not** `BigInt64Array`).
- The **horseshoe arrows** between cells (drawn from `clues`, recoloured
  `COL_ERROR` when the mistake overlay flags that edge), and the **disjointness
  crosses** on missing-arrow edges that are violated.
- The **set tally** below the grid — every one of the `2^n` set-values labelled
  with its placement count, coloured error / lowlight / fixed by count (the extra
  `game_compute_size` height band).
- The **completion flash** and the keyboard-cursor highlight.

`computeSize` follows `game_compute_size`: `w·(cw+1)·TILESIZE` by
`h·(ch+1)·TILESIZE` plus the tally band. Border geometry follows the compiled arm
(the app owns dark-mode palette adaptation; do not luminance-adjust — playbook
§3.3). Rendering is a display concern, outside byte-parity scope: match the look
(bevelled slots, visible horseshoes, the tally), not the pixels. Ship a tier-2.5
render-scenario test with snapshots for a mid-solve frame, a mistake-overlay frame,
and a completion-flash frame.

### D11 — Stage-2 catalog mechanics

Stage 1 registers Subsets in `ts-ported-ids.ts` + `games/index.ts`; the C/WASM
build remains the fallback (these unreleased games ship a working WASM binary,
unlike Tatham's `unfinished/` stubs). Stage 2, **only on owner acceptance**, adds
`TS_PORTED` to `puzzle(subsets …)` in `puzzles/unreleased/CMakeLists.txt`, deletes
`puzzles/unreleased/subsets.c`, and rebuilds after `rm -rf build/wasm/` (the
`option()`-cache gotcha, playbook §1.1). Icons already exist.

## Implementation findings (recorded per §1.2 / task 9.5)

- **F1 — The differential matched byte-for-byte on all 12 fixtures, first
  run.** No solver-strength divergence surfaced; the dead advanced-rule block
  stayed out (D2) and the two-shuffle RNG surface (D3) held exactly.
- **F2 — Upstream's Solve never completes the game; fixed to the collection
  convention (owner-directed divergence, 2026-07-21).** `execute_move`'s
  `'S'` branch returns *before* the completion check, and nothing in
  subsets.c ever sets `cheated` — so after Solve the C game stays "ongoing"
  for ever. The first cut ported this faithfully; on review the owner chose
  consistency with every other TS port: the solve arm now runs the
  completion check (Solve ends solved-with-help) and sets `cheated` (no win
  flash on a solver fill). Not byte-match surface (the desc differential
  never runs `executeMove`). Codified for all future ports in playbook
  §3.6 ("Solve MUST complete the game").
- **F3 — "Not enough data to fill grid" is only reachable with a trailing
  comma.** `attempt_load_game` checks the separator *before* re-testing the
  loop condition, so a truncated desc like `"1"` errors "Missing separator";
  only `"1,2,"` reaches the not-enough-data message. Reproduced exactly;
  the codec tests assert the quirky messages.
- **F4 — The cube's no-candidate contradiction writes `known |= ~0`.**
  C stores `0xFFFFFFFF`; the TS `Uint16Array` stores `0xFFFF`. Proven
  observationally identical (a comment in `bitsFromCube` carries the
  argument): `mask` never exceeds `ALL_BITS(n)`, so a garbage `known` can
  never equal `mask`, never reads as decided, and never indexes `counts`.
- **F5 — The keyboard cursor is drawn through the per-cell diff, not a
  blitter.** Upstream saves/restores the cursor backing with a blitter; the
  TS render folds the cursor slot into the cell's packed cache key and draws
  the corner brackets inside the cell repaint — same pixels, no blitter
  plumbing (display concern, D10).

## Risks

- **Solver-strength fidelity is the whole differential.** The generator's desc
  depends on the solver reaching `STATUS_COMPLETE` on every intermediate board, so
  a single missing or extra deduction diverges the byte-match. Mitigation: port the
  seven functions and their loop order verbatim, and **leave the dead advanced-rule
  block out** (D2). The byte-match differential is precisely the guard for this.
- **Small and self-contained otherwise.** No leaf deps, a tiny cube, one fixed
  size — among the lowest-risk ports. The tri-state sub-cell input (D4) and the set
  tally (D10) are the only non-mechanical surfaces; both get tests.
- **Single size limits variety.** Upstream ships only `4×4n4`; the port inherits
  that. Other sizes are a clearly-scoped future change (D8), not this one.

## Open questions for the owner

1. **Catalog inclusion (D11).** Ship Subsets `TS_PORTED` now (stage 2), or keep it
   registered-but-C-served until more sizes exist? (Recommendation: ship — it is
   complete, playable and verifiable, and the icons already exist.)
2. **`findMistakes` scope (D5).** Confirm the rule-validator overlay (duplicates +
   violated relations) is the right mistake set, versus a re-solve-to-canonical
   diff. (Recommendation: the rule validator — it matches the C's own error
   display.)
