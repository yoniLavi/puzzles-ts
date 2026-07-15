## Context

Tracks is unblocked (its leaves `dsf`/`findloop` are already shared engine
helpers) and solver-gated, so the interesting decisions are (a) how faithfully
the byte-match differential can be held, (b) the idiomatic move model, and (c)
the shared-edge state representation. Long-tail-risk check against `tracks.c`:
no `midend_supersede_game_desc`, no `#ifdef EDITOR` move letters, no
`game_request_keys` (no keypad), no `qsort` anywhere near the desc. The web
build defines `NARROW_BORDERS` (so the render border is 0).

## Goals / Non-Goals

- Goals: full behavioural parity (input, live errors, render, flash); a
  byte-match generator/solver differential; `findMistakes` for Check & Save.
- Non-Goals: an explained hint (a strong future candidate — a separate
  `add-tracks-hint` change); printing.

## Decisions

- **D1 — Byte-match differential is feasible and is the bar.** The generator
  is solver-gated (`add_clues` lays clues until the board is soluble at exactly
  the target difficulty, then strips redundant ones, re-running `tracks_solve`
  on each candidate) and draws only through `shuffle`/`random_upto` — there is
  no `qsort` feeding the desc. Over the bit-identical `random.ts`, a faithful
  solver+generator reproduces the C desc byte-for-byte. This demands the TS
  solver reach C's exact verdict on every intermediate board, including the
  Hard rungs. The gated differential asserts both the byte-match desc and
  TS-solver-grades-at-recorded-difficulty (§4.4).

- **D2 — Solver order fidelity.** Two order-sensitive spots must mirror C
  exactly or the desc diverges: (a) `solve_check_bridge_parity` computes
  `findLoops` once, then processes candidate edges in `x`-outer/`y`-inner order
  with **D before R**, and each `solve_bridge_sub` rebuilds its parity `Dsf`
  from the *current* (already-mutated) edge state — so an edge set earlier in
  the pass is visible later; (b) `solve_check_loop` builds its connectivity
  `Dsf` merging right-then-down in `x`-outer/`y`-inner order and branches on the
  canonical-root identity of the entrance/exit classes (`startc`/`endc`). The
  shared `Dsf` already matches `dsf.c`'s union-by-size tie-break (second arg
  wins), so merging in C's order yields C's roots — byte-match safe.

- **D3 — Idiomatic move model: an op list, not a string diff.** Upstream's
  move is a `;`-separated string of edge/square flag deltas (`TR`, `nS`, …).
  The port models a move as `{ ops: TracksOp[]; solve?: boolean }` where each op
  is a discriminated `{ kind: "square" | "edge"; … flag: "track" | "notrack";
  set: boolean }`. `interpretMove` builds the op list (a drag → the square
  toggles `copyAndApplyDrag` produces; a click → one square or edge op; solve →
  the full before→after diff). `executeMove` applies ops sequentially against
  the flip guard (`ui_can_flip_square/edge`), skipping the guard for a solve —
  faithful to `execute_move`'s `move_is_solve` branch. A move that changes
  nothing yields an empty op list, and `interpretMove` returns `null` for it
  (local no-op suppression — no state-string undo, per the struck long-tail
  risk).

- **D4 — `findMistakes` re-solves to the unique solution.** Boards are uniquely
  solvable, so `findMistakes` runs `tracksSolve` from the clues to the full
  solution and returns every player mark that contradicts it: a square set
  `S_TRACK` where the solution has no track (or `S_NOTRACK` where it does), and
  an edge set `E_TRACK`/`E_NOTRACK` opposite to the solution. This is distinct
  from the always-on live error overlay (`check_completion`, D5) — Check & Save
  needs a *wrong-vs-the-answer* check, not "is the current board internally
  inconsistent". Renders with the fork's red mistake styling, carried in the
  render diff key (an `OverlaySidecar`, since the packed tile word is already
  near-full).

- **D5 — Live errors ported faithfully and drawn always.** `check_completion`
  with marking is ported verbatim (>2-edge cells, `findLoops` loop cells,
  off-path track once an A→B path exists, and row/column count errors), setting
  `S_ERROR` per cell and `num_errors` per clue. This is the upstream red
  overlay the player sees during play, orthogonal to `findMistakes`.

- **D6 — Shared-edge state.** Each cell stores its own U/D/L/R track and
  no-track edge bits (upstream packs them into one `unsigned`); setting an edge
  mirrors the bit onto the adjacent cell (`S_E_SET`), so the two representations
  never disagree. The port keeps a `Uint8Array` of per-cell edge-track and
  edge-notrack nibbles plus the per-cell square flags, cloned per move; the
  `numbers`/station data is immutable and shared by reference.

- **D7 — Drag-preview render in a shared `moves.ts`.** `game_redraw` reflects an
  in-progress drag by building the dragged state (`copy_and_apply_drag`) and
  drawing both the committed and dragged flags per tile (blue `COL_DRAGON` for a
  newly-set bit, light-blue `COL_DRAGOFF` for a cleared one). Putting
  `copyAndApplyDrag`/`executeMove`/the flip predicates in `moves.ts` lets both
  `render.ts` and `index.ts` import them without a cycle (playbook §3.2).

- **D8 — Params, geometry, touch.** Params add a boolean `single_ones`
  (upstream "Disallow consecutive 1 clues", default true) encoded as the `o`
  suffix (present ⇒ `single_ones=false`). `describeParams` emits `width`,
  `height`, `difficulty` (index) and `disallow-consecutive-1-clues` (the
  boolean) to match the `augmentation.ts` template. `newDesc` falls back 4×4
  Tricky/Hard → Easy (upstream can't generate those). Render uses the
  `NARROW_BORDERS` variant (border 0, a one-tile margin for clues and the A/B
  labels). Tracks genuinely uses the right button (no-track), so it keeps the
  per-button drag; the midend strips `MOD_STYLUS`, and a touch long-press
  legitimately becomes a right-button no-track drag.

- **D9 — Drag drift keeps its extent (owner-requested divergence, 2026-07-15).**
  Upstream `update_ui_drag` resets the paint to the start cell and drops
  `dragging` the moment the pointer is on neither the start row nor the start
  column — so a stray touch excursion off the grid throws the whole gesture
  away. The port instead freezes the last valid extent on that off-axis /
  out-of-bounds case (the `else` branch is a no-op), so the paint survives a
  wander and resumes on return to the start row/column; cancelling now means
  dragging back to the start cell (or painting then undoing).

## Risks / Trade-offs

- The Hard bridge-parity solver is the most intricate rung; a subtle
  divergence would surface as a desc byte-mismatch on a Hard fixture. Mitigated
  by pinning the differential across all three difficulties and by porting the
  edge-processing order (D2) verbatim.

## Migration Plan

Two-stage parity gate (playbook §6): register for smoke-testing when the suite
is green; flip `TS_PORTED` + delete the C only on owner acceptance.

## Open Questions

- None blocking. An explained hint is deferred to a separate change.
