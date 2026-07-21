# add-sticks-ts-port

## Why

**Sticks (Tatebo-Yokobo) is a Nikoli line-drawing logic puzzle** bundled in
`puzzles/unreleased/` and already shipping as a C/WASM catalog game: fill every
white cell with a horizontal or vertical line so that each numbered line has the
stated length and each numbered black cell touches the stated count of lines. It
is a **genuine deductive puzzle with a unique solution** — the generator gates
generation on a contradiction-based solver and minimises clues while keeping the
solution unique.

Porting it now continues the plan to move the 13 `unreleased/` third-party games
to native TS and retire the C runtime. Sticks is small (~1,576 lines),
self-contained (its only leaf dependency, `dsf`, is already ported), and its
solver-gated generator yields a **byte-match differential** that validates
generator, solver and codec together. As a uniquely-solvable logic game it
carries the `findMistakes` obligation and is a natural later candidate for an
explained hint (a separate change).

## What Changes

- **`src/native/games/sticks/`** — the game, following the established multi-file
  port shape (`state` / `solver` / `generator` / `render` / `index`).
- **The desc codec** — the run-length blank encoding (lowercase `a`–`z` runs,
  `_` separators, `B` for black cells, inline decimal clue numbers), ported as an
  exact inverse of the generator's encoder (byte-match surface).
- **The contradiction solver** — port `sticks_solve_game`: repeatedly place a
  trial line in a blank cell and, if it makes the board provably invalid, deduce
  the opposite line; iterate to a fixpoint. Reuses the shared `engine/dsf.ts`.
- **The generator** — symmetric black placement, random line fill, clue
  assignment, solve-gated retry, then greedy clue minimisation — ported faithfully
  over `random.ts` so the desc reproduces byte-for-byte.
- **Input** — drag horizontally/vertically to draw a line, left-click for a
  vertical line, right-click for a horizontal line, and a keyboard cursor
  (arrows + Enter/Space/0/1/2/backspace), modelled as a discriminated-union move.
- **`findMistakes`** — Sticks is uniquely solvable, so it SHALL ship
  `findMistakes` (§3.5): re-solve from the fixed clues and flag every player line
  that contradicts the unique solution. Check & Save depends on it.
- **A byte-match differential** against a new `puzzles/auxiliary/sticks-trace.c`.
- **Stage 2, on owner acceptance**: add `TS_PORTED` to the `puzzle(sticks …)`
  entry in `puzzles/unreleased/CMakeLists.txt`, drop its `solver(sticks …)` line,
  delete `puzzles/unreleased/sticks.c`, and rebuild.

Explicitly **not** in this change:

- **An explained hint** — Sticks is deductive and is a strong hint candidate, but
  an explained `hint()` is always its own change (Palisade-grade bar), sequenced
  after the base port lands.

## Impact

- Affected specs: new `sticks` capability.
- Affected code: new `src/native/games/sticks/`, registration in
  `ts-ported-ids.ts` + `games/index.ts`, new `puzzles/auxiliary/sticks-trace.c`.
- Stage 2 flips Sticks to `TS_PORTED` and deletes `puzzles/unreleased/sticks.c`;
  until then the C/WASM build remains the fallback.
- No icon work: `src/assets/icons/sticks-{64,128}d8.png` already exist, so the
  `puzzle-icons` obligation is already met.
