## 1. Game types and constants
- [ ] 1.1 Create `src/native/games/pegs/` directory
- [ ] 1.2 Define PegsParams, PegsState, PegsMove, PegsUi, PegsDrawState types
- [ ] 1.3 Define grid constants (GRID_HOLE, GRID_PEG, GRID_OBST, GRID_CURSOR, GRID_JUMPING)
- [ ] 1.4 Define colour indices (COL_BACKGROUND, COL_HIGHLIGHT, COL_LOWLIGHT, COL_PEG, COL_CURSOR, NCOLOURS)
- [ ] 1.5 Define board type enum (Cross, Octagon, Random) and presets

## 2. Game interface — params and state
- [ ] 2.1 Implement `defaultParams`, `presets`, `encodeParams`, `decodeParams`, `validateParams`
- [ ] 2.2 Implement `newDesc` (Cross/Octagon layout + Octagon starting-hole selection + Random generator)
- [ ] 2.3 Implement `validateDesc`
- [ ] 2.4 Implement `newState`, `newUi`
- [ ] 2.5 Implement `executeMove` (jump: remove source + middle peg, place target peg, check completion)
- [ ] 2.6 Implement `status`

## 3. Input — interpretMove
- [ ] 3.1 LEFT_BUTTON: start drag from peg
- [ ] 3.2 LEFT_DRAG: update drag position (UI_UPDATE)
- [ ] 3.3 LEFT_RELEASE: validate jump target, return move or UI_UPDATE
- [ ] 3.4 Cursor move: navigate cursor on grid (skip OBST cells)
- [ ] 3.5 Cursor select: toggle jumping mode on peg
- [ ] 3.6 Cursor jump: when jumping, arrow key executes jump in that direction

## 4. Generator — Random board
- [ ] 4.1 Port `SortedMultiset` as local copy
- [ ] 4.2 Port `GenMove` type and comparators (byMove, byCost)
- [ ] 4.3 Port `updateMoves` (re-evaluate moves around a cell)
- [ ] 4.4 Port `genMoves` (select cheapest available moves until stuck)
- [ ] 4.5 Port `generate` (retry until board touches all four edges)

## 5. Rendering
- [ ] 5.1 Implement `colours` using `mkhighlightBackground`
- [ ] 5.2 Implement `computeSize`, `setTileSize`
- [ ] 5.3 Implement `newDrawState`, `redraw` with per-tile cache
- [ ] 5.4 First-draw setup: relief borders around playable cells (4-pass like C)
- [ ] 5.5 Incremental redraw: only redraw changed cells
- [ ] 5.6 Drag sprite: blitter save/restore + draw peg at drag position
- [ ] 5.7 Flash: alternate background colour during win flash

## 6. Text format and serialisation
- [ ] 6.1 Implement `textFormat`
- [ ] 6.2 Implement `serialiseMove` / `deserialiseMove` (C-compatible "sx,sy-tx,ty")

## 7. Registration and testing
- [ ] 7.1 `registerGame` call + export
- [ ] 7.2 Behavioural tests: params, state, moves, completion, generator
- [ ] 7.3 Gated differential test against frozen C reference
- [ ] 7.4 Advisory live differential script
- [ ] 7.5 Register in TS registry (for smoke-testing)

## 8. Validation
- [ ] 8.1 Run `tsc -b --noEmit`
- [ ] 8.2 Run `biome lint`
- [ ] 8.3 Run `vitest run`
- [ ] 8.4 Run `vite build`
- [ ] 8.5 Run dev server and visually verify
