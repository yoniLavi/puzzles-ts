# Tasks: Towers (Skyscrapers) TS port

## 1. Generic Latin solver in engine
- [x] 1.1 `src/native/engine/latin.ts`: `LatinSolver` class (`o`, `cube`
      Uint8Array `o³`, `grid` Int8Array, `row`/`col`), `cubepos` indexing,
      `alloc`(seed from grid)/`place`.
- [x] 1.2 `elim(start, step)` + `diffSimple` (row/col positional + numeric
      elimination); return -1/0/+1 faithfully.
- [x] 1.3 `set(start, step1, step2)` + `diffSet(extreme)` (row/col set elim and
      the extreme single-number variant); scratch owned by the instance.
- [x] 1.4 `forcing()` (BFS forcing chains).
- [x] 1.5 `recurse(...)` + `latinSolverTop`/`latinSolver` entry with the
      `diff_simple/set_0/set_1/forcing/recursive` parameterisation, usersolver +
      validator callbacks, and the `DIFF_IMPOSSIBLE/AMBIGUOUS/UNFINISHED = 10/11/12`
      sentinels.
- [x] 1.6 Promote `matching`/`latinGenerate`/`latinGenerateRect` from
      `singles/generator.ts` into `engine/latin.ts`; re-point Singles' import;
      confirm the Singles differential stays green (byte-identical move).
- [x] 1.7 `latin.test.ts`: solves a uniquely-determined board, reports ambiguity,
      respects the difficulty ceiling; generator byte-match covered by the
      Singles + Towers differentials. (Deductions also exercised byte-for-byte
      by the Towers differential.)

## 2. State, params, codec (`towers/state.ts`)
- [x] 2.1 `TowersParams { w, diff }` (diff Easy/Hard/Extreme/Unreasonable);
      presets 4×4 E, 5×5 E/H, 6×6 E/H/X/U; encode `{w}` / `{w}d{c}`;
      `decodeParams`; `validateParams` (3 ≤ w ≤ 9; diff valid).
- [x] 2.2 Desc codec: `/`-separated `4w` edge clues then optional `,` +
      run-length grid givens; `validateDesc` (clue count + range, grid length);
      `newState` (decode clues + immutable givens into grid).
- [x] 2.3 `TowersState` (immutable shared `clues`/`immutable`; mutable
      `grid`/`pencil`/`cluesDone`; `completed`/`cheated`); `cloneState`.
- [x] 2.4 Clue geometry: `startStep`/`cStartStep`/`cluePos`/`clueIndex`/`isClue`
      pure helpers + unit tests.
- [x] 2.5 `TowersMove` union (`set`/`clueDone`/`pencilAll`/`solve`); `checkErrors`
      (row/col duplicates + clue-visibility violations → error cells); `status`;
      `textFormat`.
- [x] 2.6 `TowersUi` + `newUi` (defaults: `threeD = true`,
      `pencilKeepHighlight = false`, cursor hidden).

## 3. Towers solver (`towers/solver.ts`)
- [x] 3.1 `solverEasy` (the facing-clues-sum, nearly-filled, and lower-bound
      clue heuristics) against `LatinSolver`.
- [x] 3.2 `solverHard` (exhaustive per-clue possibility enumeration ruling out
      cube candidates).
- [x] 3.3 `towersValid` (every clue's visible count matches once the grid is
      full).
- [x] 3.4 `solveTowers(w, clues, soln, maxdiff)` driver wiring the difficulty
      mapping (D3) through `latinSolver`.

## 4. Generator (`towers/generator.ts`)
- [x] 4.1 `newTowersDesc(p, rng)`: `latinGenerate` → derive all `4w` clues →
      small-Easy empty-grid special case → remove givens (shuffled) then clues
      (shuffled, non-Easy) while `solveTowers` still grades `≤ diff` → require
      exact-difficulty (`ret === diff`) else regenerate.
- [x] 4.2 Encode desc (clues `/`-joined, run-length grid) + `aux` solution
      string; return `{ desc, aux }`.

## 5. Rendering (`towers/render.ts`)
- [x] 5.1 Palette index-for-index with the C `COL_*` enum (background, grid,
      user, highlight, error, pencil, done), derived directly from the frontend
      background (Towers does not use `mkhighlight`).
- [x] 5.2 `computeSize`/`setTileSize`/`PREFERRED_TILE_SIZE`; the `(w+2)²` tile
      model + four-corner cache key.
- [x] 5.3 `drawTile`: 3D tower polygons (left/bottom faces + offset top) under
      the `threeD` pref, 2D digit fallback, pencil-mode highlight wedge, box
      outline, the digit (user/immutable/clue/done/error colour), and the
      pencil-mark grid layout.
- [x] 5.4 `redraw`: first-draw bg fill, `checkErrors` overlay, clue cells, the
      neighbour-overlap diffed repaint, completion flash.

## 6. Game glue (`towers/index.ts`)
- [x] 6.1 `interpretMove`: 3D-aware click hit-testing → cell; left/right select +
      pencil-highlight toggling; off-grid clue click → `clueDone`; cursor
      movement (shift/ctrl reaches the border clues); digit/backspace/space entry
      honouring pencil mode + immutability + no-op suppression; `M` → `pencilAll`.
- [x] 6.2 `executeMove` (set/clueDone/pencilAll/solve; completion via
      `checkErrors`); `status`.
- [x] 6.3 `solve` (return `aux` when present, else `solveTowers` at max diff);
      `findMistakes` (re-solve from immutable, flag contradicting player cells).
- [x] 6.4 `prefs` hook: appearance (2D/3D choices) + keep-pencil-highlight
      (boolean); `flashLength`; `animLength = 0`; `colours`/`computeSize`/
      `setTileSize`/`newDrawState`/`redraw` wiring; `registerGame`.

## 7. Tests
- [x] 7.1 Tier-1: params/desc round-trip; clue-geometry helpers; generator emits
      solvable, uniquely-determined, exact-difficulty boards (seeded, generous
      timeout); solver grades known boards; move transitions; completion + flash;
      `findMistakes` flags a wrong digit and ignores pencil marks; Solve through a
      real `Midend` (aux path).
- [x] 7.2 Tier-2.5: `renderScenario` initial frame (3D) + a 2D-pref frame +
      a partially-filled board; targeted op assertions + `toMatchSnapshot`.
- [x] 7.3 Differential: `puzzles/auxiliary/towers-trace.c` + `cliprogram()` line;
      regenerate `__fixtures__/towers-c-reference.json` pure-C; gated
      `towers-differential.test.ts` (byte-match per difficulty + solver
      agreement). No advisory `scripts/diff-towers.test.ts` (trace binary has
      fixed seeds = the fixture → no signal beyond the gated test; see design D9).

## 8. Registration (stage 1) + close-out
- [x] 8.1 Add `towers` to `TS_PORTED_PUZZLE_IDS` and import in `games/index.ts`.
- [x] 8.2 Icons: N/A — Towers is an existing upstream game; its committed
      `towers-{64,128}d8.png` are already present (asset-integrity test green).
- [x] 8.3 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`); update the playbook with anything this port surfaced.

## 9. Owner acceptance (stage 2) — do NOT do before sign-off
- [x] 9.1 Owner smoke-tests the TS path; address parity gaps. (Owner directed the
      stage-2 accept; final acceptance pass to follow this commit.)
- [x] 9.2 Add `TS_PORTED` to towers in `puzzles/CMakeLists.txt` (and dropped the
      `solver(towers latin.c)` line); delete `puzzles/towers.c`,
      `puzzles/auxiliary/towers-trace.c`, and its `cliprogram()` line.
      (No `scripts/diff-towers.test.ts` existed — design D9.)
- [x] 9.3 Rebuild wasm; confirm towers still in the catalog with no `towers.wasm`.
- [x] 9.4 Archive the change (`openspec archive add-towers-ts-port --yes`) in the
      same commit as the C deletion.
