# Tasks — add-ascent-ts-port

## 1. Scaffold and survey

- [ ] 1.1 `scripts/new-game-port.sh ascent` to stamp `src/native/games/ascent/`
      with typed `Game<…>` stubs; read `galaxies/` (deductive solver +
      `findMistakes` exemplar) and the codec of a run-length game end-to-end first.
- [ ] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise. Record it in `design.md` if anything surprises.

## 2. Params, modes and the grid substrate

- [ ] 2.1 `AscentParams { w, h, diff, mode, removeends, symmetrical }`;
      `encodeParams`/`decodeParams` (`%dx%d` then `m<modechar>`, optional `E`
      for removeends, `d<diffchar>`, optional `S` for symmetrical — `ascent.c:279`).
- [ ] 2.2 `validateParams` in upstream order (`ascent.c:404`): `w*h < 1000`,
      `w,h ≥ 2`, `w,h ≤ 50`, Hexagon needs odd `h` and `w > h/2`, Edges not 2×2,
      Edges difficulty ≥ Normal, Edges forbids symmetrical.
- [ ] 2.3 `paramConfig` (Width, Height, "Always show start and end points"
      inverted → removeends, "Symmetrical clues", "Grid type" choices, "Difficulty"
      choices) — keys matching the C config slugs (playbook §3.4).
- [ ] 2.4 Presets — the three upstream preset menus (main 11, Honeycomb 6,
      Hexagon 6); `describeParams` emits the keys `augmentation.ts` reads.
- [ ] 2.5 `AscentMovement` table + `movementForMode` and `isNear` (`ascent.c:435`);
      `ascentGridSize` (physical vs user-facing `w`/`h`: Honeycomb widen, Edges
      +2 border — `ascent.c:1543`), frozen into game IDs.
- [ ] 2.6 State: `grid` (`Int16Array` of numbers with the `NUMBER_EMPTY/WALL/
      BOUND/EDGE` sentinels), immutable bitmap (shared by reference — §3.1),
      optional `path` line-flags, `last`, `completed`, `cheated`. `cloneState`.

## 3. The desc codec (byte-match surface)

- [ ] 3.1 Encode (`new_game_desc` tail, `ascent.c:1740-1793`): number runs
      (decimal `n+1`, `_` between adjacent numbers), blank runs `a`–`z`, wall runs
      `A`–`Z`, repeating `z`/`Z` past 26. Edges arrows encode as plain numbers.
- [ ] 3.2 Decode (`new_game`, `ascent.c:1836`): place numbers + immutable bits,
      expand blank/wall runs, re-tag border numbers as `NUMBER_EDGE` in Edges mode,
      promote border walls to `NUMBER_BOUND` and flood the promotion.
- [ ] 3.3 `validateDesc` (`ascent.c:1800`): reject a number greater than the cell
      count, distinguish "Not enough spaces" from "Too many spaces" against the
      **physical** area (post-`ascentGridSize`).
- [ ] 3.4 Tier-1: encode∘decode round-trips to the identical desc across every
      mode; a wrong-length desc is rejected with the distinguishing message.

## 4. The deductive solver (four tiers, no guessing)

- [ ] 4.1 `solver_scratch` as typed arrays (`positions`, `grid`, `marks`
      candidate bitmap `cell*number`, path tracking); `updatePositions`,
      `newScratch`, candidate seeding (`ascent.c:1467-1490`).
- [ ] 4.2 The deduction rules with discriminated progress codes (not `-1/0/1`):
      `solverSinglePosition`, `solverProximitySimple`/`Full`, `solverUpdatePath`,
      `solverAdjacentPath`, `solverRemoveEndpoints`, `solverRemovePath`,
      `solverRemoveBlocks`, `solverSingleNumber` (simple/full), `solverOverlap`,
      `solverEdges` (`ascent.c:856-1465`).
- [ ] 4.3 `ascentSolve(puzzle, diff, scratch)` — the tiered fixpoint loop
      (`ascent.c:1497-1536`): Easy stops after proximity-simple; Normal adds path
      rules; Tricky adds single-number simple; Hard adds full single-number +
      overlap. **No tier guesses or backtracks** — record why in `solver.ts`.
- [ ] 4.4 Tier-1: each preset's solution is unique and reached at exactly its
      difficulty (a Hard board is not solved by the Normal ruleset).

## 5. The generator

- [ ] 5.1 `generateHamiltonianPath` (`ascent.c:676`): per-mode wall placement
      (Hexagon triangles, Honeycomb offsets, Edges border), random start, the
      **backbite** loop (`backbite_left`/`backbite_right`/`backbite`,
      `ascent.c:621-674`) until filled or `MAX_ATTEMPTS`. Byte-match RNG surface.
- [ ] 5.2 Non-Edges reduction `ascentRemoveNumbers` (`ascent.c:1667`): one
      `shuffle`, then solver-gated blanking honouring `symmetrical` (partner cell)
      and `removeends` (keep 0 and last).
- [ ] 5.3 Edges reduction `ascentAddEdges` (`ascent.c:1557`): build the inner↔edge
      bipartite adjacency, call the shared `matching(aw*ah, w*h, …, rs)`
      (`engine/latin.ts`, D8), move matched numbers to arrows, accept if the graded
      solver still solves; retry to `MAX_ATTEMPTS`.
- [ ] 5.4 `newDesc`: the outer retry loop (`new_game_desc`, `ascent.c:1720-1738`)
      — regenerate the path and reduce until success, then emit the desc. No `aux`
      (Solve re-runs the solver, playbook §3.6).
- [ ] 5.5 Tier-1: every preset and a small size sweep generate a uniquely soluble
      board whose desc decodes and re-solves to a single completion.

## 6. Input, moves and completion

- [ ] 6.1 Move model: the `AscentMove` discriminated union (`place` / `line` /
      `clear` / `solve`, design D5), applied as an ordered batch; not a move string.
- [ ] 6.2 Ephemeral `Ui` (`game_ui`, `ascent.c:2062`): held number, select,
      typing cell/buffer, drag anchor, keyboard cursor, `prevhints`/`nexthints`.
      Never serialised.
- [ ] 6.3 `interpretMove` — the three entry methods (`ascent.c:2540-2952`):
      (a) click a number then an adjacent cell/drag → `place` successor;
      (b) click empty then type digits, confirm on Enter/arrow/click → `place`;
      (c) Edges drag from an arrow → `place` in a same-line empty cell. Keyboard
      cursor + Enter emulate clicks. Return `UI_UPDATE` for pure UI changes,
      `null` for no-ops. `fromCoord` with `BORDER = 0`.
- [ ] 6.4 Free-form path drawing: left-drag → `line`, right-click/drag → `clear`;
      `executeMove`'s post-pass `cleanPath`/`applyPath` (`ascent.c:2977-3072`)
      resolves a complete drawn path into placed numbers (can iterate — port the
      loop).
- [ ] 6.5 `executeMove` (`ascent.c:3074`): apply each fragment (reject placing on
      an immutable cell), run the path-resolution post-pass, set `completed` via
      `checkCompletion` (`ascent.c:463` — empty check, path-follow to `last`, Edges
      arrow satisfaction).
- [ ] 6.6 `solve()` returns `{ kind: "solve", grid }` from a full-difficulty
      `ascentSolve`; error if unsolved. Test Solve **through a real `Midend`**.
- [ ] 6.7 `findMistakes` (design D6): re-solve a clues-only copy to the canonical
      solution, flag placed numbers that contradict it. Tier-1: a wrong number is
      reported, a correct partial board reports none.
- [ ] 6.8 `textFormat`/`canFormatAsText` per `game_text_format` (`ascent.c:2023`).

## 7. Rendering

- [ ] 7.1 Palette in C enum order (`COL_MIDLIGHT … COL_ARROW`, `ascent.c:33`),
      derived from the app background; `COL_ERROR` pure red. No dark-mode
      luminance adjust (playbook §3.3 — the app owns it).
- [ ] 7.2 `computeSize`/`setTileSize`: `NARROW_BORDERS` arm (`BORDER = 0`, D9);
      per-mode half-tile offset via `setOffsets` (`ascent.c:3258`).
- [ ] 7.3 `redraw`: per-tile numbers/walls/path segments with an `Int32Array`
      cache key (playbook §3.2). Every drag/typing/error/flash overlay in the diff
      key. Own background fill in `!ds.started`.
- [ ] 7.4 Edges arrows (`ascentDrawArrow`, `ascent.c:3375-3438`); endpoint
      candidate hints for a single-number path (`prevhints`/`nexthints`); in-play
      `COL_ERROR` shading for duplicate numbers / invalid path segments (distinct
      from the `findMistakes` overlay, D6).
- [ ] 7.5 The completion flash (`FLASH_FRAME = 0.03`, `FLASH_SIZE = 4`, the wave
      down the path — `ascent.c:3490-3646`). No move animation (`animLength = 0`).
- [ ] 7.6 Tier-2.5 render-scenario tests + snapshots: a fresh board per mode
      (Rect / Hexagon / Edges), a mid-typing frame, an error-shaded frame, and a
      completion-flash frame.

## 8. Differential

- [ ] 8.1 `puzzles/auxiliary/ascent-trace.c` on the established pattern
      (`#include "../unreleased/ascent.c"`); add its `cliprogram()` line.
- [ ] 8.2 Fixture matrix: all five modes × difficulty tiers, plus `symmetrical`
      and `removeends` variants and a small size sweep (design D7), each seed
      dumping the generated desc.
- [ ] 8.3 `ascent-differential.test.ts`: TS `newDesc` reproduces the C desc
      **byte-for-byte** for each fixture — validates generator + solver + codec.

## 9. Registration and stage 1 close-out

- [ ] 9.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). The
      C/WASM ascent stays as the fallback — stage-2 gate. `puzzles/unreleased/
      ascent.c` and its `puzzle(ascent …)` catalog entry are untouched.
- [ ] 9.2 Behavioural tests: codec round-trip, solver uniqueness per tier,
      generator determinism, move legality, `findMistakes`, win condition, midend
      lifecycle + save round-trip.
- [ ] 9.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [ ] 9.4 `openspec validate add-ascent-ts-port --strict`.
- [ ] 9.5 Dev-verify in the browser: all five modes, the three entry methods,
      free-form path drawing, Edges arrow drag, Solve, Check & Save hard-block on a
      wrong number, completion flash, Custom params.
- [ ] 9.6 Update `docs/porting/game-port-playbook.md` if the port surfaces a new
      pattern (multi-method input, the path-resolution post-pass, per-mode padding).

## 10. Stage 2 — on owner acceptance only

- [ ] 10.1 Add `TS_PORTED` to the existing `puzzle(ascent …)` entry in
      `puzzles/unreleased/CMakeLists.txt` (in place — no CMake move) and drop the
      `solver(ascent …)` line.
- [ ] 10.2 Delete `puzzles/unreleased/ascent.c` and the `ascent-trace` harness
      (and its `cliprogram()` line).
- [ ] 10.3 `rm -rf build/wasm/` and rebuild — ascent in the catalog, no
      `ascent.wasm`. Icons already exist. Verify the frozen differential fixture
      still runs C-free.
- [ ] 10.4 Archive, then commit port + archive together.
