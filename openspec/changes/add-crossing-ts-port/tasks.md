# Tasks — add-crossing-ts-port

## 1. Scaffold and survey

- [x] 1.1 `scripts/new-game-port.sh crossing` to stamp `src/native/games/crossing/`
      with typed `Game<…>` stubs; read `galaxies/` end-to-end and a pencil-mark
      exemplar (`towers/`, `keen/`) plus a Solo-style input reference first.
- [x] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc` (`set_public_desc` is `NULL`), no state-string undo (no-op
      moves suppressed locally), no `#ifdef EDITOR` letters, no print promise
      (empty `game_print`, print flags `false`). Record in `design.md` if anything
      surprises.

## 2. Params, state and the desc codec

- [x] 2.1 `CrossingParams { w, h, sym }`; `encodeParams`/`decodeParams`
      (`%dx%d`, square fallback when `x` absent, trailing `S` for `sym` on a full
      encode); presets 5×5, 7×7, 9×9 (all non-sym).
- [x] 2.2 `validateParams` in upstream order: reject when **both** `w < 4` and
      `h < 4`, then `w < 2`, then `h < 2` (both dims ≥ 2, at least one ≥ 4) —
      design D10.
- [x] 2.3 `paramConfig` (Width, Height string items via `parseConfigInt`;
      "Symmetric walls" boolean) with keys matching the C config slugs
      (`width`/`height`/`symmetric-walls`); `describeParams` emits `width`,
      `height` (strings) and `symmetric-walls` as the **0/1 choice index** the
      existing `augmentation.ts` summary reads (playbook §3.4, design D10).
- [x] 2.4 State: immutable `grid` (`Uint8Array`, digit `0` = empty), `marks`
      (`Int32Array`, per-cell candidate/note bitmask), `completed`, `cheated`,
      and the shared-by-reference immutable puzzle (`walls`, sorted `numbers`) —
      §3.1 shared-frozen pattern. The move/`Ui` types (D5).
- [x] 2.5 Desc codec (design D1): decode `<walls>,<num1>,…` — letters `a`–`z` are
      wall runs of `1`–`26`, decimals are open-cell runs; the number list is
      comma-separated, stored **sorted by (length, lexicographic)** (`cmp_numbers`).
      Encode as the exact inverse (byte-match surface). Comment the `maxrow = 9`
      hard-code and the deliberately-absent too-short / `0`-char checks.
- [x] 2.6 `validateDesc`: reproduce upstream's verdicts — unknown wall char, too
      much cell data (missing `,` after `w*h` cells), an over-long number, a
      duplicate number. Do **not** add the checks upstream omits (D1).

## 3. The deductive solver

- [x] 3.1 `collectRuns(walls, w, h): CrossingRun[]` — maximal horizontal then
      vertical runs of length ≥ 2 (`{ row, start, len, horizontal }`), matching
      `crossing_collect_runs` order.
- [x] 3.2 `validate(state, runs, done?, runErrs?): SolveStatus` (`"valid" |
      "invalid" | "progress"`): per-run, which listed numbers of matching length
      fit; a full run matching none → `invalid` (+ `runErrs` flag); each number
      used > once → `invalid`; anything unfilled/unmatched → `progress`. Comment
      the `done[]`-sized-by-numbers / indexed-by-runs coincidence (D2).
- [x] 3.3 `solverMarks` (per-position candidate union across fitting numbers,
      intersected into cell candidates) + `solverConfirm` (naked single) + the
      fixpoint `solveGame(state) → SolveStatus`. Idiomatic bitmask `number`, not
      C's `NUM_BIT` ints where avoidable (keep the bit layout).
- [x] 3.4 Tier-1 tests: a hand-built tiny puzzle solves to `valid` with the known
      grid; an ambiguous/blank board returns `progress`; a contradictory board
      returns `invalid`.

## 4. The solver-gated generator

- [x] 4.1 `genWalls(w, h, sym, rng)` — one `shuffle` of the cell-index list, then
      the growth loop turning cells open until `checkPool` **and** `checkDsf` both
      hold; `checkPool` also *mutates* the grid (forces a wall on an all-but-one
      2×2) — port verbatim; `checkDsf` uses the shared `Dsf` (design D4, D8); the
      symmetric arm opens the 180° partner.
- [x] 4.2 `genGrid` (`1 + randomUpto(rng, 9)` per cell), `genNumbers` (run
      extraction + sort + duplicate/over-long rejection), and `genSolve` (accept
      only when `solveGame` returns `"valid"`).
- [x] 4.3 `newDesc`: retry `generate` until it succeeds, then emit the run-length
      walls + `,`-joined sorted number list (D1). No `aux` (the solver
      re-derives, playbook §3.6).
- [x] 4.4 Tier-1: every preset and a small size sweep (incl. a `sym` config)
      generate a uniquely-solvable board whose re-solve returns `"valid"`.

## 5. Input, moves, mistakes and completion

- [x] 5.1 Move model: the `CrossingMove` discriminated union
      (`set` / `pencil` / `solve`), not the `R`/`P`/`S` strings (design D5).
- [x] 5.2 `interpretMove` (design D5): left-click ink-select / right-click
      pencil-select an open cell (toggle on repeat), arrow-key cursor
      (`gridCursorMove`), Enter toggles ink/pencil, digit enters (ink) or toggles
      a note (pencil), Backspace/Space/`0` clears. Convert the pointer with the
      shared `fromCoord` honouring the **half-tile** margin (`- tilesize/2`, D9).
      Suppress no-ops locally by returning `null`.
- [x] 5.3 `requestKeys` returning `digitKeys(9)` (adds the `Clear` key) so the
      touch keypad survives the port (playbook §3.8).
- [x] 5.4 Pencil-mark UX (playbook §3.7, design D5): sticky pencil mode
      (`pencilSticky` `Ui` boolean via `prefs`, default on) + a pencil-mode
      indicator glyph. Do **not** ship adaptive mark-all cleanup (no clean
      uniqueness-region model; upstream has no `M` key) — record the reasoning.
- [x] 5.5 `executeMove`: apply set/pencil/solve immutably; set `completed` when
      `validate(state) == "valid"` after an ink move (D6); `solve()` re-runs the
      solver and returns `{ kind: "solve", grid }`, erroring only on an
      unsolvable board. Test Solve **through a real `Midend`**.
- [x] 5.6 `findMistakes(state)` (design D3): re-solve to the unique solution, flag
      contradicting placed digits (`kind: "cell"`) and notes crossing out the
      solution digit (`kind: "note"`); `[]` when not uniquely determined. Render
      via an `OverlaySidecar` in the diff key (playbook §3.2, §3.5).
- [x] 5.7 `textFormat` — the grid (`#`/digit/`.`) + the number list grouped by
      length; `canFormatAsText` stays static `true` (D6).

## 6. Rendering

- [x] 6.1 Palette in the C colour-enum order index-for-index (outer/inner bg,
      highlight/lowlight, grid, error, three wall shades, and nine per-digit
      low/mid/high triples from `bgcols`) — playbook §3.3, design D9. Derive from
      the app background; do not luminance-adjust for dark mode.
- [x] 6.2 `computeSize`/`setTileSize`: `(w+1) × (h+1+3)` tiles — half-tile margin
      + 3-row number panel; **not** `NARROW_BORDERS` (design D9, checked against
      the source).
- [x] 6.3 `redraw`: per-tile bevelled rendering (walls, coloured digits with
      outline, cursor highlight, pencil marks, run-error red rectangles), packed
      into an `Int32Array` cache key with **every** overlay (cursor, error, flash,
      findMistakes) in the diff key (playbook §3.2).
- [x] 6.4 The number-list panel below the grid: clue numbers grouped by length,
      done-state coloured (unused / used-once dimmed / duplicate-red from
      `validate`'s per-number `done`). **Finding F8: no divergence was needed** —
      upstream's `draw_numbers` already grows rows / shrinks the font to fit, and
      lays out 8 numbers on a 4x2 and 22 on a 9x9 legibly. Ported as-is with a
      loop guard.
- [x] 6.5 The completion flash over `FLASH_TIME = 0.72 s` (digit-colour cycle),
      fired only on the not-cheated completion transition. No move animation
      (`game_anim_length` is `0`). **Finding F2**: upstream's frame counter is
      declared `bool`, so its flash is a single static colour shift; the port
      animates the nine phases (a deliberate display divergence).
- [x] 6.6 Tier-2.5 render-scenario tests + snapshots: a mid-solve frame, a
      run-error frame, a `findMistakes` overlay frame (paint-twice — playbook
      §3.2), and a completion-flash frame.

## 7. Differential

- [x] 7.1 `puzzles/auxiliary/crossing-trace.c` (`#include "../unreleased/crossing.c"`)
      dumping the generated desc as JSON for `(w, h, sym, seed)` tuples; add its
      `cliprogram()` line. Build pure-C (`-DUSE_TS_RANDOM=0`, playbook §4.2).
- [x] 7.2 Fixture matrix: the three presets, a small size sweep, and at least one
      **symmetric-walls** config (design D7).
- [x] 7.3 `crossing-differential.test.ts`: TS `newDesc` reproduces the C desc
      **byte-for-byte** for every fixture (validates generator + solver + codec
      together, since generation is solver-gated). Use
      `describeDescDifferential` (playbook §4.1).

## 8. Registration and stage-1 close-out

- [x] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). The
      C/WASM `puzzle(crossing …)` entry stays as the fallback — stage-2 gate.
- [x] 8.2 Behavioural tests: codec round-trip, solver on known boards, generator
      determinism (same seed → same desc), input/no-op suppression, findMistakes
      logic + overlay lifecycle, midend save round-trip.
- [x] 8.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [x] 8.4 `openspec validate add-crossing-ts-port --strict`.
- [x] 8.5 Dev-verify in the browser: select / type digits / pencil marks / arrow
      cursor / Enter toggle, keypad, run-error highlight, Check & Save refusal on
      a wrong digit, Solve, completion flash, Custom params (incl. Symmetric
      walls), the number-list panel legibility.
- [x] 8.6 Update `docs/porting/game-port-playbook.md` with what crossing
      surfaced: `drawRectCorners` promoted to `engine/draw.ts` (F3), and the
      "a display-only counter with the wrong type" tell (F2).

## 8b. The author's documented problems (`puzzles/unreleased/docs/crossing.md`)

Read after the port first shipped — the `.c`'s TODO block alone had been used.
All three Status points triaged; see design F9-F12 and playbook §1.0.

- [x] 8b.1 **Read the game's own Status section** and record the gap; add the
      "read `docs/<game>.md` before the C" rule to the playbook (§1.0), naming
      what it says about the four remaining unreleased ports (seismic especially).
- [x] 8b.2 **Automatic cursor movement** (the author's second point): entering a
      digit advances the selection along the run; sticky direction set by the
      arrow keys, snapped where a cell has only one run, toggled by a repeat
      click at a crossing; behind an `auto-advance` pref, default on (design F10).
- [x] 8b.3 **Remove the per-digit colours** (the author's third point,
      owner-confirmed): a neutral raised tile with a black digit, `COL_PENCIL`
      for notes, and the completion flash re-founded as a highlight/lowlight
      sweep since it cycled those colours (design F11).
- [x] 8b.4 **The number list** (the author's first point): measured rather than
      asserted — the panel is legible across the whole generable range, and the
      framework limitation is closed by bounding the params instead (design F8).
- [x] 8b.5 **Reject ungenerable sizes** in `validateParams` (`MAX_AREA = 225`,
      the measured boundary), `full`-only so an existing desc still loads;
      upstream retries for ever there (design F12).
- [x] 8b.6 **Reject isolated open cells** (the `.c`'s first generator TODO, and
      owner-found in play): a candidate with an open cell in no run is retried;
      upstream's behaviour stays reachable behind `upstreamIsolatedCells`, which
      the differential sets, plus a test that the flag still changes the desc
      (design F13).
- [x] 8b.7 Re-verify in the browser: auto-advance across and down, the direction
      toggle, the neutral tiles, the flash sweep, and the size refusal.

## 9. Stage 2 — on owner acceptance only

- [ ] 9.1 Add `TS_PORTED` to `puzzle(crossing …)` in
      `puzzles/unreleased/CMakeLists.txt` and drop the `solver(crossing dsf.c)`
      line.
- [ ] 9.2 Delete `puzzles/unreleased/crossing.c` (and the `crossing-trace`
      harness + its `cliprogram()` line, and any advisory `scripts/diff-crossing.*`).
- [ ] 9.3 `rm -rf build/wasm/` and rebuild — crossing in the catalog, no
      `crossing.wasm`. Icons already exist.
- [ ] 9.4 Archive, then commit port + archive together.
