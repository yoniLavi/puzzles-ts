# Tasks — add-map-ts-port

## 1. Scaffold + state/codec

- [x] 1.1 `scripts/new-game-port.sh map`; fill `state.ts`: params
      (w/h/n/diff), `encodeParams`/`decodeParams` (lenient, `.`-tolerant region
      count), `validateParams`, the difficulty name/char tables, `MapParams`,
      the `MapMove` discriminated union, `MapUi` (drag + cursor + prefs fields),
      `newUi`, `cloneState`.
- [x] 1.2 `map-struct.ts` (or in `state.ts`): the `MapData` structure — the
      4-quadrant `map` array, `graph`/`ngraph`, `immutable`, `edgex/edgey`,
      `regionx/regiony` — shared by reference across clones (upstream's
      refcounted `struct map`; GC replaces refcount). The union-find region
      decode (`parseEdgeList`), the 4-quadrant copy, the desc-seeded
      diagonal-smoothing pass, and the float label-point computation.
- [x] 1.3 `graph.ts`: `gengraph` (adjacency edge list), `graphEdgeIndex`,
      `graphAdjacent`, `graphVertexStart` (binary searches) — shared by
      solver + generator + decode.
- [x] 1.4 Tier-1 tests: params round-trip (incl. `d` suffix, square/`n`/`.`
      leniency), desc round-trip (`newState` re-encode == desc), `validateDesc`
      rejections (bad char, wrong region count, too much/little edge data).

## 2. Solver + generator (byte-match-critical)

- [x] 2.1 `solver.ts`: `mapSolver(graph, n, ngraph, colouring, difficulty)` —
      the graded deduction loop (EASY single-colour, NORMAL adjacent-pair, HARD
      forcing-chain BFS) + RECURSE recursion, returning 0/1/2. `placeColour`,
      `bitcount`, the scratch `possible` bitmap. `gradeMap` (solve at each diff,
      first `< 2` is the rating).
- [x] 2.2 `generator.ts`: `newDesc` — `genmap` (cumulative-frequency table
      `cfInit/cfAdd/cfClookup/cfSlookup/cfWhichsym` + `extendOptions` perimeter
      weights + seed placement + region renumber), `fourcolour`/`fourcolourRecurse`,
      the aux encoding, solver-gated clue reduction (cfreq last-colour guard +
      `shuffle`), the difficulty-floor retry loop, and the two-part run-length
      desc encoding. Byte-faithful RNG draw order.
- [x] 2.3 C trace harness `puzzles/auxiliary/map-trace.c` (+ CMake line); build
      pure-C (`-DUSE_TS_RANDOM=0`); record fixtures (all presets + a non-preset
      size + each difficulty) to `__fixtures__/map-c-reference.json`.
- [x] 2.4 Gated differential `map-differential.test.ts`: byte-match desc + aux
      via `describeDescDifferential`, plus inline solver-agreement (decode each
      C board, grade with the TS solver, assert the C-recorded difficulty).
- [x] 2.5 Tier-1 solver tests: generated boards uniquely solvable at their
      difficulty; `solve()` recovers the unique colouring from a blank/dirty
      mid-game state (through a real `Midend` for the aux path).

## 3. Game glue + rendering

- [x] 3.1 `render.ts`: palette (index-for-index with the C enum: BACKGROUND,
      GRID, COL_0..3, ERROR, ERRTEXT + appended COL_MISTAKE), `computeSize`
      (NARROW_BORDERS `BORDER = 0`), `newDrawState`, the per-cell `Int32Array`
      cache word (tv*5+bv + pencil-T/B + err + show-numbers + mistake), the
      diagonal-triangle draw, stipple layout, grid lines, error diamonds,
      region numbers, and the three-style completion flash. `flashLength`.
- [x] 3.2 `moves.ts`: `executeMove` (apply colour/pencil/solve tokens, recompute
      completion) — importable by render's drag preview without a cycle if
      needed; else keep in `index.ts`.
- [x] 3.3 `index.ts`: `region_from_coords` quadrant hit-test, `interpretMove`
      (press-pick / drag / release-drop, right-drag pencil toggle, keyboard
      cursor pick/drop, `l` number toggle), the floating drag-blob render (a
      blitter sprite, driven off `ui`), `newUi`, `solve`, `findMistakes`,
      `prefs`, `textFormat`, `describeParams`/`paramConfig`, the `Game` object +
      `registerGame`.
- [x] 3.4 Register: add `"map"` to `ts-ported-ids.ts` and import in
      `games/index.ts`.

## 4. Tests + gate

- [x] 4.1 Tier-1 input/executeMove tests (press-drag-drop colours a region,
      right-drag toggles a pencil bit, keyboard cursor pick/drop, immutable
      region rejected, no-op drop suppressed, completion detection incl. the
      adjacency check).
- [x] 4.2 `findMistakes` tier-1 + a paint-twice tier-2 render test (a
      wrong-coloured region reds even when the tile was already drawn —
      playbook §3.2).
- [x] 4.3 `map-render-scenario.test.ts`: targeted op-assertions + a snapshot on
      reached frames (opener; a diagonally-split cell; an error-diamond frame).
- [x] 4.4 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`); `openspec validate add-map-ts-port --strict`.
- [x] 4.5 Dev-verify in the browser (Playwright): renders with the TS badge,
      drag-drop colours regions, diagonal region boundaries draw, red error
      diamonds on a clash, pencil stipples, number toggle, the completion flash,
      Check & Save refuses a wrong board, Solve completes; 0 console errors.

## 5. Stage 2 (on owner acceptance)

- [ ] 5.1 Flip `TS_PORTED` in `puzzles/CMakeLists.txt`; delete `puzzles/map.c`
      + `puzzles/auxiliary/map-trace.c` + its `cliprogram` line; `rm -rf
      build/wasm/` + rebuild (map in catalog, no map.wasm).
- [ ] 5.2 Confirm the two icon PNGs still resolve (committed from the WASM era).
- [ ] 5.3 `openspec archive add-map-ts-port`; commit port + archive together.
