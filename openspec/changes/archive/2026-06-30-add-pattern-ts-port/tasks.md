# Tasks — Port Pattern (Nonograms) to native TS

## 1. Scaffold
- [x] 1.1 Run `scripts/new-game-port.sh pattern` to stamp `src/native/games/pattern/`.
- [x] 1.2 Read `puzzles/pattern.c` + the Galaxies/Unruly ports end-to-end as exemplars.

## 2. State, params, desc codec (`state.ts`)
- [x] 2.1 `PatternParams` (`w`, `h`); encode/decode (`{w}x{h}`, bare `{w}` ⇒ square); `validateParams` (positive, sane `w·h`).
- [x] 2.2 `PatternState` — frozen shared `common` (clues + immutable + fontsize) + per-move `Uint8Array` grid (Unknown/Full/Empty) + `completed`/`cheated`; `clonePatternState` copies grid, shares common.
- [x] 2.3 `newState` parses the desc into clue arrays + all-`Unknown` grid; parses the optional `,` immutable-clue-squares suffix (run-length alphabet) and marks those cells immutable.
- [x] 2.4 `validateDesc` — per-line capacity check, line-count check, suffix length/character checks (ported upstream).
- [x] 2.5 `PatternMove` discriminated union (`fill {value,x,y,w,h}` / `solve {grid}`); `PatternUi` (drag start/end/state/release, cursor x/y/visible).

## 3. Solver + generator (`solver.ts`, `generator.ts`)
- [x] 3.1 Ported the per-line solver (`doRecurse`/`doRow` placement-enumeration; an order-independent dirty-worklist replaces C's priority scheduling — same fixpoint, same verdict, §4.4).
- [x] 3.2 `generate`/`generate_soluble` — float32 (`Math.fround`) value grid, median threshold, faithful RNG order; regenerate until non-trivial + uniquely line-solvable; `MAX_REGENERATE` backstop (§4.6).
- [x] 3.3 `solve()` re-derives the unique grid via the solver; `findMistakes` reuses it.

## 4. Game glue + input (`index.ts`)
- [x] 4.1 `interpretMove` — press/drag/release rectangle mechanics (snap-to-line, middle-button Unknown rect, stylus cycle), emit a `fill` only on a real change; cursor + Ctrl/Shift cell-set + cursor-select cycle. Immutable cells never overwritten.
- [x] 4.2 `executeMove` — apply the `fill` rect (skipping immutable cells), set `completed` (un-cheated) when the grid matches all clues.
- [x] 4.3 `colours()` (index-for-index with the C enum → dark-mode overrides hit COL_EMPTY/COL_FULL), `setTileSize`, `computeSize`, presets, flags, `textFormat`. Added optional `needsRightButton` Game flag (Pattern is `REQUIRE_RBUTTON`) + wired it in the midend.
- [x] 4.4 `findMistakes(state)` — solve from clues, flag every `Full`/`Empty` cell contradicting the unique solution (Unknown never flagged; `[]` when not uniquely line-solvable).

## 5. Rendering (`render.ts`)
- [x] 5.1 `redraw` — grid, clue numbers, cursor, drag-rectangle preview, win flash; first-draw background fill (engine paints no pixels).
- [x] 5.2 `check_errors` (`lineHasError`) — recolour a fully-determined line's clue numbers red when its runs contradict the clue; cursor-guide grey for the cursor's row/column.
- [x] 5.3 Cache key: per-cell display value (drag/flash-adjusted) + cursor/mistake bits packed into `Int32Array`; per-line clue-colour cache. (Mistake overlay folded into the per-cell key, so it repaints on the Check-&-Save frame.)

## 6. Differential (`__fixtures__/`, transient harness)
- [x] 6.1 Added `puzzles/auxiliary/pattern-trace.c` + its `cliprogram` line.
- [x] 6.2 Built pure-C, recorded `__fixtures__/pattern-c-reference.json` (8 boards: 5×5…20×20, square + non-square).
- [x] 6.3 Committed gated `pattern-differential.test.ts` — **byte-for-byte desc match green on all 8** (the float32 discipline reproduces C exactly), plus a `validateDesc` follow-on.

## 7. Tests
- [x] 7.1 Tier 1 — params/desc round-trip, validateDesc rejections, solver cracks generated boards, findMistakes flags wrong cells (not Unknown), fill/no-op moves, completion (un-cheated) + solve-with-help, cursor-select cycle, Midend save round-trip.
- [x] 7.2 Tier 2.5 — `renderScenario` grid/undecided-tile/clue-text ops + `toMatchSnapshot`. Heavy generation tests seed-deterministic with explicit 30s timeouts (§5.2).

## 8. Stage 1 — register for smoke-testing
- [x] 8.1 Added `pattern` to `ts-ported-ids.ts` + imported in `games/index.ts` so `registerGame` runs.
- [x] 8.2 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` (1891) → `vite build`). Dev-smoke + owner acceptance pending.

## 9. Stage 2 — parity acceptance (owner-gated)
- [ ] 9.1 On owner-accepted full parity: add `TS_PORTED` to `pattern`'s `puzzle()` in `puzzles/CMakeLists.txt`; delete `puzzles/pattern.c` + `puzzles/auxiliary/pattern-trace.c` + its `cliprogram` line.
- [ ] 9.2 `npm run build:wasm`; confirm `pattern` still in the catalog with no `pattern.wasm`.
- [ ] 9.3 Update `docs/porting/game-port-playbook.md` with anything this port taught; archive the change (`openspec archive add-pattern-ts-port --yes`) in the same commit as the C deletion.
