## 1. Scaffold + long-tail risk check

- [x] 1.1 Long-tail risk check against `inertia.c`: no supersede, no editor
      letters, no undo-via-state-string equality, no keypad, no leaf library.
      Byte-match feasible (desc RNG = `shuffle` only; the `qsort` is in
      `solve_game`, which never feeds the desc). `NARROW_BORDERS` applies.
- [x] 1.2 `scripts/new-game-port.sh inertia` (file skeleton).
- [x] 1.3 openspec change `add-inertia-ts-port` (this) + `validate --strict`.

## 2. State + codec (`state.ts`)

- [x] 2.1 Immutable `InertiaState`: the cell grid (`Uint8Array` of
      Blank/Gem/Mine/Stop/Wall), ball position, gem count, `distanceMoved`,
      `dead`, `cheated`, and the shared frozen route (`soln`, `solnPos`).
      `cloneState` shares the route by reference (GC replaces the C refcount).
- [x] 2.2 Params `w`,`h`; encode/decode/validate; the 3 upstream presets
      (10×8, 15×12, 20×16); `paramConfig: dimensionParamConfig()`.
- [x] 2.3 Desc codec: `newState` (the `START` cell becomes a `STOP` under the
      ball), `validateDesc` (exactly one start, at least one gem, no stray
      characters, exact length), `textFormat`. Move + Ui types.
- [x] 2.4 The 8-direction geometry (`DX`/`DY`) and the slide rule shared by the
      solver, the generator and `executeMove`.

## 3. Solvers (`solver.ts`)

- [x] 3.1 `findGemCandidates`: the double BFS over `w·h·8` square+direction
      nodes (forward from the start, backward to it); a square is a candidate
      iff some direction is reachable both ways. Ports `can_go` verbatim.
- [x] 3.2 `solveRoute` (upstream `solve_game`): build the move graph
      (`moveGoesTo`, stationary + directed gem vertices), grow the tour by
      splicing in a round trip to the nearest uncollected gem, then reduce
      redundant sections to shortest paths until it stops shrinking. Returns the
      direction sequence, or an error when a gem is unreachable.

## 4. Generator (`generator.ts`)

- [x] 4.1 `newInertiaDesc` (`gengrid`): 1/5 walls + 1/5 stops + 1/5 mines + one
      start + blanks, `shuffle`; reject on too few gem candidates; reject on a
      geometric `maxdist` above the threshold (which relaxes every 50 tries);
      place `wh/5` gems on a shuffled subset of the candidates. RNG-faithful.

## 5. Render (`render.ts`)

- [x] 5.1 Palette index-for-index with the C enum (`BACKGROUND, OUTLINE,
      HIGHLIGHT, LOWLIGHT, PLAYER, DEAD_PLAYER, MINE, GEM, WALL, HINT`) via the
      shared `mkhighlight`.
- [x] 5.2 `computeSize`/`setTileSize` with the **`NARROW_BORDERS`** border (=1).
- [x] 5.3 `drawTile`: bevelled wall, mine, ringed stop, diamond gem, flash
      backgrounds; `Int32Array` cache key (cell value | flash bits).
- [x] 5.4 `drawPlayer`: green ball / red dead-splat polygon / yellow route arrow;
      blitter-saved background (Pegs pattern, allocated lazily in `redraw`).
- [x] 5.5 `redraw`: slide interpolation (`animTime / ui.animLength`), gems vanish
      as the ball passes them, the dead player's mine is erased, grid lines on
      first draw. `animLength = sqrt(distance) × 0.1`; `flashLength` 0.3 for both
      death and win.

## 6. Game glue (`index.ts`)

- [x] 6.1 `interpretMove`: arrow keys + the bare/modified digits (all 8
      directions — design D10: this frontend never sets `MOD_NUM_KEYPAD`, so
      without the bare digits the diagonals would be mouse-only),
      left-click octant (`atan2`), Enter/Space follows the installed route;
      reject a move into an adjacent wall and every move while dead.
- [x] 6.2 `executeMove`: the slide (collect gems, die on a mine, stop on a stop
      or before a wall), plus the route bookkeeping — advance when the player
      followed it, re-solve when they deviated, discard on death / win /
      unsolvable.
- [x] 6.3 `solve`: `solveRoute` → an install-route move (does **not** finish the
      game); `status` (won iff no gems left, never lost); `changedState` (the
      deaths tally); `statusbarText`.
- [x] 6.4 `registerGame(inertiaGame)`.

## 7. Differential

- [x] 7.1 `puzzles/auxiliary/inertia-trace.c` + its `cliprogram()` line; record
      `__fixtures__/inertia-c-reference.json` (3 presets + custom sizes, several
      seeds each).
- [x] 7.2 `inertia-differential.test.ts`: `newDesc` byte-match on 10 boards,
      **plus a byte-match on the solver's route** — `solve_game` draws no
      randomness, so the route is a pure function of the board and pins the whole
      tour algorithm (this is what caught the `memmove` bug). Written inline
      rather than via `describeDescDifferential`, since it asserts both.

## 8. Tests

- [x] 8.1 Tier 1: params/desc round-trip + validation rejections; the slide rule
      (gem collection, mine death, stop, wall); generator invariants (piece
      counts, exactly one start, `wh/5` gems, every board route-solvable);
      solver (candidate squares are round-trip reachable); route-following
      (advance on follow, re-solve on deviation, discard on death/win); the
      deaths tally across undo/redo.
- [x] 8.2 Tier 2.5: `renderScenario` snapshots — the opening frame, the route
      arrow, and mid-slide vs landed (dead splat). Added a `settle` option to the
      shared scenario driver: an animated game's capture is otherwise frame 0.

## 9. Parity gate

- [x] 9.1 Register (stage 1): `ts-ported-ids.ts` + `games/index.ts`.
- [x] 9.2 Icons: already committed (inertia was already a catalog puzzle) — no
      new PNGs needed.
- [x] 9.3 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`).
- [x] 9.4 Dev-verify in a real browser (slide, gem pickup, death + flash, win
      flash, Solve → arrow → Enter follows, deviation re-solves, status bar,
      octant clicks, custom params).
- [ ] 9.5 **Owner acceptance** → stage 2: `TS_PORTED` in `puzzles/CMakeLists.txt`,
      delete `puzzles/inertia.c` + `puzzles/auxiliary/inertia-trace.c`, rebuild
      wasm, confirm inertia is still in the catalog with no `inertia.wasm`.
- [ ] 9.6 Archive the change with the C deletion; update the dev guides with
      anything this port taught.
