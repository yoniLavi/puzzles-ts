# Tasks: Sixteen TS Port

## Phase 1: Scaffold
- [ ] Create `src/native/games/sixteen/` directory structure
- [ ] Implement `state.ts` — SixteenParams, SixteenState, SixteenMove types, encode/decode, completion check
- [ ] Implement `generator.ts` — two generation paths, parity correction
- [ ] Implement `index.ts` — Game glue, move logic, registerGame()
- [ ] Register in `src/native/games/index.ts`
- [ ] Add `TS_PORTED` to `puzzles/CMakeLists.txt`

## Phase 2: Behavioural tests
- [ ] `sixteen.test.ts` — params, desc, state, moves, completion, generator, presets, colours, text format
- [ ] `sixteen-midend.test.ts` — lifecycle, keyboard input, undo, newGame

## Phase 3: Rendering
- [ ] Implement `render.ts` — DrawState, colour palette, per-tile cache, tile drawing, arrows, cursor, animation, flash

## Phase 4: Differential testing
- [ ] `sixteen-differential.test.ts` — frozen C reference snapshots
- [ ] Generate `__fixtures__/` from C build

## Phase 5: Validation
- [ ] Run full pre-commit gate (tsc, biome, vitest, vite build)
- [ ] Dev server visual check
- [ ] Owner acceptance
