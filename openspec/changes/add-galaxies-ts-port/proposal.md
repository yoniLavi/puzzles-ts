# Change: Port Galaxies to native TypeScript (migration-order item 3)

## Why

Flip established the per-game port pattern (`add-flip-ts-port`) and the
rendering-doctrine fixes that followed (`fix-flip-canvas-reshape`,
`add-parity-gated-registration`). Migration-order item 3 — Galaxies —
is the goal-4 game from `AGENTS.md`: it is the one the owner wants to
enhance with the cell↔dot association aid, and `AGENTS.md`
"Migration order" explicitly says "once TS, the cell↔dot aid is a
small follow-up." Until Galaxies is TS, that aid cannot ship.

Galaxies is also a step up in complexity from Flip in shape, which
exercises parts of the engine contract Flip did not:

- A difficulty-graded generator (NORMAL / UNREASONABLE) that retries
  until the solver-verified difficulty matches — the canonical case
  the `ts-migration` spec mentions as eligible for per-game tightening
  if needed ("a generator with brutal uniqueness constraints").
- A drag-and-hold interaction model (`M`/`A`/`a` move letters): hold a
  dot down, drag through cells to associate them; release. This puts
  pointer-press / pointer-drag / pointer-release flow through
  `interpretMove` for the first time on the TS engine.
- A subcell grid: tiles, edges, and vertices live together in a
  `(2w+1)×(2h+1)` array of `space` cells. Idiomatic TS will store this
  differently than the C `space[]` flat array.
- A union-find dependency (`dsf`) used by `check_complete` and by the
  solver — the canonical "lazy idiomatic leaf port" the `ts-migration`
  spec uses as its example ("dsf ≈ a ~20-line union-find").

This change ports Galaxies to TS at full behavioural parity with the
C build (per `add-parity-gated-registration`: rendering, animation,
input, owner-confirmed), registers it, and deletes `puzzles/galaxies.c`.
The cell↔dot aid is **not** part of this change — that is a separate
follow-up once Galaxies is TS.

## What Changes

- **Port Galaxies to TS** under `src/native/games/galaxies/`
  implementing `Game<GalaxiesParams, GalaxiesState, GalaxiesMove,
  GalaxiesUi, GalaxiesDrawState>`:
  - Params (`w`, `h`, `diff`), the 6 upstream presets (7×7, 10×10,
    15×15 in NORMAL and UNREASONABLE), lenient decode (`"7"`,
    `"7x7"`, `"7x7dn"`, `"7x7du"`), round-trip encode, validation.
  - `newDesc`: dot placement using `random.ts`, structural port of
    the C generator's retry-until-target-difficulty loop, validates
    every produced board by running the TS solver at the requested
    difficulty.
  - Difficulty-graded solver: `solver_obvious`, lines-opposite,
    spaces-oneposs, expand-from-dot, extend-exclaves, and
    bounded-recursion for UNREASONABLE. Returns the deductive
    diagnosis (`DIFF_NORMAL` / `DIFF_UNREASONABLE` /
    `DIFF_AMBIGUOUS` / `DIFF_IMPOSSIBLE`).
  - `newState`/`newUi`/`newDrawState`; immutable `executeMove` for
    every move type (`E` toggle edge, `A`/`a` add associations along
    a drag, `U` remove association with opposite, `M` toggle
    dot-hold, `s` apply solver move-string). EDITOR-only move
    letters (`D`/`d`/`C`/`i`) are out of scope (not part of normal
    play; upstream gates them on `#ifdef EDITOR`).
  - `interpretMove`: pointer press/drag/release for dragging an
    association out from a dot, click to set/clear an edge,
    keyboard cursor moves (UI_UPDATE, no history entry).
  - `status`: completion via `check_complete` (uses DSF to find
    edge-bounded components, validates each component against its
    dot under 180° rotational symmetry).
  - `solve`: invokes the TS solver, returns the resulting move
    string; unsolvable → `{ ok: false, error }`.
  - `textFormat`, `statusbarText` (move count, status, difficulty),
    `colours(defaultBackground)` (9 entries: background, white/black
    bg, white/black dot, grid, edge, arrow, cursor),
    `preferredTileSize`, `computeSize`, `setTileSize`, `redraw`
    (tile fill, dots, edges, association arrows, keyboard cursor —
    the engine emits no pixels of its own per the
    `fix-flip-canvas-reshape` doctrine).
  - `animLength` (dot-move animation when a dot is dragged to a new
    position via `movedot_cb`'s pathfinding), `flashLength` (win
    flash).

- **Lazy idiomatic leaf port**: a `dsf.ts` union-find under
  `src/native/games/galaxies/`, local to Galaxies for now (promote
  to `src/native/engine/` if/when a second game ports and needs it,
  same lazy-promotion stance Flip used for `SortedMultiset`).
  Operations needed: `dsf_new(n)`, `dsf_reinit()`, `dsf_canonify(i)`,
  `dsf_merge(a, b)` — that's it. Path-compression + union-by-size,
  ~20–40 lines, property-tested against a brute-force reference.

- **`registerGame(galaxiesGame)`** from the Galaxies module; the
  module is imported in the worker so registration runs there.

- **Per-game hybrid catalog**: `puzzle(galaxies TS_PORTED …)` in
  `puzzles/CMakeLists.txt`; `puzzles/galaxies.c` deleted (per-game
  C deletion under `ts-migration`).

- **Dev-time differential spot-check** (advisory, not a gate):
  - A native trace target `puzzles/auxiliary/galaxies-trace.c`
    (transient; `#include`s `galaxies.c` to access static helpers;
    built via `scripts/build-native.sh galaxies-trace`, used, then
    removed in the same change that deletes `galaxies.c` —
    documented as transient in the file header).
  - The durable advisory live check `scripts/diff-galaxies.test.ts`
    + `scripts/diff-galaxies.vitest.config.mts` (outside `src/`, so
    the default gate's vitest never collects it). And a gated,
    C-free frozen form: `src/native/games/galaxies/__fixtures__/
    galaxies-c-reference.json` + `galaxies-differential.test.ts`
    asserting "every C-built reference board has a unique TS-solver
    solution at the target difficulty" — the real bar, since the
    idiomatic generator is allowed to diverge from C's byte
    sequence.

- **Behavioural + property tests** for the Galaxies port and the
  DSF helper (see tasks.md).

- **Docs**: `AGENTS.md` "What's been done" entry; migration-order
  item 3 marked landed.

## Impact

- **Affected specs**: new `galaxies` capability. No `ts-engine`
  changes are anticipated — the contract was finalized by Flip and
  the post-Flip doctrine fixes; if Galaxies' drag interaction or
  animation surfaces a real gap during implementation, that becomes
  a separate scoped engine delta on this change rather than a
  silent contract drift.

- **Affected code**:
  - `src/native/games/galaxies/*` (new): `index.ts`, `dsf.ts`,
    `solver.ts`, `generator.ts`, `render.ts` (split is an
    implementation choice; flat single-file is acceptable if
    cleaner — design.md picks).
  - `src/native/games/galaxies/__fixtures__/galaxies-c-reference.json`
    (committed snapshot for the gated differential check).
  - `puzzles/CMakeLists.txt` (`TS_PORTED` on `galaxies`).
  - `puzzles/galaxies.c` (deleted, after parity).
  - `puzzles/auxiliary/galaxies-trace.c` (transient, used then
    removed in same change).
  - `scripts/diff-galaxies.test.ts`,
    `scripts/diff-galaxies.vitest.config.mts` (new advisory).
  - `AGENTS.md` (status entry).

- **Runtime**: Galaxies flips from C/WASM to TS once parity-verified;
  all other games unchanged. If parity is not reached in this
  change, Galaxies stays unregistered and on C/WASM — per
  `add-parity-gated-registration`, registration + C deletion are
  the very last steps, gated on owner acceptance.
