## 1. Engine hook
- [x] 1.1 Add optional `findMistakes?(state): readonly Mistake[]` to the `Game` interface (`game.ts`), with a defaulted 6th generic `Mistake = unknown`; add an optional trailing `mistakes?: readonly Mistake[]` param to `redraw`.
- [x] 1.2 In `midend.ts`: store `activeMistakes` (midend-only), a `findMistakes()` that calls `game.findMistakes`, stores the result, requests redraw, and returns the count; clear `activeMistakes` on every transition (`afterTransition`) plus `startFrom`/`restartGame`; pass it to `redraw`.
- [x] 1.3 Add `canFindMistakes` to the static attributes (`game.findMistakes !== undefined`).

## 2. Surface threading
- [x] 2.1 `engine-surface.ts`: add `findMistakes(): number`; `canFindMistakes` added to `PuzzleStaticAttributes` (`types.ts`).
- [x] 2.2 `worker-adapter.ts` (`TsWorkerPuzzle`): delegate `findMistakes()` to the midend (static props pass through the midend, which sets `canFindMistakes`).
- [x] 2.3 `worker.ts` (`WorkerPuzzle`): `findMistakes()` returns 0; `canFindMistakes` false.
- [x] 2.4 `puzzle.ts`: main-thread `findMistakes(): Promise<number>` and a `canFindMistakes` field.

## 3. Galaxies implementation
- [x] 3.1 `galaxies/index.ts`: implement `findMistakes(state)` for **associations** — clone+`clearForSolve`+`rebuildDots`+`solverState(Unreasonable)`; build the solution's tile→dot map; collect wrong-association tiles as `GalaxiesMistake[]`; return `[]` on indeterminate solve. Declare the 6th `Game` generic (`GalaxiesMistake`).
- [x] 3.2 `galaxies/render.ts`: a `DRAW_MISTAKE` per-tile flag (cache bit 30) folded into the cache key; a `COL_MISTAKE` red; draw a red outline on flagged tiles. Thread the `mistakes` param through `redraw`.
- [x] 3.3 Unit tests (associations): wrong association reports exactly that tile; correct association / empty board / solved board report none; midend lifecycle test (count + overlay shown then cleared on the next move).
- [x] 3.4 **Walls** (the gap owner testing surfaced): extend `findMistakes` to flag every interior `F_EDGE_SET` wall whose two adjacent tiles share a solution dot; add the `"edge"` `GalaxiesMistake` variant.
- [x] 3.5 **Wall rendering**: per-tile wrong-edge mask in a new `Int32Array` sidecar (`ds.wrongEdges`, compared as an extra cache-miss condition); paint flagged walls in `COL_MISTAKE` (the `DRAW_EDGE_*` recolour in `drawSquare`).
- [x] 3.6 Unit tests (walls): a wall inside a region is flagged (even with zero associations); a wall on a true boundary is not; the recording-`GameDrawing` double emits a `COL_MISTAKE` op for the flagged wall.

## 4. App-shell surface
- [x] 4.1 The user-facing trigger is the **Check & Save** button delivered by `add-quick-save-check-save` (B and C ship together; a separate "Check for mistakes" control the owner did not request is intentionally not added — the combined button highlights mistakes on a dirty board, which is the check). The mistake-overlay lifecycle (cleared on the next move/undo/redo/new/solve) is covered by the midend lifecycle test.

## 5. Verify
- [x] 5.1 `tsc` green across all four ports (defaulted generic introduces no churn).
- [x] 5.2 Associations path verified live on Galaxies (4 wrong associations → "4 mistakes found — not saved" + red outlines; overlay clears on next move).
- [x] 5.3 **Walls path**: verified in-process (a wall-only invalid board flags the edge; a boundary wall does not; draw-op assertion) **and** live on the dev server — boxing in the centre tile produced "1 mistake found — not saved", the galaxy-slicing wall rendered red while the two boundary walls stayed black, and the overlay cleared on the next move (0 console errors).
- [x] 5.4 Pre-commit gate green after the wall work (`tsc`, biome 126 files, vitest 664, vite build).
- [x] 5.5 AGENTS.md "What's been done" + migration-order item 6 updated (note walls landing here too once done).
