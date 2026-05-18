## 1. Engine contract refinements (keystone-deferred; D3/D4)

- [x] 1.1 Widen `GameDrawing` in `src/native/engine/game.ts` to the
      full puzzle drawing API (rect/line/polygon/circle/text,
      clip/unclip, startDraw/endDraw/drawUpdate, blitter quartet);
      confirm `src/puzzle/drawing.ts`'s `Drawing` satisfies it
      structurally with no change to `Drawing`.
- [x] 1.2 Add `UI_UPDATE` sentinel; change `Game.interpretMove` return
      to `Move | null | typeof UI_UPDATE`; handle `"ui"` in
      `Midend.processInput` (redraw/notify, no history push).
- [x] 1.3 Thread default background: `Game.colours(defaultBackground)`,
      `EngineCore.getColourPalette(defaultBackground)`, `Midend`, and
      `TsWorkerPuzzle.getColourPalette` (stop ignoring its arg).
- [x] 1.4 Define `PuzzleEngineSurface` (shared Comlink surface); make
      `WorkerPuzzle` and `TsWorkerPuzzle` `implements` it; factory and
      `RemoteWorkerPuzzle` use it; delete the
      `as unknown as WorkerPuzzle` cast in `src/puzzle/worker.ts`.
- [x] 1.5 Update the keystone's now-resolved comments/doc strings
      (the `GameDrawing` "shaped by the first real port" note, the
      `TsWorkerPuzzle` header, `Midend.size`/`colours`).
- [x] 1.6 Engine tests still green (fake game adjusted for the new
      `interpretMove`/`colours` signatures).

## 2. Lazy leaf port: ordered multiset (D2)

- [x] 2.1 `src/native/games/flip/sorted-multiset.ts`: generic
      sorted-array multiset with `add` (dedup on cmp==0), `delete` (by
      value), `count`, `get(pos)`, `removeAt(pos)`,
      `lastIndexLessThan(probe)`, `firstGreaterThan(probe)`.
- [x] 2.2 Property tests: ordering invariant, dedup, positional
      ops match a brute-force reference oracle over random ops.

## 3. Flip port (D1)

- [x] 3.1 `src/native/games/flip/index.ts`: `FlipParams/State/Move/Ui/
      DrawState` types; `defaultParams`, `presets` (3×3/4×4/5×5 ×
      Crosses/Random), `encodeParams`/`decodeParams`/`validateParams`.
- [x] 3.2 `newDesc`: `CROSSES` matrix; `RANDOM` matrix via the
      `SortedMultiset` generator (structural port of `new_game_desc`);
      random non-trivial start grid; bitmap-hex `desc`
      (`matrix,grid`); `validateDesc` length/charset checks.
- [x] 3.3 `newState`/`newUi`/`newDrawState`; `interpretMove`
      (LEFT_BUTTON via FROMCOORD, cursor select, cursor move → `"ui"`,
      no-effect → `null`); immutable `executeMove` (`flip` and
      `solve`); `status`.
- [x] 3.4 `solve`: GF(2) Gaussian elimination over the matrix →
      shortest flip set → `{ kind: "solve", mask }`; unsolvable →
      `{ ok: false, error }`.
- [x] 3.5 `textFormat`, `statusbarText` (moves / completed /
      auto-solved wording), `colours(defaultBackground)`,
      `preferredTileSize`, `computeSize`, `redraw` (grid lines once,
      per-tile diff cache, flip polygon anim, hint rect, cursor),
      `animLength`, `flashLength`.
- [x] 3.6 `registerGame(flipGame)` from the Flip module; ensure the
      module is imported so registration runs in the worker.

## 4. Tests for Flip (behavioural / property)

- [x] 4.1 Generation: every preset (both matrix types) yields a
      board whose matrix has no two identical rows and a non-trivial
      start grid; solver finds a solution for it.
- [x] 4.2 Solver: solves generated boards; detects a hand-crafted
      unsolvable position; produced move actually completes the game
      via `executeMove`.
- [x] 4.3 Move/undo/redo + save round-trip through the `Midend`
      using the real Flip game (status → solved / solved-with-help).
- [x] 4.4 `decodeParams`/`encodeParams` round-trip incl. C-style
      lenient inputs (`"5"`, `"5x4"`, `"5x5r"`).

## 5. Dev-time differential spot-check (D5; advisory)

- [x] 5.1 `puzzles/auxiliary/flip-trace.c` (transient; `#include`s
      flip.c) printing `new_game_desc` for `w h type seed`, as a
      `scripts/build-native.sh` target — built, used, then removed
      with flip.c (documented in the file/script headers).
- [x] 5.2 Advisory live check `scripts/diff-flip.test.ts` +
      `scripts/diff-flip.vitest.config.mts` (outside `src/`, so the
      gate's default vitest config never collects it; run on demand:
      `npx vitest run --config scripts/diff-flip.vitest.config.mts`).
      Plus the reproducible C-free gated form: a frozen C snapshot
      `__fixtures__/flip-c-reference.json` + `flip-differential.test.ts`
      (CROSSES exact vs snapshot, RANDOM solvable).
- [x] 5.3 Result recorded (design.md / this change): CROSSES matched
      C exactly incl. start grid (confirms `random.ts` bit-identical
      end-to-end through the generator + bitmap codec); RANDOM differs
      from C (expected, idiomatic generator) but every sampled board
      is solvable — the real bar.

## 5b. Per-game hybrid catalog seam (surfaced by this port)

- [x] 5b.1 `puzzle()` macro gains `TS_PORTED`: a TS-ported game keeps
      catalog metadata + appears in `catalog.json`/`puzzleIds` (via a
      new `ts_ported_names` list unioned by `webapp.cmake`) but builds
      NO `<name>.c`/wasm and no per-puzzle dep target. `puzzle(flip
      TS_PORTED …)`. Verified: catalog lists flip, no `flip.wasm`,
      build green; the app routes flip to the TS engine.

## 6. C deletion, docs, specs, gate

- [x] 6.1 Delete `puzzles/flip.c` (per-game C deletion, `ts-migration`).
- [x] 6.2 `AGENTS.md`: "What's been done" entry; migration-order item
      2 marked landed; resolved known-questions struck through.
- [x] 6.3 Spec deltas finalised: `ts-engine` (contract + shared
      surface), new `flip` capability.
- [x] 6.4 `openspec validate add-flip-ts-port --strict` clean.
- [x] 6.5 Full pre-commit gate green (`tsc -b` → biome → vitest →
      `vite build`, with `npm run build:wasm` assets present —
      verifying the all-other-games C/WASM path still builds with
      `flip.c` gone and `flip` served by TS).
- [x] 6.6 Archive: `openspec archive add-flip-ts-port --yes`; update
      `openspec/specs/`.
