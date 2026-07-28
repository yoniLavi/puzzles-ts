# Tasks — add-boats-ts-port

## 1. Scaffold and survey

- [x] 1.1 `scripts/new-game-port.sh boats` to stamp `src/native/games/boats/`
      with typed `Game<…>` stubs; read [`galaxies/`](../../src/native/games/galaxies/)
      end-to-end and a deductive exemplar with `findMistakes` (`towers/`, `unruly/`)
      first.
- [x] 1.2 Confirm the long-tail-risk checklist against `puzzles/unreleased/boats.c`
      (design intro): no `supersededDesc`/`set_public_desc`, no state-string undo,
      no `#ifdef EDITOR` letters, and `game_print` present but **not** ported (no
      print promise). Record any surprise in `design.md`.

## 2. Params, state and the desc codec

- [x] 2.1 `BoatsParams { w, h, fleet, diff, strip, fleetData }`;
      `encodeParams`/`decodeParams` for `<w>x<h>f<fleet>[d<c>][S],<fleet-config>`
      (`d`/`S` only on `full`; `diff` as a string-union, `fleetData` a `number[]`).
      Port `boats_decode_fleet`/`_encode_fleet`/`boats_default_fleet`
      (`boats.c:131`–`163`) exactly — fleet is byte-match surface (design D1).
- [x] 2.2 `validateParams` in upstream order (`boats.c:2802`): unknown difficulty →
      `w ≤ 99` → `h ≤ 99` → `fleet ≥ 1` → `fleet ≤ w||h` → `fleet ≤ 9` → fleet has
      ≥1 boat → `w ≥ 2` → `h ≥ 2` → **the fleet actually fits** (`boats_generate_fleet`
      with `rs = null`). Reproduce the fit check.
- [x] 2.3 `paramConfig` (Width, Height, Fleet size, Difficulty, Remove numbers,
      Fleet configuration) — keys matching the C config slugs (`fleet-size`,
      `difficulty`, `remove-numbers`, `fleet-configuration`; playbook §3.4);
      numeric `set` via `parseConfigInt`, difficulty as a choice index.
- [x] 2.4 `describeParams` emits the keys `augmentation.ts` reads — `width`,
      `height`, `fleet-size`, `difficulty` (0-based index), `remove-numbers` (0/1),
      `fleet-configuration` (comma string) — verified against the existing `boats`
      entry so the type-menu header substitutes (playbook §3.4).
- [x] 2.5 Presets — the twelve upstream presets (`boats.c:178`–`189`: 6×6/8×8 ×
      Easy/Normal/Hard, 10×10 × all four, 10×12 × Tricky/Hard), each with its fleet
      size and default fleet.
- [x] 2.6 `BoatsCell` union (`EMPTY`/`WATER`/`SHIP_VAGUE`/`SHIP_SINGLE`/`SHIP_TOP`/
      `SHIP_BOTTOM`/`SHIP_LEFT`/`SHIP_RIGHT`/`SHIP_CENTER`) and state
      (`grid`, immutable `gridclues` + `borderclues` shared by reference across
      states — §3.1 shared-frozen pattern, `fleetData`, `completed`, `cheated`).
      `cloneState`.
- [x] 2.7 Desc codec (design D1): decode = border clues (`w+h` `"N,"`/`"-,"` tokens)
      then run-length grid (`a`–`z` empty runs, uppercase given clues), matching
      `new_game` (`boats.c:401`); encode = the inverse, matching the tail of
      `new_game_desc` (`boats.c:3013`). Byte-match surface.
- [x] 2.8 `validateDesc`: unknown character, wrong number of grid squares
      (distinguish too-much/too-little), wrong number of border-clue slots
      (`boats.c:479`).

## 3. The four-tier deductive solver (design D2)

- [x] 3.1 `solveBoats(state, maxDiff)` → reached `Difficulty` or `IMPOSSIBLE`
      (discriminated, not a magic `-1`/int), the fixpoint loop of `boats_solve_game`
      (`boats.c:2488`). Decide `runDeductionFixpoint` vs a ported loop by reading the
      loop's `hascenters`/`hasnoclue` + border-clue restore bookkeeping (playbook §4);
      record which and why in `solver.ts`. **No guessing at any tier** — record that
      boats meets the guess-free policy.
- [x] 3.2 Easy rung: `boats_solver_initial`, `boats_solver_check_fill`,
      `boats_solver_check_counts`, `boats_solver_centers_trivial`,
      `boats_adjust_ships` (diagonal→water + segment-shape resolution).
- [x] 3.3 Normal rung (over the shared [`Dsf`](../../src/native/engine/dsf.ts) — design
      D3, **root-identity matters**, do not re-roll): `boats_solver_remove_singles`,
      `boats_solver_centers_normal`, `boats_solver_min/max_expand_dsf`
      (`boats.c:1718`–`1866`), `boats_solver_find_max_fleet`, `boats_solver_split_runs`.
- [x] 3.4 Tricky rung: `boats_solver_shared_diagonals`, and the missing-border-clue
      deduction `boats_solver_borderclues_fill`/`_last` (fill, solve, restore).
- [x] 3.5 Hard rung: the scratch-grid hypothesis techniques
      `boats_solver_attempt_ship_rows` / `_attempt_water_rows` /
      `boats_solver_centers_attempt`.
- [x] 3.6 Tier-1 tests: a hand-built board solves at each tier; a contradictory
      board returns `IMPOSSIBLE`; the `dsf`-root-reading `boats_check_dsf` deduction
      is exercised.

## 4. The generator (design D6)

- [x] 4.1 `boatsGenerateFleet(state, rs, …)` (`boats.c:2705`) — random fleet
      placement; RNG draws reproduced in order (byte-match).
- [x] 4.2 `boatsCreateBorderclues` (`boats.c:2866`) — derive the `w+h` edge counts.
- [x] 4.3 `newDesc`: solver-gate to **exactly** the target difficulty
      (`solveBoats(state, diff) !== diff → restart`); when `strip`, remove border
      numbers one at a time keeping each removal only while still soluble, then the
      `boats_solver_borderclues_last` "not only-one-missing" guard (`boats.c:2990`).
      Reproduce rejected draws (playbook §4.3). No `aux` (design D7).
- [x] 4.4 Tier-1: every preset + a size/fleet sweep + both `strip` states generate a
      board solvable at exactly its target difficulty via a fresh `solveBoats`.

## 5. Input, moves, win and mistakes

- [x] 5.1 Move model: `BoatsMove` discriminated union
      (`{ kind: "fill"; x0,y0,x1,y1; from; to } | { kind: "solve"; grid }`), not the
      `P…` string (design D4).
- [x] 5.2 `interpretMove` (`boats.c:3203`): left-click cell-cycle (empty→ship→water),
      right-click water toggle, press-drag constrained to one row/column with a
      preview (`UI_UPDATE`), release → a `fill` move via `boats_validate_move`
      (no-op rejected → `UI_UPDATE`); the far-edge click-target widening
      (`gx==w→w-1`). Convert with the shared `fromCoord` (`BORDER = 0`, design D9).
- [x] 5.3 Keyboard: cursor (arrows), `CURSOR_SELECT`/`\b` ship, `CURSOR_SELECT2`
      water, Ctrl/Shift+arrow line-fill (`boats.c:3300`+).
- [x] 5.4 `executeMove`: apply the line fill, then `boats_adjust_ships`
      (`boats.c:773`, vague→shape resolution + diagonal-neighbour water) and the
      fleet auto-cross-off accounting; set `completed` on
      `boats_validate_state == STATUS_COMPLETE` (`boats.c:1300`).
- [x] 5.5 `findMistakes` (design D5): **re-solve to the unique solution** and flag
      every placed cell that contradicts it (playbook §3.5 — the Check & Save basis,
      `[]` when not yet uniquely forced). **Additionally** render the C's live
      rule-violations for immediate feedback — `boats_count_ships` (count exceeded),
      `boats_check_collision` (diagonal adjacency), `boats_check_fleet`/`boats_check_dsf`
      (overpopulated fleet), `boats_validate_gridclues` (given-clue contradiction) —
      which are a subset of the re-solve set. Ship the paint-twice overlay test
      (playbook §3.2). `canFindMistakes` true → Check & Save hard-blocks.
- [x] 5.6 `solve()` re-runs `solveBoats(_, Hard)` and returns `{ kind: "solve", grid }`;
      error on insoluble. Test Solve **through a real `Midend`** (playbook §3.6).
- [x] 5.7 `textFormat` — `board_text_format` (`boats.c:572`); widen to `string`,
      static `canFormatAsText: true`.

## 6. Rendering (design D9)

- [x] 6.1 Palette in `COL_*` enum order (`boats.c:52` — 15 colours, water at index 4
      to match `augmentation.ts` `paletteOverrides: {4: 0.6}`). Derive from the app
      background; do **not** luminance-adjust for dark mode (playbook §3.3).
- [x] 6.2 `computeSize`/`setTileSize`: the **`NARROW_BORDERS`** arm (`BORDER = 0`);
      width `(w+1)*TILESIZE`, height `GUTTER + (h+1+fleetHeight)*TILESIZE − padding`
      (`boats.c:3944`).
- [x] 6.3 `redraw`: per-tile piece rendering (water, six segment shapes + single +
      vague rectangle, given-clue vs guess colouring), the row/column count clues on
      the right/bottom edges, and the fleet display at the bottom (segments, crossed
      off + striped when completed). Packed `Int32Array` cache key; **every error /
      cursor / fleet overlay in the diff key** via an `OverlaySidecar` (playbook §3.2).
- [x] 6.4 Live error overlays (`COL_SHIP_ERROR`/`COL_COUNT_ERROR`/
      `COL_COLLISION_ERROR`) drawn from the `findMistakes` set (design D5), and the
      cursor (`COL_CURSOR_A/B`).
- [x] 6.5 The completion flash over `FLASH_TIME` on the not-completed→completed
      transition. No move interpolation — `animLength` is `0`.
- [x] 6.6 Tier-2.5 render-scenario tests + snapshots: a fresh board with clues + fleet,
      a mid-solve frame with a live count/collision error, a mid-drag preview frame,
      and a completion-flash frame.

## 7. Differential (design D6)

- [x] 7.1 `puzzles/auxiliary/boats-trace.c` `#include`ing `../unreleased/boats.c`;
      add its `cliprogram(boats-trace boats-trace.c)` line. Build pure-C
      (`-DUSE_TS_RANDOM=0`, playbook §4.2).
- [x] 7.2 Fixture matrix: every preset, both `remove-numbers` states, and a
      size/fleet sweep — each seed dumping the generated desc.
- [x] 7.3 `boats-differential.test.ts` via
      [`describeDescDifferential`](../../src/native/engine/testing/differential.ts):
      TS `newDesc` reproduces the C desc **byte-for-byte**, plus a follow-on
      `validateDesc` check. Green validates generator + solver + codec + dsf root.

## 8. Registration and stage 1 close-out

- [x] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzle(boats …)` stays in `unreleased/CMakeLists.txt` **without** `TS_PORTED`
      — the C/WASM build remains the fallback (design D8). No catalog move.
- [x] 8.2 Behavioural tests: params/desc round-trip, solver per tier, generator
      determinism, `interpretMove` cell-cycle + line-fill + keyboard, `executeMove`
      shape-resolution + fleet cross-off + win, `findMistakes` paint-twice, midend
      lifecycle + save round-trip.
- [x] 8.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [x] 8.4 `openspec validate add-boats-ts-port --strict`.
- [x] 8.5 Dev-verify in the browser: click-cycle, right-click water, drag-fill a
      line, keyboard cursor + Ctrl/Shift-fill, live count/collision errors, fleet
      cross-off, Check & Save hard-block on a wrong board, completion flash, Custom
      params. 0 console errors.
- [x] 8.6 Update `docs/porting/game-port-playbook.md` (the line-fill drag input, the
      re-solve `findMistakes` basis with the C's live rule-errors additionally
      rendered, the `dsf` root-identity in a Battleships solver, and the
      "flag-in-place, no catalog move" stage-2 for a third-party `unreleased/` game
      that already ships C/WASM).

## Stage 2 — on owner acceptance only

- [x] 9.1 Add `TS_PORTED` to the existing `puzzle(boats …)` entry in
      `puzzles/unreleased/CMakeLists.txt` (no move; drop `solver(boats … dsf.c)`).
- [x] 9.2 Delete `puzzles/unreleased/boats.c` and the `boats-trace` harness (+ its
      `cliprogram` line).
- [x] 9.3 `rm -rf build/wasm/` and rebuild — boats in the catalog, no `boats.wasm`;
      the frozen differential fixture still runs C-free. Icons already exist.
- [x] 9.4 Archive, then commit port + archive together.
