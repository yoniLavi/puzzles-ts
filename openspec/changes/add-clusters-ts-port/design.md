# Design — add-clusters-ts-port

## Context

Clusters (invented by Inaba Naoki, "クラスター") is a two-colour grid-shading
logic puzzle from the x-sheep/puzzles-unreleased collection. Fill every cell red
or blue so that every cell touches **at least one** orthogonal same-colour
neighbour, subject to the given clues: a **dot** marks a cell that touches
**exactly one** same-colour neighbour, and *all* such dead-end cells are given.
The solution is unique.

The C is ~1,170 lines and **self-contained**: its `puzzle(clusters …)` block in
`puzzles/unreleased/CMakeLists.txt` carries **no** `solver(...)` line, so it
pulls in none of `dsf`/`latin`/`grid`/`tree234`/`findloop`. `clusters_validate`
is a plain neighbour count. This is one of the lowest-risk ports available —
closer to Sixteen than to Loopy.

Unlike Tatham's `unfinished/` experiments, the puzzles-unreleased games already
**ship as C/WASM catalog games**, so a working in-app fallback exists through
stage 1; stage 2 only stops building `clusters.wasm` and deletes the C.

**Long-tail risk checklist (playbook §1) — clean.** Clusters' `set_public_desc`
is `NULL` and it does not supersede its desc; it compares no stringified state
for undo (no-op moves are suppressed *locally* in `interpret_move` — "don't put
no-ops on the undo chain"); it has no `#ifdef EDITOR` move letters; and
`game_print` is an empty stub, so it makes no print promise. `wants_statusbar` is
false and `game_anim_length` is `0` (no move animation — only a completion
flash). None of the long-tail traps bite.

## Decisions

### D1 — Codec: run-length encoding of the given dot clues only

Only the **given** cells — the dead-end dots — are encoded; every other cell is
blank in the desc and filled by the player. The encoding
(`new_game_desc`/`new_game`/`validate_desc`) walks the grid in row-major order
tracking a running skip count and emits one character per dot:

- `a`–`y` — a **red** dot (`F_COLOR_0 | F_SINGLE`) preceded by `0`–`24` blanks
  (`'a' + run`).
- `A`–`Y` — a **blue** dot (`F_COLOR_1 | F_SINGLE`) preceded by `0`–`24` blanks.
- `z` / `Z` — a pure **skip of 25** blanks with no dot, so runs longer than 24
  chain (`while (run > 24) emit z/Z; run -= 25`).

Note the colour asymmetry to port faithfully: **lowercase = red = `F_COLOR_0`,
uppercase = blue = `F_COLOR_1`**. The decoder accumulates a position that must
land at exactly `s + 1` where `s = w*h` (the trailing `+1` is the terminating
run emitted for `i == s`). `validate_desc` rejects a position `< s+1` ("too
short"), `> s+1` ("too long"), and any character outside `a`–`z`/`A`–`Z`. Port
encode and decode as exact inverses — this is byte-match surface (D6).

Model the state grid idiomatically as a `Uint8Array` of the C flag byte
(`F_COLOR_0` / `F_COLOR_1` / `F_SINGLE`; the transient `F_ERROR` / `F_CURSOR`
render flags stay out of persisted state — see D5/D7). `cloneState` is a typed-
array copy; GC replaces `dup_game`/`free_game`.

### D2 — Solver: the contradiction rule + depth-1 lookahead, ported faithfully

Clusters' solver is three pieces:

- **`clustersValidate(state)` → `COMPLETE | UNFINISHED | INVALID`.** For each
  filled cell it counts same-colour / other-colour / empty orthogonal neighbours
  (bounded by how many neighbours exist, `maxcount`). A cell is in error if it is
  wholly surrounded by the other colour (`othercount == maxcount`), if it is a
  dot but touches `> 1` same-colour neighbour, or if a non-dot cell is one short
  of being wholly surrounded (`othercount == maxcount - 1`, i.e. it can never
  reach two same-colour neighbours). Any empty cell downgrades `COMPLETE` to
  `UNFINISHED`. It also *marks* the offending cells, which D5 reuses.
- **`solverTry` (the forced-colour rule).** For each empty cell, tentatively set
  each colour; if one colour makes the board `INVALID`, the other colour is
  **forced**. This is proof-by-contradiction on a single cell — a deterministic
  deduction, not a guess-and-backtrack search.
- **`solverRecurse` (depth-1 lookahead).** For each empty cell, tentatively set a
  colour and run the *whole* `solveGame` fixpoint (at diff 0, i.e. `solverTry`
  only) on a scratch copy; if that leads to `INVALID`, the colour is forced. One
  level of hypothetical reasoning.

`solveGame(state, maxdiff, temp)` loops `validate → solverTry → (if maxdiff ≥ 1)
solverRecurse` to a fixpoint. Return the discriminated status, not the C's magic
`-1/0/1`; carry a scratch buffer as a parameter, or allocate one per call — the
recursion re-enters at diff 0, so there is no unbounded depth.

**Guess-free posture.** Clusters exposes **no difficulty tiers** (its docs say so
outright), and its one generation path gates on `solveGame(…, maxdiff = 1)`. The
solver is contradiction-based deduction plus a single lookahead level — a
deterministic proof procedure, not blind search — so the shipped puzzles satisfy
the unique-solution / guess-free spirit (`feedback_guess_free_generation`); there
is no separate "Unreasonable" tier to exempt because there is only one tier.

### D3 — Generator: solver-gated, byte-match portable

`clusters_generate` is ported faithfully (it is the byte-match surface):

1. Randomly two-colour every cell (`random_upto(rs, 2)` per cell — this is the
   whole RNG draw the desc depends on).
2. **Flip isolated cells:** repeatedly find the first cell with **zero**
   same-colour neighbours and flip its colour, until none remains. Port the
   `break`-and-restart scan order exactly — it decides the outcome.
3. Reduce to clues: cells with **exactly one** same-colour neighbour become dot
   clues (`F_SINGLE`); every other cell is cleared to blank.
4. **Prune adjacent dot pairs:** in scan order, if a dot equals its left or upper
   neighbour dot, clear both (two adjacent dots would be mutually derivable).
5. Gate on `solveGame(state, 1, temp)`; `new_game_desc` loops
   `clusters_generate` until it returns `COMPLETE`, forcing a full re-randomise
   every `MAX_ATTEMPTS = 100` attempts (`force = attempts % 100 == 0`).

Because the only randomness is the per-cell colour draw and `solveGame` is
deterministic, the desc is a pure function of the seed and reproduces
byte-for-byte (D6). Port the scan orders, the `break` in step 2, and the
`force`-every-100 cadence verbatim.

### D4 — Move model: a discriminated union, not the C's `A%d;B%d;…` string

Upstream serialises a move as a `;`-separated run of `A<idx>` (set red) /
`B<idx>` (set blue) / `C<idx>` (clear), or an `S`-prefixed full-grid solve
string. Per the repo convention (Loopy D5, Pearl, Sokoban), model it as a
discriminated union:

```ts
type ClustersMove =
  | { kind: "paint"; cells: ReadonlyArray<{ index: number; colour: Cell }> }
  | { kind: "solve"; grid: ReadonlyArray<Cell> };   // Cell = red | blue | empty
```

`interpretMove` builds these directly; `executeMove` applies each cell edit
(**never overwriting an `F_SINGLE` given** — the C skips givens in both the drag
and solve paths), then sets `completed` when `clustersValidate` returns
`COMPLETE`. A drag that resolves to no non-given edits is suppressed to a
`UI_UPDATE` (the C returns the empty buffer as a UI update, not a move).

### D5 — `findMistakes`: reuse the built-in rule checker

Clusters is a **unique-solution logic puzzle** and already computes a per-cell
rule-violation set inside `clustersValidate` (the `F_ERROR` cells it marks and
`game_redraw` draws as a red outline). So it ships `findMistakes` (playbook
§3.5): the mistake set is exactly the cells `clustersValidate` flags `INVALID` —
a cell surrounded by the other colour, a dot with too many same-colour
neighbours, or a non-dot that can no longer reach two same-colour neighbours.
This is cheap (already computed on every transition), matches what the game
surfaces live, and is a genuine "this cell breaks a rule" signal, so Check & Save
can hard-block on it.

An **alternative** considered and *not* chosen for the baseline: re-solve to the
unique solution and flag any filled cell whose colour differs. That catches
locally-legal-but-doomed cells the rule checker misses, but it is more expensive
and diverges from what the player already sees flagged. Record the choice in
`index.ts`; the solver-contradiction variant can be revisited if the local
checker proves too weak in play. Either way `findMistakes` returns the set of
offending cell indices, which the render overlay colours (D7).

### D6 — Differential: byte-match on `newDesc`, the strongest check available

The generator is solver-gated (D3) and the codec is an exact inverse (D1), so a
single assertion — TS `newDesc(params, seed)` equals the C desc byte-for-byte —
validates the generator, the solver **and** the codec together (playbook §4
intro; the same posture Sokoban and Loopy ship). Add
`puzzles/auxiliary/clusters-trace.c` (`#include "../unreleased/clusters.c"`) and a
`cliprogram()` line, dump the desc for `(w, h, seed)` tuples across every preset
and a size sweep, and assert equality in `clusters-differential.test.ts`. No
solver-agreement assertion is needed separately — the byte-match already implies
it, because a divergent solver would generate a divergent desc.

### D7 — Rendering: faithful tiles, dots, error outline, cursor, completion flash

Port `game_redraw`/`draw_tile` idiomatically with a per-tile `Int32Array` cache
key (playbook §3.2) packing the cell colour, the dot flag, the error flag, the
cursor flag, the flash state, and any in-flight drag recolour:

- Each cell is a `COL_GRID` rect under a `tilesize-1` colour rect
  (`COL_0` red / `COL_1` blue / background for empty).
- A dot cell draws a filled circle (`COL_0_DOT` dark on red, `COL_1_DOT` white on
  blue) at the cell centre.
- A mistake cell (D5, the `activeMistakes` overlay) draws the four-sided
  `COL_ERROR` red outline (`clusters_draw_err_rectangle`).
- The keyboard cursor draws a `COL_CURSOR` green frame.
- The in-flight paint drag recolours the dragged cells to the drag colour in the
  cache key so the board previews the paint before release (the C overlays
  `ui->drag`/`ui->dragtype` in `game_redraw`).

**Border geometry:** `cmake/platforms/webapp.cmake` defines `NARROW_BORDERS`, so
the compiled arm is `BORDER = tilesize/10` (a thin grid margin, **not**
`tilesize/2`), and `game_compute_size` subtracts 1 to meet the outer grid line —
check this rather than porting the desktop default (playbook §3.2). `computeSize`
is `w*tilesize + 2*BORDER − 1` by `h*tilesize + 2*BORDER − 1`; `fromCoord` /
`coord` use the `BORDER` offset.

**Flash:** on transition to completed (and not via Solve), a
`FLASH_TIME = 3 × FLASH_FRAME = 0.3 s` flash that inverts both colours on the
even half-frames (`(int)(flashtime / FLASH_FRAME) & 1`). This is the only thing
`game_flash_length` returns non-zero for; `game_anim_length` is `0`, so there is
**no** interpolated move animation. Rendering is a display concern outside
byte-parity scope — match the *look* (coloured tiles, dots, red error frame,
green cursor, colour-inverting flash), prefer clean code, and let the game fill
its own background (playbook rendering doctrine).

### D8 — `textFormat` returns the board text

`game_text_format` renders `r`/`b`/`.` per cell (uppercase for given dots), and
`game_can_format_as_text_now` is always `true`. Port it directly; `Game.textFormat`
returns the string (no widening needed — it always produces text).

### D9 — Input: paint-and-drag plus keyboard, faithful to the C

Three input surfaces, all ported:

- **Mouse paint-drag.** `LEFT_BUTTON` down picks a drag colour by cycling the
  cell under the pointer (empty → blue, blue → red, red → clear);
  `RIGHT_BUTTON` cycles the opposite way (empty → red, red → blue, blue →
  clear). Subsequent `*_DRAG` events add cells to the drag set (skipping givens
  and cells already the drag colour); `*_RELEASE` emits one `{ kind: "paint" }`
  move for all non-given dragged cells. The ephemeral drag set lives on the `Ui`,
  never on state.
- **Keyboard cursor.** Arrow keys move the cursor (`UI_UPDATE`); Enter places
  blue, Space places red, `0`/`2` red, `1` blue, backspace clears — each
  suppressed to a no-op when it would not change the cell or targets a given.
  Shift/ctrl-arrow paint while moving the cursor (the C's `A`/`B`/`C` combo path).
- Coordinate conversion uses the shared `fromCoord` (playbook §2.3) with the
  `BORDER` offset (D7); Clusters stores cell indices, never pixel coordinates.

The game declares `REQUIRE_RBUTTON`; surface that so touch devices get a
long-press/right-button affordance the app already provides for other games.

### D10 — Stage-2 catalog mechanics

Clusters already ships from `puzzles/unreleased/CMakeLists.txt`, which uses the
shared `puzzle()` macro — and that macro already supports the `TS_PORTED` keyword
(`puzzles/cmake/setup.cmake`; the catalog generator unions `ts_ported_names`). So
stage 2 is the ordinary two-line flip, no CMake surgery like Sokoban's cross-tree
move:

1. Add `TS_PORTED` to the `puzzle(clusters …)` block in
   `puzzles/unreleased/CMakeLists.txt` (keeps the catalog metadata, stops building
   `clusters.wasm`).
2. Delete `puzzles/unreleased/clusters.c` and the `clusters-trace` harness (and
   its `cliprogram()` line).
3. `rm -rf build/wasm/` and rebuild (the playbook §1.1 stale-cache gotcha) —
   Clusters in the catalog, no `clusters.wasm`. Icons already exist.

Through stage 1 the C/WASM build remains the in-app fallback, exactly as the
registry-empty path intends.

## Risks

- **Generation time under the solver gate.** Each generator attempt runs the full
  `solveGame` fixpoint (with depth-1 recursion), and `new_game_desc` retries
  until `COMPLETE`. For the ported presets (7×7–10×10) this is fast, but the
  differential should not assume sub-millisecond generation; budget accordingly.
  Larger Custom sizes (up to `w*h < 10000`) can be slow — that is upstream's
  behaviour, not a port regression.
- **Codec asymmetry** (lowercase red / uppercase blue, `z`/`Z` as pure skips) is
  the one place a careless port silently diverges. The byte-match differential
  (D6) catches it immediately, first run.
- **`findMistakes` strength** (D5) is a judgement call: the local rule checker may
  miss doomed-but-legal cells. Shipped as the cheap, live-consistent baseline;
  the solver-contradiction variant is the recorded fallback if play shows it too
  lenient.

## Open questions for the owner

None blocking. The one product-ish choice — which `findMistakes` semantics
(local rule checker vs. re-solve) — is resolved in D5 with the local checker as
the recommended baseline and the alternative recorded; flag it at acceptance if
the checker feels too weak in play.
