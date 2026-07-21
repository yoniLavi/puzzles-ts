# Tasks — add-sticks-ts-port

## 1. Scaffold and survey

- [x] 1.1 `scripts/new-game-port.sh sticks` to stamp `src/native/games/sticks/`
      with typed `Game<…>` stubs; read `galaxies/` (dsf + findMistakes exemplar)
      and a small logic-game port (`singles/`, `unruly/`) end-to-end first.
- [x] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise. Record it in `design.md` if anything surprises.

## 2. Params, state and desc codec

- [x] 2.1 `SticksParams { w, h, blackpc, symm }`; `encodeParams`/`decodeParams`
      (`%dx%db%ds%d` full, `%dx%d` short; the bare-`WxH` `SYMM_ROT4`→`ROT2`
      downgrade on non-square — design D9).
- [x] 2.2 `validateParams` in upstream order: `w ≥ 2`, `h ≥ 2`; on full,
      `blackpc ∈ [5,100]`, `SYMM_ROT4` only when `w == h`, known `symm`.
- [x] 2.3 `paramConfig` (Width, Height, "%age of black squares", Symmetry choice
      in C enum order None/REF2/ROT2/REF4/ROT4) — keys matching the C config slugs
      (playbook §3.4); numeric fields via `parseConfigInt`.
- [x] 2.4 Presets — the two upstream presets (`7×7 20% ROT2`, `10×10 20% ROT2`);
      `describeParams` emits the keys `augmentation.ts` reads (playbook §3.4).
- [x] 2.5 State: `grid` (`Uint8Array`, `F_HOR|F_VER|F_BLOCK` per cell), `numbers`
      (`Int16Array`, `-1` = none — fixed puzzle data), `completed`, `cheated`;
      `cloneState` is a typed-array copy (design D1).
- [x] 2.6 Desc codec: the run-length blank encoding (`a`–`z` runs chaining on `z`,
      `_` separators, `B`+optional digit black cells, inline decimal clues). Port
      `new_game`'s decode and `new_game_desc`'s encode as exact inverses —
      byte-match surface (design D1/D6).
- [x] 2.7 `validateDesc`: reject a desc decoding to more/fewer than `w*h` cells
      (distinguishing too-long from too-short) and unknown characters, faithful to
      the C position count.

## 3. The contradiction solver (reuse `engine/dsf.ts`)

- [x] 3.1 `sticksMakeDsf` + `sticksMaxSizeHorizontal/Vertical` + `sticksValidate`
      (COMPLETE / UNFINISHED / INVALID, the segment-length and black-cell-count
      constraint checks) over the shared `Dsf` (design D2/D7). Discriminated
      status, not a magic `-1/0/1`.
- [x] 3.2 `sticksTry` (place a trial line; if it makes the board INVALID, commit
      the opposite) and `sticksSolveGame` (clear white cells, iterate `sticksTry`
      to a fixpoint) — the single-technique deductive solver, no backtracking.
- [x] 3.3 Tier-1 tests: a hand-built board solves to its unique solution; an
      already-invalid board reports INVALID; a board needing a deduction step is
      driven to COMPLETE.

## 4. The generator

- [x] 4.1 `setBlacks` — the `lightup.c`-derived symmetric black placement (region
      sizing per `SYMM_*`, `random_upto` rejection sampling, reflect/rotate copy,
      the `SYMM_ROT4` odd-centre fix-up) ported verbatim (byte-match surface,
      design D3).
- [x] 4.2 The fill+clue+retry loop: random `F_HOR`/`F_VER` fill, segment dsf, black
      clue counts + per-segment length clue on a `random_upto`-chosen cell, retry
      until `sticksSolveGame == COMPLETE`.
- [x] 4.3 Greedy minimisation: one `shuffle` of the cell indices, then remove each
      clue keeping it removed only while the board still solves to COMPLETE.
- [x] 4.4 `newDesc` emitting the run-length desc; no `aux` (solve re-runs the
      solver — playbook §3.6).
- [x] 4.5 Tier-1: both presets and a small size/`blackpc`/`symm` sweep generate a
      board that `sticksSolveGame` deduces to COMPLETE.

## 5. Input, moves, findMistakes and completion

- [x] 5.1 Move model: the `SticksMove` discriminated union
      (`{ kind: "set"; changes } | { kind: "solve"; grid }`), not a move string
      (design D4).
- [x] 5.2 `interpretMove` drag phases (design D4): drag-to-draw
      (`DRAG_START`/`DRAG_LINE`/`DRAG_CLEAR` state machine, `DRAG_DELTA` axis
      detection), click cycling (left = vertical, right = horizontal), keyboard
      cursor (arrows `UI_UPDATE`; Enter/`1` vertical, Space/`0`/`2` horizontal,
      backspace clear; Shift/Ctrl+arrow two-cell draw). Suppress no-op settings
      locally. Convert the pointer with the shared `fromCoord` (`BORDER` offset).
- [x] 5.3 `executeMove`: apply each `LineSet` to a cloned grid (ignoring black
      cells); set `completed` when `sticksValidate == COMPLETE`; `solve` sets the
      grid from the solved layout and marks `cheated`.
- [x] 5.4 `solve()` returns `{ kind: "solve", grid }` from a fresh `sticksSolveGame`
      on a clue-only copy; error if the board is invalid. Test Solve **through a
      real `Midend`** (playbook §3.6).
- [x] 5.5 `findMistakes` (design D5, playbook §3.5): re-solve from the fixed clues,
      flag every white cell whose player line contradicts the unique solution;
      `[]` when not uniquely deducible. Unit-test against a known solution.
- [x] 5.6 `textFormat` — the board text (`.`/`-`/`|`/`#`); `canFormatAsText` static
      `true` (design D9).

## 6. Rendering

- [x] 6.1 Palette in C enum order (`BACKGROUND, GRID, LINE, NUMBER, ERROR,
      CURSOR`). Derive `BACKGROUND` from the app background; do **not**
      luminance-adjust for dark mode (playbook §3.3 — the app owns it).
- [x] 6.2 `computeSize`/`setTileSize`: the `NARROW_BORDERS` arm —
      `BORDER = tilesize/10` (note: not `0`), `w*tilesize + 2*BORDER − 1` by
      `h*tilesize + 2*BORDER − 1` (design D8).
- [x] 6.3 `redraw`: per-tile rendering (black-cell fill, green line bar for
      `F_HOR`/`F_VER`, clue number text, cursor outline) packed into an
      `Int32Array` cache key (cell state + cursor bit + flash bit + error bit —
      playbook §3.2). **Every overlay in the diff key** or it won't repaint.
- [x] 6.4 The `findMistakes` error overlay (flagged cells red, `COL_ERROR`) folded
      into the cache word (design D5).
- [x] 6.5 The completion flash over `FLASH_TIME = 0.5 s` (lines blink off on
      alternate 0.1 s frames). No slide/interpolation — `animLength` is `0`
      (design D8).
- [x] 6.6 Tier-2.5 render-scenario tests + snapshots: an opening frame, a
      lines+clue frame, a `findMistakes`-flagged frame, and a completion-flash
      frame.

## 7. Differential

- [x] 7.1 `puzzles/auxiliary/sticks-trace.c` on the established pattern
      (`#include "../unreleased/sticks.c"`); add its `cliprogram()` line.
- [x] 7.2 Fixture matrix: both presets plus a size/`blackpc`/`symm` sweep
      (design D6), each seed dumping the generated desc.
- [x] 7.3 `sticks-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte for each fixture (validates generator + solver + codec at once).

## 8. Registration and stage 1 close-out

- [x] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unreleased/sticks.c` stays as the C/WASM fallback — stage-2 gate.
- [x] 8.2 Behavioural tests: codec round-trip, solver on hand-built boards,
      generator determinism, move/interpret transitions, `findMistakes`,
      completion, midend lifecycle + save round-trip.
- [x] 8.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [x] 8.4 `openspec validate add-sticks-ts-port --strict`.
- [x] 8.5 Dev-verify in the browser: drag-to-draw, left/right click, keyboard
      cursor + Enter/Space, Solve, Check & Save (mistake block + clear), completion
      flash, Custom params (size/blackpc/symmetry).
- [x] 8.6 Update `docs/porting/game-port-playbook.md` if the port surfaces a new
      lesson (the `tilesize/10` narrow border, the drag-to-draw input shape).

## 9. Stage 2 — on owner acceptance only (design D10)

- [ ] 9.1 Add `TS_PORTED` to the `puzzle(sticks …)` entry in
      `puzzles/unreleased/CMakeLists.txt` and drop its `solver(sticks …)` line.
- [ ] 9.2 Delete `puzzles/unreleased/sticks.c` and the `sticks-trace` harness (+ its
      `cliprogram()` line).
- [ ] 9.3 `rm -rf build/wasm/` and rebuild — sticks in the catalog, no
      `sticks.wasm`. Icons already exist. Confirm the frozen differential fixture
      still runs C-free.
- [ ] 9.4 Archive, then commit port + archive together.
