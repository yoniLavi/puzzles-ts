# Proposal: Port Filling (Fillomino) to native TypeScript

**Status**: Proposed

## Why

Filling (the Nikoli puzzle *Fillomino*) is port #17 — the simplest-first next
game. It is a clean grid-deduction puzzle: fill every cell with a number `n`
such that each maximal orthogonally-connected region of equal numbers has size
exactly `n`. It has **no long-tail-risk entanglements** (no
`midend_supersede_game_desc`, no undo-by-state-equality — completion and no-op
suppression are locally decidable, no `#ifdef EDITOR` input letters), a real but
self-contained four-technique deductive solver, a genuine uniqueness-driven
generator (region partition → minimal-clue reduction validated by the solver),
and straightforward number-grid rendering (digits + region-boundary lines +
selection/cursor/error highlights). It uniquely determines its solution, making
it a natural `findMistakes` carrier and a strong future `hint()` candidate.

## What Changes

- **New `src/native/games/filling/` port** implementing
  `Game<FillingParams, FillingState, FillingMove, FillingUi, FillingDrawState>`:
  - `state.ts` — `{ w, h }` params, the run-length desc codec (lowercase = empty
    run, digit = clue), immutable `clues` (shared by reference) + mutable player
    `board`, the multi-cell `set` move + `solve` move, completion check
    (every cell's value equals its region size).
  - `solver.ts` — the four confluent deductions ported from `unruly_solve`'s
    cousin in `filling.c`: blocked-expansion (a region with one legal growth
    cell), expand-or-one (force a capacity-critical neighbour, or drop a `1`
    into an isolated cell), critical-square (a distant cell a region must reach
    to attain its size), and the bitmap deduction (per-cell possible-number
    bitmap, including ghost-region inference). Returns the unique solution.
  - `generator.ts` — `make_board` (shuffled DSF region partition with conflict
    merging + size-1 absorption) then `minimize_clue_set` (remove whole ghost
    regions, then individual clues, each kept only if the solver still solves).
  - `render.ts` — palette mirroring the C colour enum, region-border computation
    (a border between differing cells when both are filled or either region is
    complete/overfull), `Int32Array` packed per-cell cache, completion flash,
    and the live error overlay (a region whose size exceeds its number, or a
    boxed-in incomplete region that can never reach its size).
  - `index.ts` — `Game` glue: selection-based `interpretMove` (left-click /
    drag builds a selection, a digit key fills the selection or the cursor
    cell), `executeMove`, `solve` (re-derive via the solver), `findMistakes`,
    `registerGame`.
- **`findMistakes` (Check & Save).** Filling re-solves from its immutable clues
  to the unique solution and flags every player-filled cell whose number
  contradicts it, so the shipped Check & Save control hard-blocks a wrong board
  (a solvable game without this silently saves mistakes — the gap the playbook
  calls out and Unruly hit on owner smoke-test).
- **Differential.** Filling earns a gated byte-match differential
  (`filling-differential.test.ts` vs a frozen C trace): `random.ts` is
  bit-identical, so a faithful `make_board` + `minimize_clue_set` reproduces the
  C desc exactly for the same seed. A live `scripts/diff-filling.test.ts` backs
  it while `filling.c` exists.
- **Stage-1 registration only.** Add `filling` to `ts-ported-ids.ts` and import
  it in `games/index.ts` so the TS impl serves it for owner smoke-testing. The
  `TS_PORTED` flag + `puzzles/filling.c` deletion happen **only on owner
  acceptance**, per the two-stage parity gate.

## Impact

- **Affected specs:** new `filling` capability (ADDED requirements: Game
  interface, desc codec, generator, solver, fill moves + selection, error/flash
  rendering, mistake-checking).
- **Affected code:** new `src/native/games/filling/*`; one line each in
  `ts-ported-ids.ts` and `games/index.ts`; `puzzles/auxiliary/filling-trace.c`
  + its `cliprogram()` line (deleted with `filling.c` at acceptance). No change
  to `filling.c` until owner acceptance (stage 2).

## Out of scope

- An explained `hint()` is a **separate** change (the deductive solver makes it a
  strong candidate at the Palisade quality bar — narrate *why* each cell is
  forced — but per the hint-authoring guide that is its own change).
- Printing (`game_print`) — no TS replacement fork-wide; out of scope for every
  port so far.
