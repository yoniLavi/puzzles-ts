# add-crossing-ts-port

## Why

**Crossing (Nansuke / Number Skeleton) is one of the 13 third-party puzzles
bundled from x-sheep's `puzzles-unreleased`, and it is a genuine logic puzzle
with a unique, purely-deducible solution.** You are given a walled grid and a
list of numbers; fill every open cell with a digit so each listed number appears
exactly once across the grid's horizontal and vertical runs. The C ships a
finished frontend, a constraint-propagation solver, and a solver-gated generator.

It is a natural port now. Every Tatham game is TS; the unreleased set is the
remaining catalog work. Crossing is small (~2,040 lines), self-contained (its
only leaf dependency, `dsf`, is already ported), and — being uniquely solvable —
lands the fork's mistake-checking value (`findMistakes`) and sets up a later
explained hint. Its icons already exist, and it already sits in the catalog as a
C/WASM game, so porting it swaps the engine under an existing puzzle rather than
adding one.

## What Changes

- **`src/native/games/crossing/`** — the game in the established multi-file port
  shape (`state` / `solver` / `generator` / `render` / `index`).
- **The desc codec** — the run-length wall encoding (letters `a`–`z` for wall
  runs, decimals for open runs) joined with a `,`-separated number list, ported
  as an exact inverse pair; `validateDesc` reproduces upstream's checks (and its
  documented gaps — design D1).
- **The deductive solver** — constraint propagation over the grid's runs
  (per-position candidate intersection across fitting numbers, then naked-single
  confirmation), returning a discriminated `valid` / `invalid` / `progress`
  status. It is a full unique-solution solver; the generator gates on it, and
  `solve()` / `findMistakes()` reuse it (design D2).
- **The solver-gated generator** — shuffle-driven wall growth (2×2-pool +
  connectivity constraints via the shared `Dsf`), a random digit fill, run
  extraction into the number list, retry-until-uniquely-solvable — byte-match
  portable over `random.ts` (design D4).
- **`findMistakes`** — crossing has a unique solution, so it ships the hook
  (re-solve, flag any placed digit or note that contradicts the solution), which
  Check & Save depends on (design D3). The live full-run-matches-no-number
  error highlight is retained as faithful display.
- **Solo-style input** — a discriminated-union move (`set` / `pencil` / `solve`),
  ink/pencil cell selection by click and keyboard, arrow-key cursor, pencil
  marks, and the on-screen digit keypad restored via `requestKeys` (design D5).
- **Rendering** — bevelled wall/number tiles with per-digit colours, pencil
  marks, run-error rectangles, the done-state-coloured number-list panel below
  the grid, and the completion flash. Display code, not byte-parity; the fork may
  improve the number-list fit that upstream's Status section calls a "severe
  problem" (design D9).
- **A byte-match differential** against a new `puzzles/auxiliary/crossing-trace.c`,
  asserting the TS `newDesc` reproduces the C desc for each preset, a size sweep,
  and the symmetric-walls variant — validating generator, solver and codec at
  once (design D7).
- **Registration** in `ts-ported-ids.ts` + `games/index.ts` (stage 1); the
  C/WASM build remains as the fallback until stage 2.
- **Stage 2, on owner acceptance**: add `TS_PORTED` to `puzzle(crossing …)` in
  `puzzles/unreleased/CMakeLists.txt` (dropping `solver(crossing dsf.c)`), delete
  `puzzles/unreleased/crossing.c`, and rebuild.

Explicitly **not** in this change:

- **An explained hint** — a separate change, per every prior port. Crossing's
  deductive solver makes it a strong candidate, but the hint is authored apart
  from the base port.

## Impact

- Affected specs: new `crossing` capability.
- Affected code: new `src/native/games/crossing/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/crossing-trace.c`.
- Stage 2 flips `puzzle(crossing …)` to `TS_PORTED` and deletes
  `puzzles/unreleased/crossing.c`.
- No icon work: `src/assets/icons/crossing-{64,128}d8.png` already exist, and the
  `augmentation.ts` `crossing` summary
  (`{width}x{height}{symmetric-walls:|, symmetric}`) already exists, so those
  obligations are met — `describeParams` need only emit the keys it reads.
