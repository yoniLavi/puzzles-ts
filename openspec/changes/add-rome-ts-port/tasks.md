# Tasks — add-rome-ts-port

## 1. Scaffold and survey

- [x] 1.1 Stamp `src/native/games/rome/` with the standard five-file port shape;
      read `galaxies/` (DSF + findMistakes exemplar) and `clusters/` (the
      nearest x-sheep game) end-to-end first.
- [x] 1.2 Confirm the long-tail-risk checklist (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters. Rome
      has a real `game_print` but this fork ships no print feature, so it is not
      ported. **Also checked the author's own `docs/rome.md` Status section
      (playbook §1.0): "This puzzle is fully implemented and playable" — no
      author-flagged defect to triage.**

## 2. Params, state and the desc codec

- [x] 2.1 `RomeParams { w, h, diff }`; `encodeParams`/`decodeParams`
      (`%dx%d` then `d<diffchar>` on `full`, `diffchars = "ent"`; `decodeParams`
      reads `h = w` when `x` is absent, and a `diff` only after `d`).
- [x] 2.2 `validateParams` in upstream order and messages: `w ≥ 3`, `h ≥ 3`,
      `diff` in range.
- [x] 2.3 `paramConfig` (Width, Height, Difficulty as a choice) with keys
      matching the C config slugs (playbook §3.4); the twelve presets
      (`{4,6,8,10}² × {Easy,Normal,Tricky}`), default preset index 3 (`6×6 Easy`);
      `describeParams` emits the `width`/`height`/`difficulty` keys
      `augmentation.ts` reads (guarded by `augmentation.test.ts`).
- [x] 2.4 State (design D1): the static region-layout DSF (`regions`, shared by
      reference through `cloneState`), the arrow `grid`, the pencil `marks` set,
      `completed`, `cheated`. The transient arrow-connectivity DSF lives only in
      the validity check, never on state.
- [x] 2.5 Desc codec (design D2): the region-border run-length (digit = wall run;
      `a`–`y` = 1–25 non-walls + one wall; `z` = 26 non-walls); then `,`; then
      the clue-grid run-length. Encoded as the exact inverse — **and the
      writer/reader disagreement above 25 reproduced on both sides rather than
      "completed" (design F4)**.
- [x] 2.6 `validateDesc` with the distinct upstream messages: invalid wall
      characters, invalid clue characters, a region larger than 4 cells, a goal
      not in a size-1 region, and a decoded board that is not `INCOMPLETE`.
      (Lives in `solver.ts`, whose validity verdict it turns on.)

## 3. Validity check, findMistakes and the deductive solver

- [x] 3.1 `validateGame(state, fullErrors, scratch?)` (upstream
      `rome_validate_game`): rebuild the arrow-connectivity DSF, merging each
      arrow with the square it points at; classify off-grid arrows
      (`FE_BOUNDS`), duplicate arrows per region (`FE_DOUBLE`), loops
      (`FE_LOOP`, bounded by the `FE_LOOPSTART` guard plus an explicit runaway
      cap), and goal-reaching squares (`FD_TOGOAL`). Returns
      `COMPLETE` / `INCOMPLETE` / `INVALID`.
- [x] 3.2 `findMistakes(state)` — **both layers, overriding design D5** (see
      F2): the rule-violation set *and* a re-solve from the fixed clues flagging
      every placed arrow the unique solution contradicts. Check & Save
      hard-blocks on either; the renderer draws upstream's passive red plus an
      inset ring for the flagged squares. Pencil marks deliberately not checked
      (Rome's notes are free-form).
- [x] 3.3 The eight deduction rules as idiomatic functions, in the exact firing
      order and tier gating (design D3): EASY = `single` / `doubles` / `loops`;
      NORMAL adds `find4Position` / `nakedPairs` / `expand`; TRICKY adds
      `opposites`. `nakedPairs` keeps upstream's skip of region members below
      the canonical root (design F1).
- [x] 3.4 `romeSolve(board, maxdiff)`: the fixpoint loop (validity check → first
      firing rule → repeat) over per-square candidate sets, initialised to all
      four directions minus the border-illegal ones. No backtracking at any tier
      — **confirmed: Rome is guess-free at EASY/NORMAL/TRICKY**, so the
      guess-free generation policy needs no carve-out.
- [x] 3.5 Tier-1 tests: the validity check's four flag classes; a full board
      solves at its tier and not below; an over-constrained board reports
      `INVALID`; findMistakes flags a duplicate, an off-grid arrow, a loop and a
      legal-looking wrong arrow. **Plus the Boats check (playbook §4.4): a board
      generated at EASY still solves at the maximum cap, so the solver is
      monotone in its difficulty cap and Solve / Check & Save cannot silently
      stall.**

## 4. The generator

- [x] 4.1 `generateArrows` (design D6): shuffle square order; fill with a
      shuffled-first legal arrow (EASY solver incrementally), place a goal where
      none is legal, cluster-avoidance via `joinArrows`/`suggest`; reject on
      too-many goals (`> max(1, wh/25)`) or a non-`COMPLETE` board. The
      never-reset scratch forest and `suggest` accumulator are reproduced
      verbatim (design F5).
- [x] 4.2 `generateRegions`: one shuffle of the inter-cell edges, merge across an
      edge iff the two regions share no arrow and neither is a goal.
- [x] 4.3 `generateClues`: shuffle squares, blank each non-goal clue, keep it
      blanked iff still solvable at the target difficulty.
- [x] 4.4 `generate` gate: solvable **at** `diff` and **not** at `diff-1`; retry
      the whole pipeline (bounded by `retryLimit`) until it passes. `newDesc`
      emits the region-border + clue desc. No `aux` threading — `solve()`
      re-derives the solution from the clues (playbook §3.6).
- [x] 4.5 Tier-1: every small preset generates a soluble board at exactly its
      difficulty; goal count within upstream's cap; every region ≤ 4 squares
      with each goal alone.

## 5. Moves, input and completion

- [x] 5.1 Move model: the `RomeMove` discriminated union
      (`place` / `pencil` / `solve`), not a move string (design D4).
- [x] 5.2 `interpretMove` drag phases (design D9): grab (`LEFT_BUTTON` place /
      `RIGHT_BUTTON` pencil on a non-fixed square), drag (direction read from
      the square the pointer is over, `UI_UPDATE` as it changes), release
      (commit `place`/`pencil` or `UI_UPDATE` on a no-op). Coordinates convert
      with C's **truncating** division, not the shared floor.
- [x] 5.3 `interpretMove` keyboard (design D9): cursor move; Enter toggles place,
      Space toggles pencil (and clears while place is armed), then a direction
      key commits; bare digits `8/2/4/6` → U/D/L/R and backspace erase (playbook
      §3.8a — `MOD_NUM_KEYPAD` never arrives). Returns `null`/`UI_UPDATE` for
      genuine no-ops (fixed clue, repeat arrow, off-grid).
- [x] 5.4 `executeMove`: apply `place` (set/clear a non-fixed arrow), `pencil`
      (toggle one direction in `marks`, or clear), `solve` (overwrite non-fixed
      squares, set `completed`/`cheated`). State rebuilt immutably; pencil marks
      round-trip through a real save.
- [x] 5.5 `solve()` re-derives the solution from the fixed clues; tested
      **through a real `Midend`** (playbook §3.6), asserting
      `solved-with-help` + `cheated`.
- [x] 5.6 No text format (upstream `can_format_as_text_ever` is false), so
      `canFormatAsText: false` and the hook is omitted.

## 6. Rendering

- [x] 6.1 Palette in C enum order (`BACKGROUND, HIGHLIGHT, LOWLIGHT, BORDER,
      ARROW_FIXED, ARROW_GUESS, ARROW_ERROR, ARROW_PENCIL, ARROW_ENTRY, ERRORBG,
      GOALBG, GOAL`) via `mkhighlight` + the derived error/goal shades. Derived
      from the app background; **not** luminance-adjusted for dark mode
      (playbook §3.3 — the app owns it).
- [x] 6.2 `computeSize`/`setTileSize`: the `NARROW_BORDERS` arm
      (`BORDER = GRIDEXTRA*2`, design D8), with the outer-outline compensation.
- [x] 6.3 `redraw`: per-tile rendering with region outlines drawn as *negative
      space* (a `COL_BORDER` flood the per-square rects inset into), arrows,
      goals as circles, pencil-mark quadrant arrows, cursor/entry highlight, the
      goal-reaching and loop colour aids, and inline red for
      `FE_BOUNDS`/`FE_DOUBLE` — packed into an `Int32Array` cache key with the
      flash phase, and the mistake overlay in an `OverlaySidecar` so it is in
      the diff key (playbook §3.2).
- [x] 6.4 The completion flash over `FLASH_TIME = 0.7` (`% 3` phase). No arrow
      animation — `animLength` is `0` (design D8).
- [x] 6.5 Tier-2 / 2.5 render tests + snapshot: the opening frame, the
      region-outline inset invariant, player vs clue arrow colours, a
      duplicate-arrow error frame, pencil marks, both highlight preferences,
      cursor and drag-entry frames, two distinct flash phases, and the
      **mistake-overlay paint-twice regression guard**.

## 7. Differential

- [x] 7.1 `puzzles/auxiliary/rome-trace.c` on the established pattern
      (`#include "../unreleased/rome.c"`), with its `cliprogram()` line. Dumps
      the generated desc, the C solver's grade and the C's own generation
      wall-clock per `(w, h, diff, seed)` tuple.
- [x] 7.2 Fixture matrix: all twelve presets plus a fourteen-entry size sweep
      (3×3 up to 12×12, including oblong boards that exercise the wall list's
      horizontal/vertical split).
- [x] 7.3 `rome-differential.test.ts`: TS `newDesc` reproduces the C desc
      **byte-for-byte** for each fixture — **26/26 on the first run** — plus
      `validateDesc` and a TS-vs-C solver grade per board.

## 8. Registration and stage 1 close-out

- [x] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). The
      C/WASM build stays as the in-app fallback — stage-2 gate (design D11).
- [x] 8.2 `engine/dsf.ts` needed **no** extension: design D7's min-canonical
      premise was wrong (`dsf_canonify` on a min-dsf is the ordinary
      union-by-size root), and Rome's single `dsf_minimal` use is exactly a
      same-class test. The shared `Dsf`'s `dsf.c`-matching root choice did turn
      out to be load-bearing for byte-match — see design F1.
- [x] 8.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [x] 8.4 `openspec validate add-rome-ts-port --strict`.
- [ ] 8.5 **Owner dev-verification in the browser** — drag-to-place,
      right-drag/Space pencil marks, keyboard cursor + place, Solve,
      duplicate/off-grid/loop error highlighting, the two highlight
      preferences, Check & Save hard-block on a mistake, completion flash,
      Custom params across all three difficulties.
- [x] 8.6 Update `docs/porting/game-port-playbook.md` with what the port
      surfaced (the `dsf_new_min` misreading, negative-space region outlines,
      and the free-form-notes carve-out from the §3.7 convention).

## 9. Stage 2 — on owner acceptance only (design D11)

- [ ] 9.1 Add `TS_PORTED` to the existing `puzzle(rome …)` entry in
      `puzzles/unreleased/CMakeLists.txt` (the entry stays put — no CMakeLists
      move).
- [ ] 9.2 Delete `puzzles/unreleased/rome.c` and the `rome-trace` harness (and its
      `cliprogram()` line).
- [ ] 9.3 `rm -rf build/wasm/` and rebuild — rome in the catalog, no `rome.wasm`.
      Icons already exist; the frozen differential fixture still runs C-free.
- [ ] 9.4 Archive, then commit port + archive together.
