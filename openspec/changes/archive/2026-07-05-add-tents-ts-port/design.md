# Design — add-tents-ts-port

## Context

Tents (`tents.c`, ~2770 lines) places tents next to trees so that (a) each
row/column tent count matches its edge clue, (b) no two tents are even
diagonally adjacent, and (c) the trees and tents admit a one-to-one adjacency
matching (each tree paired with an orthogonally adjacent tent). Trees are
fixed givens; the player marks squares tent / non-tent / blank.

Closest ported exemplar: **Slant** (recent, self-contained, live error
highlighting via a shared leaf, `findMistakes`, edge/vertex rendering,
byte-match differential). This port mirrors its file layout and the packed
`Int32Array` render cache.

## Long-tail risk clearance

- **`midend_supersede_game_desc`**: not used (`set_public_desc` is NULL). ✓
- **Undo via state-string equality**: not used — moves are explicit
  cell edits; `interpretMove` returns `null`/`UI_UPDATE`/a move. ✓
- **`#ifdef EDITOR` move letters**: none. ✓
- **`printing.c`**: upstream has a print path; we do not port printing
  (documented fork stance). ✓

## Decisions

### D1 — Reuse the shared `matching`, make `rs` optional

`tents.c` uses `matching.c` in two places: the generator
(`matching(ntrees, nr, …, rs, NULL, outr)` — RNG-perturbed, wants the
right→left assignment) and the completion check
(`matching(m, m, …, NULL, NULL, NULL)` — no RNG, wants only the edge count).
`engine/latin.ts` already ports the same `matching.c` RNG-faithfully but
requires `rs` and returns only the left→right array (`LtoR`).

- **Make `rs` optional**, guarding both draw sites (`shuffle(Lorder)` and the
  in-place `random_upto` adjacency swap) exactly as `matching.c`'s `if (rs)`.
  Backward-compatible: every current caller passes `rs`.
- **Derive `outr` and the edge count from `LtoR`** rather than widening the
  return: `outr[LtoR[L]] = L` for matched `L`, count = matched `L`. This is
  the exact inverse of the returned assignment, so it is byte-identical to
  reading C's `outr`; no change to `matching`'s signature beyond `rs?`.

### D2 — Move representation

Two move kinds, both JSON-save-safe:

- `{ type: "cells"; cells: {x,y,v}[] }` — a batch of player cell edits
  (`v` ∈ {BLANK, TENT, NONTENT}, never TREE), the analogue of upstream's
  `B`/`T`/`N` compound. A single click is a one-element batch; a right-drag
  is a multi-cell batch. This matches upstream building one move string per
  gesture.
- `{ type: "solve"; tents: number[] }` — the solution as the list of tent
  cell indices (upstream's `S;T…` compound). `executeMove` sets every
  non-tree cell to NONTENT then those indices to TENT.

### D3 — Errors live in render, not state

Upstream computes `find_errors` inside `int_redraw`, over a grid that has the
*current drag's start cell* transformed in (so a click's error feedback is
instant but a right-drag doesn't flicker). Because this depends on transient
`ui` drag fields, it is a render-time computation, not part of persisted
state. The state carries only `completed`/`usedSolve`; `redraw` runs
`findErrors(state, drag-transformed grid)` each frame. Every error/overlay is
folded into the packed per-tile cache word, so the diff key covers it (§3.2 of
the playbook).

### D4 — `findMistakes` vs live `find_errors` (both kept)

`find_errors` is upstream's always-on live red highlighting (adjacency
diamonds, over/under-committed clue numbers, over-committed tent/tree groups)
— kept faithfully for parity. `findMistakes` is the fork's Check-&-Save
contract: re-solve the trees + edge numbers to the unique solution
(`tents_solve` at the top difficulty) and flag placed cells that contradict
it. Both coexist (as they do in Undead). A hand-typed non-uniquely-solvable
board yields no mistakes (empty result).

### D5 — Palette index-for-index, mistake overlay appended

`colours()` mirrors the C enum indices 0–8 (BACKGROUND, GRID, GRASS,
TREETRUNK, TREELEAF, TENT, ERROR, ERRTEXT, ERRTRUNK) because
`augmentation.ts` darkens COL_GRASS (index 2) under dark mode. The fork's
`findMistakes` overlay colour is appended at index 9 (`COL_MISTAKE`) so no
dark-mode override touches it. The overlay renders as an inset red outline
(the cross-game mistake styling), distinct from the live error red.

### D6 — Stylus input is N/A

Upstream's `drag_xform` has `MOD_STYLUS` branches (tap cycles through states).
The TS engine's pointer model delivers no `MOD_STYLUS`, so those branches are
unreachable; we port the mouse behaviour faithfully and omit the stylus loop
(documented, like the editor-letters stance). Touch maps to the left button;
`needsRightButton: true` (upstream `REQUIRE_RBUTTON`) surfaces the app's
secondary-action affordance for placing non-tents.

### D7 — Params / config

Params are plain `w`/`h` plus `diff` (Easy/Tricky). `describeParams` returns
`{ width, height, difficulty }` matching the `augmentation.ts` template
`{width}x{height} {difficulty:Easy|Tricky}`; `paramConfig` is
`dimensionParamConfig()` + a difficulty choice. Difficulty affects only
generation, not gameplay.

## Byte-match feasibility

`random.ts` is bit-identical to `random.c`, and the generator's only RNG
draws are `random_upto` (tent placement) and the matching library's internal
`shuffle` + `random_upto` (already RNG-faithful in `engine/latin.ts`). No
`qsort`, no float grid. So a byte-for-byte desc match is feasible (§4.3), the
strong bar; the differential also grades each C board with the TS solver
(§4.4 — the generator is solver-gated, so the TS solver must reach C's
exact verdict on each board).
