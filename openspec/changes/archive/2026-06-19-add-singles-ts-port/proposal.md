# Proposal: Port Singles (Hitori) to native TypeScript

**Status**: Proposed

## Why

Singles (the Nikoli puzzle *Hitori*, "let me alone") is port #18 — the simplest
remaining game (singles.c is ~2074 lines, clean). You blacken cells so that no
number repeats among the remaining (white) cells of any row or column, no two
black cells are orthogonally adjacent, and the white cells stay one connected
region. It has **no long-tail-risk entanglements**: no
`midend_supersede_game_desc`, no undo-by-state-equality (every cell click
produces a definite toggle, completion is locally decidable), no `#ifdef EDITOR`
input letters. It carries a real two-difficulty deductive solver (Easy/Tricky),
a genuine uniqueness-driven generator (Latin rectangle → random blacks laid with
solver assistance → numbers under blacks chosen to keep the solution unique →
difficulty-gated retry), and straightforward number-grid rendering (black/white
tiles, circled whites, optional numbers-on-black, error highlights, completion
flash). It uniquely determines its solution, making it a natural `findMistakes`
(Check & Save) carrier and a strong future `hint()` candidate.

## What Changes

- **New `src/native/games/singles/` port** implementing
  `Game<SinglesParams, SinglesState, SinglesMove, SinglesUi, SinglesDrawState,
  SinglesMistake>`:
  - `state.ts` — `{ w, h, diff }` params (diff = Easy | Tricky), the
    fixed-length desc codec (`n2c`/`c2n`: digit/letter per cell number), an
    immutable `nums` typed array (shared by reference) + a mutable `flags` typed
    array (`F_BLACK | F_CIRCLE | F_ERROR`), `completed`/`usedSolve`/`impossible`,
    the multi-cell `set` move (black/circle/empty) + `solve` move, `cloneState`,
    and `textFormat`.
  - `solver.ts` — the op-queue engine (`solver_op_circle`/`blacken` +
    `solver_ops_do` cascade) and every deduction: `singlesep`, `doubles`,
    `corners`, `offsetpair` (Tricky only), `allblackbutone`, `removesplits`
    (Tricky only, contiguity via a flood fill), and `sneaky` (the
    generation-artefact step used only to grade "too easy"). `checkComplete`
    (black-adjacency + per-row/col duplicates + single white region via the
    shared `Dsf`). `solveSpecific(diff, sneaky) → solved | stuck | impossible`.
  - `generator.ts` — `matchingWithScratch` (Hopcroft–Karp bipartite matching,
    RNG-faithful), `latinGenerate`/`latinGenerateRect`, then `newSinglesDesc`:
    Latin rectangle, random black placement using bits of the solver, numbers
    re-laid under blacks via `bestBlackCol`, and the `newGameIsGood`
    difficulty-gate retry loop (`MAXTRIES` re-randomise, else regenerate).
  - `render.ts` — palette mirroring the C colour enum (`COL_BACKGROUND`,
    `COL_LOWLIGHT`, `COL_BLACK`, `COL_WHITE`, `COL_BLACKNUM`, `COL_GRID`,
    `COL_CURSOR`, `COL_ERROR`), `computeSize`/`setTileSize`, the per-tile
    `Int32Array` packed cache, `tile_redraw` (black/white fill, circled white,
    number — always for white, optional on black via the preference —, cursor
    corners, error colour, impossible-grid outline), and the completion flash.
  - `index.ts` — `Game` glue: `interpretMove` (left-click toggles black,
    right-click toggles circle, a set cell clicks back to empty, off-grid click
    toggles the show-black-numbers preference, keyboard cursor with
    select/select2), `executeMove`, `status`, `solve`, `findMistakes`, the
    `prefs` hook for show-black-numbers, `registerGame`.
- **`findMistakes` (Check & Save).** Singles re-solves from its immutable `nums`
  to the unique solution (`solveSpecific(DIFF_ANY)`) and flags every player cell
  whose black/white choice contradicts it, so the shipped Check & Save control
  hard-blocks a wrong board (a solvable game without this silently saves
  mistakes — the gap the playbook calls out and Unruly hit on owner smoke-test).
- **Differential.** Singles earns a gated byte-match differential
  (`singles-differential.test.ts` vs a frozen C trace): `random.ts` is
  bit-identical and the whole generation path (matching → Latin → blacks →
  numbers → difficulty gate) is RNG-faithful, so a faithful port reproduces the
  C desc exactly for the same seed. A live `scripts/diff-singles.test.ts` backs
  it while `singles.c` exists (deleted with the C at acceptance).
- **Stage-1 registration only.** Add `singles` to `ts-ported-ids.ts` and import
  it in `games/index.ts` so the TS impl serves it for owner smoke-testing. The
  `TS_PORTED` flag + `puzzles/singles.c` deletion happen **only on owner
  acceptance**, per the two-stage parity gate.

## Impact

- **Affected specs:** new `singles` capability (ADDED requirements: Game
  interface, desc codec, generator, solver, toggle moves + cursor,
  black/white/circle/error/flash rendering, show-black-numbers preference,
  mistake-checking).
- **Affected code:** new `src/native/games/singles/*`; one line each in
  `ts-ported-ids.ts` and `games/index.ts`; `puzzles/auxiliary/singles-trace.c`
  + its `cliprogram()` line (deleted with `singles.c` at acceptance). No change
  to `singles.c` until owner acceptance (stage 2).

## Out of scope

- An explained `hint()` is a **separate** change (the deductive solver makes it
  a strong candidate at the Palisade quality bar — narrate *why* each cell is
  forced — but per the hint-authoring guide that is its own change).
- Printing (`game_print`) — no TS replacement fork-wide; out of scope for every
  port so far.
