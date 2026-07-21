# Tasks — add-rome-ts-port

## 1. Scaffold and survey

- [ ] 1.1 `scripts/new-game-port.sh rome` to stamp `src/native/games/rome/` with
      typed `Game<…>` stubs; read `galaxies/` (DSF + findMistakes exemplar) and a
      pencil-mark/keyboard-cursor game end-to-end first.
- [ ] 1.2 Confirm the long-tail-risk checklist (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters. Note
      that Rome has a real `game_print` but this fork ships no print feature, so
      it is not ported — record it if anything else surprises.

## 2. Params, state and the desc codec

- [ ] 2.1 `RomeParams { w, h, diff }`; `encodeParams`/`decodeParams`
      (`%dx%d` then `d<diffchar>` on `full`, `diffchars = "ent"`; `decodeParams`
      reads `h = w` when `x` is absent, and a `diff` only after `d`).
- [ ] 2.2 `validateParams` in upstream order and messages: `w ≥ 3`, `h ≥ 3`,
      `diff` in range.
- [ ] 2.3 `paramConfig` (Width, Height, Difficulty as a choice) with keys
      matching the C config slugs (playbook §3.4); the twelve presets
      (`{4,6,8,10}² × {Easy,Normal,Tricky}`), default preset index 3 (`6×6 Easy`);
      `describeParams` emits the keys `augmentation.ts` reads.
- [ ] 2.4 State (design D1): the static region-layout DSF (`regions`, shared by
      reference through `cloneState`), the arrow `grid`, the pencil `marks` set,
      `completed`, `cheated`. The transient arrow-connectivity DSF lives only in
      the validity check, never on state.
- [ ] 2.5 Desc codec (design D2): the region-border run-length (digit = wall run;
      `a`–`y` = 1–25 non-walls + one wall; `z` = 26 non-walls) merging edges into
      `regions`; then `,`; then the clue-grid run-length (letters = empty runs,
      `U`/`D`/`L`/`R`/`X` literals). Encode as the exact inverse — byte-match
      surface.
- [ ] 2.6 `validateDesc` with the distinct upstream messages: invalid wall
      characters, invalid clue characters, a region larger than 4 cells, a goal
      not in a size-1 region, and a decoded board that is not `INCOMPLETE`.

## 3. Validity check, findMistakes and the deductive solver

- [ ] 3.1 `validateGame(state)` (upstream `rome_validate_game`): rebuild the
      arrow-connectivity DSF, merging each arrow with the square it points at;
      classify off-grid arrows (`FE_BOUNDS`), duplicate arrows per region
      (`FE_DOUBLE`), loops (`FE_LOOP`, bounded by the `FE_LOOPSTART` guard so the
      walk cannot spin), and goal-reaching squares (`FD_TOGOAL`). Return
      `COMPLETE` / `INCOMPLETE` / `INVALID`.
- [ ] 3.2 `findMistakes(state)` (design D5): return each square in a `FE_BOUNDS` /
      `FE_DOUBLE` / `FE_LOOP` violation, single-sourced from `validateGame`. Wire
      Check & Save hard-block; the renderer consumes the same set for inline red.
- [ ] 3.3 The eight deduction rules as idiomatic functions with a discriminated
      progress return, in the exact firing order and tier gating (design D3):
      EASY = `single` / `doubles` / `loops`; NORMAL adds `find4Position` /
      `nakedPairs` / `expand`; TRICKY adds `opposites`.
- [ ] 3.4 `solve(state, maxdiff)`: the fixpoint loop (validity check → first
      firing rule → repeat) over per-square candidate sets, initialised to all
      four directions minus the border-illegal ones. No backtracking at any tier
      — confirm and record that Rome is guess-free at EASY/NORMAL/TRICKY.
- [ ] 3.5 Tier-1 tests: each rule fires on a hand-built minimal region; a full
      EASY/NORMAL/TRICKY board solves; an over-constrained board reports
      `INVALID`; findMistakes flags a duplicate, an off-grid arrow and a loop.

## 4. The generator

- [ ] 4.1 `generateArrows` (design D6): shuffle square order; fill with a
      shuffled-first legal arrow (EASY solver incrementally), place a goal where
      none is legal, cluster-avoidance via `joinArrows`/`suggest`; reject on
      too-many goals (`> max(1, wh/25)`) or a non-`COMPLETE` board.
- [ ] 4.2 `generateRegions`: one shuffle of the inter-cell edges, merge across an
      edge iff the two regions share no arrow and neither is a goal (regions stay
      ≤ 4 with distinct arrows).
- [ ] 4.3 `generateClues`: shuffle squares, blank each non-goal clue, keep it
      blanked iff still solvable at the target difficulty.
- [ ] 4.4 `generate` gate: solvable **at** `diff` and **not** at `diff-1`; retry
      the whole pipeline until it passes. `newDesc` emits the region-border + clue
      desc. No `aux` threading (`solve()` re-runs the solver, playbook §3.6).
- [ ] 4.5 Tier-1: every preset generates a soluble board at exactly its
      difficulty, and a fresh `solve` reproduces the recorded completion.

## 5. Moves, input and completion

- [ ] 5.1 Move model: the `RomeMove` discriminated union
      (`place` / `pencil` / `solve`), not a move string (design D4).
- [ ] 5.2 `interpretMove` drag phases (design D9): grab (`LEFT_BUTTON` place /
      `RIGHT_BUTTON` pencil on a non-fixed square), drag (offset-from-centre
      direction, `UI_UPDATE` as it changes), release (commit `place`/`pencil` or
      `UI_UPDATE` on a no-op). Convert the pointer with the shared `fromCoord`
      and the D8 `BORDER`.
- [ ] 5.3 `interpretMove` keyboard (design D9): cursor move; Enter toggles place,
      Space toggles pencil, then a direction key commits; bare numpad digits
      `8/2/4/6` → U/D/L/R and backspace erase (playbook §3.8a — `MOD_NUM_KEYPAD`
      never arrives). Return `null` for genuine no-ops (fixed clue, repeat arrow,
      off-grid).
- [ ] 5.4 `executeMove`: apply `place` (set/clear a non-fixed arrow), `pencil`
      (toggle one direction in `marks`, or clear), `solve` (overwrite non-fixed
      squares, set `completed`/`cheated`). Set `completed` when `validateGame`
      returns `COMPLETE`. State rebuilt immutably; pencil marks round-trip.
- [ ] 5.5 `solve()` returns `{ kind: "solve", arrows }` from a fresh
      `solve(dup, DIFFCOUNT)`; test Solve **through a real `Midend`** (playbook
      §3.6).
- [ ] 5.6 `textFormat` returns `undefined` (upstream `game_text_format` is
      `NULL`); `canFormatAsText` stays static per the interface default.

## 6. Rendering

- [ ] 6.1 Palette in C enum order (`BACKGROUND, HIGHLIGHT, LOWLIGHT, BORDER,
      ARROW_FIXED, ARROW_GUESS, ARROW_ERROR, ARROW_PENCIL, ARROW_ENTRY, ERRORBG,
      GOALBG, GOAL`) via `mkhighlight` + the derived error/goal shades. Derive
      from the app background; do **not** luminance-adjust for dark mode
      (playbook §3.3 — the app owns it).
- [ ] 6.2 `computeSize`/`setTileSize`: the `NARROW_BORDERS` arm
      (`BORDER = GRIDEXTRA*2`, design D8), with the outer-outline compensation.
- [ ] 6.3 `redraw`: per-tile rendering with region outlines (from the `regions`
      DSF), arrows, goals as circles, pencil-mark quadrant arrows, cursor/entry
      highlight, the goal-reaching (`sgoals` on) and loop (`sloops` off) colour
      aids, and inline red for `FE_BOUNDS`/`FE_DOUBLE` — packed into an
      `Int32Array` cache key. Every drag/cursor/flash overlay in the diff key or
      it won't repaint.
- [ ] 6.4 The completion flash over `FLASH_TIME = 0.7` (`% 3` phase). No arrow
      animation — `animLength` is `0` (design D8).
- [ ] 6.5 Tier-2.5 render-scenario tests + snapshots: a fixed-clue board, a
      placed-arrow-with-region-outline frame, a pencil-mark frame, a
      duplicate-arrow error frame, and a completion-flash frame.

## 7. Differential

- [ ] 7.1 `puzzles/auxiliary/rome-trace.c` on the established pattern
      (`#include "../unreleased/rome.c"`); add its `cliprogram()` line. Dumps the
      generated desc for `(w, h, diff, seed)` tuples.
- [ ] 7.2 Fixture matrix: a preset+difficulty matrix plus a small size sweep
      (design D10), each seed dumping the generated desc.
- [ ] 7.3 `rome-differential.test.ts`: TS `newDesc` reproduces the C desc
      **byte-for-byte** for each fixture (validates generator + solver + codec at
      once).

## 8. Registration and stage 1 close-out

- [ ] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). The
      C/WASM build stays as the in-app fallback — stage-2 gate (design D11).
- [ ] 8.2 Confirm/extend `engine/dsf.ts` for the min-canonical + size semantics
      Rome needs (design D7); record whether it was already covered or extended.
- [ ] 8.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [ ] 8.4 `openspec validate add-rome-ts-port --strict`.
- [ ] 8.5 Dev-verify in the browser: drag-to-place, right-drag/Space pencil
      marks, keyboard cursor + place, Solve, duplicate/off-grid/loop error
      highlighting, Check & Save hard-block on a mistake, completion flash, Custom
      params across all three difficulties.
- [ ] 8.6 Update `docs/porting/game-port-playbook.md` if the port surfaced
      anything new (the two-DSF pattern, the region-border codec, findMistakes on
      a rule-violation set).

## 9. Stage 2 — on owner acceptance only (design D11)

- [ ] 9.1 Add `TS_PORTED` to the existing `puzzle(rome …)` entry in
      `puzzles/unreleased/CMakeLists.txt` (the entry stays put — no CMakeLists
      move).
- [ ] 9.2 Delete `puzzles/unreleased/rome.c` and the `rome-trace` harness (and its
      `cliprogram()` line).
- [ ] 9.3 `rm -rf build/wasm/` and rebuild — rome in the catalog, no `rome.wasm`.
      Icons already exist; the frozen differential fixture still runs C-free.
- [ ] 9.4 Archive, then commit port + archive together.
