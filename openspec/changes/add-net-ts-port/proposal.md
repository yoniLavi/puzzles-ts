# Port Net (net.c) to native TypeScript

## Why

Net is the original of the collection — the wire-rotation puzzle everything else is measured
against — and it is **unblocked, contrary to two long-standing entries in the risk register**
(see below). Netslide, its sliding cousin, shipped last week (2026-07-14), which means the
model-level machinery Net needs (direction algebra, the hex wire desc codec, the
spanning-tree grower over a sorted set, the `compute_active` flood) already exists in TS and
has been through owner acceptance once.

Its two remaining leaf dependencies are both already ported: `findloop.c` →
`engine/findloop.ts` (loop highlighting) and `dsf.c` → `engine/dsf.ts` (the solver's
equivalence classes). `tree234` maps onto `engine/sorted-multiset.ts` — Net is its second
game consumer, which is the promotion trigger its own docstring names.

At **3361 lines** (≈2900 portable, once printing and the dead drag-rotate path are excluded)
it is a substantial port, with the risk concentrated in `net_solver` (~380 lines) and
`perturb` (~287) — the uniqueness machinery.

## Two risk-register entries this change corrects

Both were verified against the C for this proposal (`grep`, cited in `design.md`):

1. **Net does not need the supersede hook.** Already corrected in `AGENTS.md` (2026-07-14),
   restated here because the port depends on it: Net's public desc is the wire grid, fixed at
   generation, and never superseded. `set_public_desc` is `NULL` for Net.
2. **Net does not use "undo via state-string equality".** `net.c` contains **zero**
   `strcmp`/`memcmp`. The risk register names "Net's rotation cycles" as the canonical hard
   case; it is a phantom — **no game in the C tree** compares stringified state for undo (the
   only `memcmp` in the whole tree is config-keyword parsing in `midend.c`). Net suppresses
   no-op moves *locally* in `interpretMove` (out-of-grid, gutter, rotate-on-locked), exactly
   as Galaxies does. This change **removes the false parenthetical** from `AGENTS.md`.

## What Changes

- Add `src/native/games/net/` implementing `Game<NetParams, NetState, NetMove, NetUi,
  NetDrawState>`: a `w × h` grid of wire tiles (a 4-bit R/U/L/D mask) whose solved
  configuration is a spanning tree rooted at a movable source; the player rotates tiles until
  every tile is powered. All upstream presets (the web build excludes the two 13×11
  `SMALL_SCREEN` presets).
- Port the **generator**: spanning-tree growth from the centre over a sorted possibility set
  (cross- and loop-avoiding), the **uniqueness gate** (`net_solver` + `perturb` until the
  board is uniquely solvable — solver-gated, so guess-free by construction when `unique`), the
  shuffle with its loop-elimination inner loop, and post-shuffle barrier placement (after the
  shuffle, so raising the barrier rate on a seed yields a superset — same policy as netslide).
- Port **`net_solver`** (returns inconsistent / ambiguous / unique) over `engine/dsf.ts`, and
  **`perturb`**, and `compute_active` + `compute_loops` over `engine/findloop.ts`.
- Net-specific mechanics: tile **rotation** (left = anticlockwise, right = clockwise, `f` =
  180°), tile **locking** (middle button / `s`), **jumble** (`j` — an RNG on the Ui, seeded
  fresh, expanded into an explicit move list so replay stays deterministic), the movable
  **source** square (Ctrl+arrow), the **origin shift** for wrapping grids (Shift+arrow), and
  barriers. The rotation animation and the source-centred completion flash.
- The **one preference** (`unlocked-loops`, default on) via `Game.prefs`, and `statusbarText`
  (`Active: k/n`).
- **Fresh render** of `draw_tile`/`draw_wires` (~280 lines): Net's modern rotated-polygon wire
  drawing is a *different algorithm* from netslide's 1px offset-line drawing — see the reuse
  analysis in `design.md`. `NARROW_BORDERS` gives Net a **zero** gutter (unlike netslide).
- Extract the **model-level** shared pieces netslide currently holds privately (direction
  algebra, hex desc codec, spanning-tree grower) into a shared home, and promote
  `sorted-multiset` per its own docstring — but **not** a shared renderer (`design.md` says
  why).
- Byte-match differential: transient `puzzles/auxiliary/net-trace.c` → desc + `aux` fixtures;
  a committed gated test asserts `newDesc` reproduces them exactly.
- Register (stage 1). On owner acceptance, flip `TS_PORTED`, delete `puzzles/net.c`, archive
  (stage 2).

## Non-goals

- **No drag-to-rotate.** `USE_DRAGGING` is gated on `STYLUS_BASED`, which the web build does
  not define — half of upstream's `interpret_move` is dead here. Out of scope.
- **No `findMistakes`.** Net is a permutation puzzle: every reachable state can still be
  rotated to the solution, so there is no wrong-but-legal state to flag. Check & Save degrades
  to a plain quick-save (playbook §3.5), as for Netslide/Sixteen.
- **No explained `hint()`** — a separate change. `net_solver`'s deductions make it a Palisade-
  bar candidate.
- No printing (deleted at fork), no text format (upstream has none), no supersede, no editor
  letters.

## Impact

- Affected specs: **new `net` capability**.
- Affected code: `src/native/games/net/` (new); a shared wire module (new) + the netslide
  edits to consume it; `sorted-multiset` promotion; registration; `puzzles/auxiliary/`
  transient trace; `puzzles/CMakeLists.txt` (`TS_PORTED` stage 2); `puzzles/net.c` (deleted
  stage 2).
- Icons: **already committed**. `puzzles/tree234.c` stays (multiple C consumers remain).
- **Netslide is touched** — refactoring its private helpers into the shared module. Its
  accepted render snapshots MUST stay byte-identical; the refactor is behaviour-preserving or
  it does not ship (`design.md` D2).
- Docs: `AGENTS.md` loses the false "Net's rotation cycles" risk parenthetical.
