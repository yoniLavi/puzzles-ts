# Proposal: Port Range to TypeScript

**Status**: Proposed

## Context

Thirteen games are TS-ported and owner-accepted (Flip, Galaxies, Pegs,
Sixteen, Cube, Fifteen, Flood, Twiddle, Guess, Samegame, Blackbox, Mosaic,
Palisade). Migration-order item 7 ("outward, simplest-first") is the active
phase. **Range** (Nikoli's Kurodoko / Kuromasu) is the next genuinely-simplest
port.

## Why Range

- **Smallest-tier remaining, lowest rendering risk** (`range.c` ~1899 lines,
  tied-smallest with netslide ~1893). Its `game_redraw` is **29 lines** of
  squares / centred clue numbers / white dots — versus netslide's 206 lines
  of Net-style wire / powered-flow / rotation rendering over a game whose
  visual model we have not ported. Rendering is where this fork's parity pain
  has historically lived (the Flip saga); Range minimises it.
- **All dependencies are already ported.** `range.c` needs only `puzzles.h`,
  `random_*` (TS), `dsf` (`src/native/engine/dsf.ts`), `game_mkhighlight`
  (`src/native/engine/colour-mkhighlight.ts`), and `shuffle`
  (`src/native/engine/shuffle.ts`). Nothing new to extract.
- **Params are exactly `w`/`h`.** The worker adapter's generic
  `{ width, height }` base already produces the type summary, so no
  `describeParams` and no `worker-adapter` branch are needed.
- **The substance is one self-contained deductive solver** (four reasoning
  rules — not-too-big run-length arithmetic, black-adjacency, white
  connectedness via biconnected-component cut vertices, and recursion) reused
  three ways: the Solve command (full recursion), generation feasibility
  (no recursion), and `findMistakes`. It ports cleanly to idiomatic TS with
  behavioural tests standing in for a corpus.
- **It carries Check & Save cheaply.** Re-solving the initial clues yields the
  unique black/white solution; `findMistakes()` flags any player-marked cell
  that contradicts it — ~20 lines on top of the Solve path, matching the
  owner's expectation that most games carry hint and/or check-&-save.

## Scope

- Port `puzzles/range.c` to `src/native/games/range/`:
  - **`state.ts`** — `RangeParams` (`w`, `h`) with the 4 upstream presets
    (9×6, 12×8, 13×9, 16×11), `WxH` params codec, `validateParams` (min sizes
    + the upstream small-grid exclusions 1×1/1×2/2×1/2×2, `w+h` overflow); the
    run-length desc codec (digit = clue, letter `a`-`z` = run of 1-26 blanks,
    `_` separator); `newState` parsing the desc into an `Int8Array` grid
    (clue > 0, `BLACK = -2`, `WHITE = -1`, `EMPTY = 0`); cell-value
    constants; `cloneState`; `status`; `textFormat`.
  - **`solver.ts`** — `runLength`, the four `reasoning` rules
    (`notTooBig`, `adjacency`, `connectedness` via DFS lowpoint cut-vertex
    detection, `recursion`), `doSolve` (fixpoint over the rules up to a
    difficulty), `solveInternal`, and the generator (`chooseBlackSquares`,
    `computeClues`, `stripClues` with two-way rotational symmetry, `newDesc`).
  - **`render.ts`** — `colours` (`mkhighlight` background/lowlight, black grid,
    red error), `computeSize` (border = ts/2), `setTileSize`, `newDrawState`
    (per-cell `Int32Array` cache, the documented no-BigInt pattern), `redraw`
    (per-cell diffed `drawCell`: grid outline, black/error/cursor/flash fill,
    inset red error outline, centred white dot, clue number; **live error
    highlighting via `findErrors`**, which is upstream behaviour — Range
    colours rule-violating cells red as you play), `flashLength` (0.7s on
    transition to solved, suppressed when cheated).
  - **`index.ts`** — the `Game` object: `interpretMove` (left/select cycles
    empty→black→white→empty, right/select2 cycles empty→white→black→empty;
    keyboard cursor; shift+cursor white-dots a run; clue cells inert), the
    `RangeMove` discriminated move (a list of cell-sets plus an optional
    solve flag), `executeMove` (apply sets, then `wasSolved = !findErrors`),
    `findErrors` (black-adjacency + clue run-length + white-connectedness via
    `dsf`, the shared solved-check and live-error source), `solve`,
    `findMistakes` (cells contradicting the re-solved unique solution),
    `status`, `flashLength`, `colours`/`redraw` wiring.
- Behavioural tests (params/desc codecs, generator validity + unique
  no-recursion solvability, each solver rule + recursion, move execution and
  cycle order, solved-detection, `findErrors`/`findMistakes`) and a
  tier-2.5 render-scenario snapshot test.
- Register in the TS registry (`src/native/games/index.ts` barrel) and add
  `range` to `TS_PORTED_PUZZLE_IDS`.
- On **owner-accepted** parity (rendering + input, not a green suite alone):
  add `TS_PORTED` to the CMake catalog and delete `puzzles/range.c`. Until
  then, `range.c` stays and the C build remains the fallback.

## Out of scope

- **No `hint()`.** Range's upstream `'h'` key returns a single next deduced
  move with no explanation. The fork's hint quality bar (the Palisade
  exemplar) requires narrating *why* a move is forced — which means surfacing
  which of the four reasoning rules fired and its premises. That is real
  design work; deferred as a natural follow-up (Mosaic precedent), not wired
  as a bare one-step hint.
- **No byte-identical board corpus.** Generation reuses bit-identical
  `random.ts`, but the port does not promise byte-for-byte board parity with
  C for a given seed; boards are validated as uniquely solvable without
  recursion and rotationally symmetric. Differential check is
  advisory/deferred (Cube/Fifteen/Blackbox/Mosaic precedent).
- **No print support** (deleted at fork; a cross-game concern).
- **No `swap_buttons` preference.** Upstream exposes a left/right mouse-button
  preference; the fork's preferences surface is not wired for TS games, so
  the default (left fills, right dots) is used, consistent with the other
  ports.

## Impact

- **Affected specs:** new `range` capability.
- **Affected code:** new `src/native/games/range/`; one import line in
  `src/native/games/index.ts`; one entry in `ts-ported-ids.ts`; (on owner
  acceptance) `TS_PORTED` in `puzzles/CMakeLists.txt` and deletion of
  `puzzles/range.c`.
