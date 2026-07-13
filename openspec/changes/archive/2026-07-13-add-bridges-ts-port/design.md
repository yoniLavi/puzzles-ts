## Context

Bridges (`bridges.c`, ~3350 lines) is a mid-large pure-logic port. It reuses two
already-ported leaves (`engine/dsf.ts`, `engine/findloop.ts`) and trips none of
the long-tail risks (§1 of the playbook: no supersede, no editor letters, no
undo-via-state-string, no keypad). This document records the decisions that
aren't obvious from the C.

## Decisions

- **D1 — State shape: island list + flat flag grid, idiomatic typed arrays.**
  Upstream keeps a `grid_type *grid` of `G_*` flags plus five parallel `char`
  arrays (`possv/possh/lines/maxv/maxh`) and an `islands[]` list with a `gridi`
  reverse index. Port the grid + line/possible/max arrays as `Int*Array`s on the
  immutable state (clone = `.slice()`), and the islands as a plain array of
  `{ x, y, count, adj }`. `gridi` becomes a `Int32Array` index (cell → island
  index, −1 if none) rebuilt on clone — it is a pure optimisation (upstream says
  so). Marks/no-lines (`G_MARK*`/`G_NOLINE*`) live in the same grid flags.

- **D2 — Solver difficulty tiers map to `solve_sub`; it is purely deductive (no
  guessing).** Easy runs stage 1 only; Medium adds stage 2; Hard adds stage 3.
  Despite the header comment and the `solve_sub(state, 10, 0)` calls, **there is
  no recursive/guessing branch** — passing difficulty 10 just means "run all
  three stages", and the `depth` parameter is unused (confirmed by the deep C
  read). Keep the C return-code convention (stage functions return a boolean
  "keep going / contradiction"; `solve_sub` returns solved / not-solved via
  `map_check`) as discriminated enums, not magic ints. The generator grades a
  board by `solve_from_scratch` at the target difficulty (must solve) and at
  `difficulty − 1` (must *not* solve, so the board genuinely needs the harder
  tier) — upstream `new_game_desc` retry.

- **D3 — Byte-match differential (§4.3), not solver-agreement-only.** The
  generator's RNG draws are `random_upto` only (initial island `x`,`y`; per-grow
  island index, direction index, two expansion rolls, new-island offset, join
  count) — no `qsort`, no `shuffle` — so a faithful port reproduces the desc
  byte-for-byte over `random.ts`. Assert `newDesc(p, randomNew(seed)).desc ===
  fixture.desc` across all 9 presets + an `allowloops=0` case, plus the
  solver-grades-C-boards check. Reproduce the draw order **exactly**; the deep
  C analysis (agent report) pins the sequence.

- **D4 — `allowloops` default is ON in every preset** (the 6th preset field is
  `1`). So the shipped game *permits* loops; `map_hasloops`'s red-loop marking
  and the solver's loop-avoidance deductions (`solve_island_checkloop`,
  `solve_island_subgroup`) only bite when a custom `allowloops=0` game is played.
  Port them faithfully anyway (the differential includes an `allowloops=0` case).

- **D5 — Live errors vs `findMistakes` are distinct overlays (§3.2 / §3.5).**
  Upstream already draws provably-wrong state red (`island_impossible`,
  `map_hasloops`) via `COL_WARNING` — port that as the always-on live error.
  Layer the fork's `findMistakes` (re-solve to the unique solution, flag
  contradicted player bridges) as a *separate* overlay colour appended past the
  palette, both folded into the render diff key so they repaint/clear on a later
  frame (the Towers `drawnWrong` regression class).

- **D6 — Input: drag model ported faithfully; no editor letters.** `interpret_move`
  is a drag from an island along its row/column to the adjacent island
  (`update_drag_dst` tracks the in-progress destination; `finish_drag` commits),
  left-drag = add/increment bridge (wraps to 0 past `maxb`), right-drag = toggle
  no-line/mark on the span, plus a keyboard cursor with `CURSOR_SELECT`
  grab/drop. The in-progress drag is reflected in `redraw`, so — per playbook
  §3.2 "drag-preview games" — `executeMove` + the drag-commit helper live in a
  small `moves.ts` shared by `index.ts` and `render.ts` to avoid an import cycle
  (adopt only if the cycle actually appears; a single-file `index.ts` is fine if
  the drag preview is computed without calling back into move code).

## Risks / Trade-offs

- **Solver fidelity is the byte-match linchpin** (§4.4): the generator grades via
  the solver, so any divergence in deductive power shifts which boards are kept
  and diverges the desc. Mitigation: the differential-debugging loop (§4.7) —
  dump C `(board, verdict)` during generation, binary-search the first mismatch.
- **`findloop` usage must match** `map_hasloops`'s `bridges_neighbour` traversal
  exactly (which cells count as connected). The shared `findloop.ts` is the same
  Tarjan port Slant uses; verify the neighbour callback semantics.

## Non-Goals

- The explained hint (`solve_for_hint` exists in C, but the narrated hint is a
  separate future change per the playbook). Printing. Editor mode.
