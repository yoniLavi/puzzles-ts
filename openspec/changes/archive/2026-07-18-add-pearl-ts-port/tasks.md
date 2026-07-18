# Tasks — add-pearl-ts-port

## 1. Shared leaf: `engine/grid.ts` (square slice)

- [x] 1.1 Port the incidence structs — `GridDot` (`x`/`y`/`order`/`edges`/`faces`,
      integer coords), `GridEdge` (`dot1`/`dot2`/`face1`/`face2`, null face =
      exterior), `GridFace` (`order`/`edges`/`dots`, edge `k` joins dots `k`↔`k+1`
      clockwise), `Grid` (`faces`/`edges`/`dots` arrays, bbox, `tileSize`) — as
      classes with reference incidence. No refcount (GC).
- [x] 1.2 Port the build helpers (`gridEmpty`, `faceAddNew`, `dotAddNew`,
      `getDot` — dedup shared corners via a `Map` keyed by `(x,y)`, `faceSetDot`)
      and `gridNewSquare(w, h)` (deterministic: each cell a 4-dot clockwise face
      at pixel origin `(20x, 20y)`; `tileSize = 20`).
- [x] 1.3 Port `makeConsistent(g)` — Stage 1 edges (dedup by dot-pair via a
      `Map`, first sighting sets `face1`, second `face2`), Stage 2 face
      edge-lists (clockwise slots), Stage 3 dot edge/face rings (clockwise then
      anticlockwise past the exterior face), Stage 4 bounding box. Tie/ordering
      decisions deterministic; final tie-breaks by **index** (matches C's
      sequential-allocation pointer order — design D2).
- [x] 1.4 Tier-1 tests: a `w×h` square grid has the right face/edge/dot counts,
      every interior edge has two faces, border edges one; a face's edges join
      its consecutive dots; `getDot` dedups shared corners.

## 2. Shared leaf: `engine/loopgen.ts` (byte-match critical)

- [x] 2.1 Port `generateLoop(g, board, rng, bias?)`: per-face `randomBits(31)`
      score seeds, the `randomUpto(num_faces)` seed face, the sorted white/black
      candidate sets (comparator: score desc, then `random`, then **face index**
      — design D3), `canColourFace` (exactly-two-transitions topology test over
      the face/dot rings), `faceScore`, the per-iteration `randomUpto(2)` colour +
      `bias` callback (tentative-set → restore → notify-commit; consumes no RNG),
      the `shuffle(faceList)`, and the non-random growth passes + the single
      `randomUpto(10)` random flip pass. Reproduce every draw in order.
- [x] 2.2 Tier-1 test: `generateLoop` with no bias, fixed seed, produces a board
      whose white/black boundary is a single closed loop (the invariant the
      generator guarantees); deterministic across runs for a fixed seed.

## 3. Pearl state + codec

- [x] 3.1 `state.ts`: params (`w`/`h`/`difficulty`/`nosolve`), encode/decode/
      validate params (`WxH` + `d<char>` + `n`; Tricky needs `w+h ≥ 11`), presets,
      the clue constants (`NOCLUE`/`CORNER`=black/`STRAIGHT`=white), direction
      bit vocabulary (`R/U/L/D`, `F`/`C`/`A`, pair codes), the immutable shared
      `clues` + mutable `lines`/`marks` state, `newUi`, `cloneState`, the move
      union.
- [x] 3.2 The RLE desc codec (`encodeDesc`/`newState`/`validateDesc`) — lowercase
      no-clue runs, `B`/`W` pearls; `validateDesc` count check.
- [x] 3.3 Tier-1 codec tests: params round-trip (incl. `d`/`n` suffixes, the
      Tricky validation), desc round-trip, `validateDesc` rejections.

## 4. Solver

- [x] 4.1 `solver.ts`: `pearlSolve(w, h, clues, result, difficulty, partial)` —
      the `(2w+1)×(2h+1)` workspace, edge↔square elimination, the CORNER/STRAIGHT
      clue deductions, shortcut-loop detection over the shared `Dsf` (+ the Tricky
      premature-short-loop rules gated on difficulty), the reciprocity fixup, and
      the 0/1/2 verdict. No recursion (pure deduction). `gradePearl`.
- [x] 4.2 Tier-1 solver tests: generated boards solve uniquely at their
      difficulty; an Easy board is *not* solvable by a do-nothing pass; a Tricky
      board needs the shortcut rules (fails at Easy).

## 5. Generator + differential

- [x] 5.1 `generator.ts`: `pearlLoopgen` (drive `generateLoop` with the
      black-clue `bias`, then face-colouring → `lines`), `newClues` (maximal clue
      set → solver-gated uniqueness + too-easy check → greedy minimisation), and
      `newDesc`. Reproduce the upstream `corners`-array duplication quirk verbatim
      (design D4) and the 5×5-Tricky→Easy downgrade. Byte-faithful RNG order;
      emit `aux`.
- [x] 5.2 C trace harness `puzzles/auxiliary/pearl-trace.c` (+ CMake line); build
      pure-C (`-DUSE_TS_RANDOM=0`); record fixtures (presets + both difficulties +
      a non-preset size + a `nosolve` case) to
      `__fixtures__/pearl-c-reference.json`.
- [x] 5.3 Gated differential `pearl-differential.test.ts`: byte-match desc (+ aux)
      via `describeDescDifferential`, plus inline solver-agreement (decode each C
      board, grade with the TS solver, assert the recorded difficulty). Note the
      theoretical pointer-tie-break edge case (design D3/D9).

## 6. Game glue + rendering

- [x] 6.1 `render.ts`: palette (index-for-index with the C enum + appended
      `COL_MISTAKE`), `computeSize` (NARROW_BORDERS), `newDrawState`, the per-cell
      packed `Int32Array` cache word (lines | errors | drag-preview | marks |
      error-clue | flash | cursor), the two GUI styles (traditional square
      outlines vs loopy centre-dots + grid), pearls, no-line crosses, the four
      line-segment layers (normal/error/dragoff/dragon), and the flash.
      `flashLength`.
- [x] 6.2 `moves.ts`: the drag-path → edge-flip interpretation
      (`interpretUiDrag`/`updateUiDrag` — rook-move extension, marks as barriers,
      loop-closure degree check) and `executeMove` (line flip / mark flip / solve;
      reject line-over-mark), recomputing completion + errors. Split so `render`'s
      drag preview and `index` both import without a cycle (playbook §3.2).
- [x] 6.3 `index.ts`: `interpretMove` (drag draw/erase, secondary marks, keyboard
      cursor with modifiers, `H` hint→autosolve, Esc/backspace cancel), `newUi`,
      `solve` (aux or re-solve), `findMistakes` (edge-based — flag player lines
      not in the unique solution), the `appearance` `prefs` hook, `textFormat`,
      `describeParams`/`paramConfig`, the `Game` object + `registerGame`.
- [x] 6.4 Register: add `"pearl"` to `ts-ported-ids.ts` and import in
      `games/index.ts`.

## 7. Tests + gate

- [x] 7.1 Tier-1 input/executeMove tests (a drag draws a line path, a
      secondary-drag marks crosses, line-over-mark rejected, no-op suppressed,
      completion detection on a solved loop).
- [x] 7.2 `findMistakes` tier-1 + a paint-twice tier-2 render test (a wrong line
      segment reds even when the cell was already drawn — playbook §3.2).
- [x] 7.3 `pearl-render-scenario.test.ts`: targeted op-assertions + a snapshot on
      reached frames (opener with pearls; a drawn-line frame; an error frame) —
      and a second scenario in the `loopy` appearance style.
- [x] 7.4 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`); `openspec validate add-pearl-ts-port --strict`.
- [x] 7.5 Dev-verify in the browser (Playwright): renders with the TS badge,
      pearls + grid draw, drag draws/erases loop lines, right-drag marks crosses,
      error highlighting, the appearance pref switches Masyu/loopy, Check & Save
      refuses a wrong board, Solve completes with the flash; 0 console errors.

## 8. Stage 2 (on owner acceptance)

- [x] 8.1 Flip `TS_PORTED` in `puzzles/CMakeLists.txt`; delete `puzzles/pearl.c`
      + `puzzles/auxiliary/pearl-trace.c` + its `cliprogram` line; `rm -rf
      build/wasm/` + rebuild (pearl in catalog, no pearl.wasm). **`grid.c` +
      `loopgen.c` STAY** (Loopy still consumes them).
- [x] 8.2 Confirm the two icon PNGs still resolve (committed from the WASM era).
- [x] 8.3 `openspec archive add-pearl-ts-port`; commit port + archive together.
