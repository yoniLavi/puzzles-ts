# Tasks — add-seismic-ts-port

## 1. Scaffold and survey

- [x] 1.1 `scripts/new-game-port.sh seismic` to stamp `src/native/games/seismic/`
      with typed `Game<…>` stubs. Mathrax turned out to be the closer exemplar
      than Towers/Keen (narrow borders, an indicator strip below the board, the
      same Solo-scheme input) and was followed instead.
- [x] 1.2 Confirm the long-tail-risk checklist (design Context): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters; note the
      unported `game_print` (design D8). Record any surprise in `design.md`.

## 2. Params, state and the desc codec

- [x] 2.1 `SeismicParams { w, h, diff, mode }`; `encodeParams`/`decodeParams`
      (`%dx%d` + `T` for Tectonic + `d<char>` for difficulty on full; square
      fallback, `T` before `d` — design D10).
- [x] 2.2 `validateParams`: `w ≥ 4`, `h ≥ 4`, `diff < DIFFCOUNT` — **plus**
      `w·h ≤ 49` (`MAX_CELLS`), which the design left open and measurement
      settled: above ~50 cells the generator provably never succeeds, so the
      Custom dialog rejects with a reason rather than freezing (finding F1).
- [x] 2.3 The twelve presets ({4,6,7}² × {Easy,Hard} × {Seismic,Tectonic}),
      default index 4 = `6×6 Easy Seismic`; preset names
      `"Seismic: 6x6 Easy"` / `"Tectonic: 4x4 Hard"`.
- [x] 2.4 `describeParams` emits the keys `augmentation.ts` reads —
      `{ "game-mode": <0|1>, width, height, difficulty: <0|1> }` (playbook §3.4) —
      and verify the header renders (no literal `{game-mode}`). `paramConfig`
      (Width / Height strings via `parseConfigInt`; Difficulty / Game-mode
      choices), keyed `width`/`height`/`difficulty`/`game-mode`.
- [x] 2.5 State: immutable `grid` (`Uint8Array`), `flags` (fixed + live
      dup/distance error bits), `marks` (`Uint16Array` candidate bitmask), the
      region `Dsf` (shared by reference across states — §3.1), `completed`,
      `cheated`. `NUM_BIT`/`AREA_BITS` bit helpers. Record the "no minimal-element
      map" reasoning (design D1).
- [x] 2.6 Desc codec (design D3): the wall-run/empty-run border encoding
      (`ws = (w−1)·h + w·(h−1)`, horizontal borders then vertical) composed with
      `,⟨clues⟩` (letter runs + digits). Port `new_game_desc`'s encode and the
      decode as **exact inverses** — byte-match surface. Build the region `Dsf`
      from the decoded walls.
- [x] 2.7 `validateDesc`: reproduce all four verdicts — unknown wall character
      (`INVALID_WALLS`), a region larger than 9 (`INVALID_REGION`), a clue larger
      than its region (`INVALID_CLUESIZE`), else valid.

## 3. The solver (marks-based deduction)

- [x] 3.1 `SeismicSolver` over the candidate bitmask + grid + region `Dsf`:
      `placeNumber` (place + clear the keep-apart cells + clear the rest of the
      region), mode-parameterised keep-apart (distance N vs 8-neighbour — design
      D2), `solverInit` (seed marks to `AREA_BITS(regionSize)`, apply givens).
- [x] 3.2 Deduction rungs: **Easy** naked single (`seismic_solver_marks`) +
      hidden-single-in-region (`seismic_solver_areas`); **Hard** trial placement
      (`seismic_solver_attempt`). Loop to a fixpoint, grading Easy/Hard.
      Discriminated progress codes, not the C's `-1/0/1`.
- [x] 3.3 `validateGame` → `COMPLETE` / `UNFINISHED` / `INVALID` (region
      duplicates, distance/adjacency violations) — the win test and the generator
      gate.
- [x] 3.4 Tier-1 tests: a hand-built solvable board solves to the expected
      difficulty; an ambiguous board returns `-1`; the keep-apart propagation is
      correct in both modes.

## 4. The generator

- [x] 4.1 Full-solution fill: `seismic_gen_numbers` (shuffle cells, place lowest
      legal; may fail → retry) and `tectonic_gen_numbers` (sequential random
      placement + the descending-frequency remap — design D2, byte-match).
- [x] 4.2 `seismic_gen_areas`: singleton regions, shuffled border list, merge when
      two regions share no number; fail if a region isn't a complete 1…N set. Over
      the shared `Dsf` (design D1).
- [x] 4.3 `seismic_gen_clues` (strip while solvable at `diff`) + `seismic_gen_diff`
      (solvable at `diff`, not at `diff−1`); `seismic_gen_puzzle` retried in
      `newDesc` until it succeeds. Reproduce the RNG draw order exactly over
      `random.ts` (design D4). No `aux` (solve re-derives — playbook §3.6).
- [x] 4.4 Tier-1: every preset generates a soluble board at the expected
      difficulty band; same seed → same desc (determinism).

## 5. Input, moves, win, keypad

- [x] 5.1 Move model: the `SeismicMove` discriminated union
      (`set`/`pencil`/`solve`/`markAll` — design D5), not a move string.
- [x] 5.2 `interpretMove` (Solo scheme): `LEFT_BUTTON` selects for number entry,
      `RIGHT_BUTTON` selects for pencil; cursor keys move the highlight;
      `CURSOR_SELECT` toggles pencil mode; digits `1`–`9` / backspace / space /
      `0` enter or clear; `M` mark-all. Cap entry at the cell's region size; reject
      on a fixed cell or a no-op (return `null`/`UI_UPDATE`, local suppression).
- [x] 5.3 `executeMove`: apply `set`/`pencil`/`markAll`/`solve` immutably; set
      `completed` when `validateGame` is `COMPLETE`; `solve` sets `cheated`.
- [x] 5.4 `solve()`: run the solver to completion and emit a `solve` move filling
      the grid; error if unsolvable. Test **through a real `Midend`** if any aux
      threading is involved (playbook §3.6 — here there is none).
- [x] 5.5 `requestKeys`: `digitKeys(mode === TECTONIC ? 5 : 9)` (playbook §3.8).
- [x] 5.6 `textFormat` — the board text (`game_text_format`); `canFormatAsText`
      static `true` (works on any size).

## 6. Note-taking UX (playbook §3.7)

- [x] 6.1 Mark-all button (`canMarkAll: true`) — fill-only, faithful to the C's
      `M` (fills `AREA_BITS(regionSize)` per empty cell; no adaptive cleanup —
      design D9, and see finding F4 for why the *stated* reason was wrong and the
      real blocker is that the shared helper is square-only).
- [x] 6.2 Sticky pencil mode — a `pencilSticky` `Ui` boolean (default true) via
      the `prefs` hook; right-click toggles persistent pencil mode, left-click
      moves the highlight; right-click on a filled/given cell toggles but does not
      select it.
- [x] 6.3 Pencil-mode indicator glyph, repainted explicitly at the end of `redraw`
      with last-drawn on/off tracking (no cache-safe cell — design D9).

## 7. Rendering

- [x] 7.1 Palette in C enum order (background / highlight / lowlight / border /
      num-fixed / num-guess / num-error / num-pencil / errordist) via `mkhighlight`
      (playbook §3.3). No dark-mode luminance adjustment — the app owns it.
- [x] 7.2 `computeSize`/`setTileSize`: the **`NARROW_BORDERS`** arm
      (`BORDER = GRIDEXTRA*2`, `computeSize` subtracts `GRIDEXTRA*2` — design D8,
      playbook §3.2).
- [x] 7.3 `redraw`: precompute the static region-boundary geometry (`GRIDEXTRA`
      insets + corner-pixel fills off `Dsf` membership); per-tile `Int32Array`
      cache packing value + pencil bitmask + cursor/pencil-cursor highlight + live
      dup/distance-error bits. Numbers coloured fixed/error/guess; pencil-mark grid
      layout; own background fill in `!ds.started`.
- [x] 7.4 The `findMistakes` overlay via an `OverlaySidecar` in the diff key
      (playbook §3.2 — must repaint a frame after the move).
- [x] 7.5 The three-phase completion flash (`FLASH_TIME = 0.7`, `FLASH_FRAME =
      0.1`). No move animation (`animLength = 0` — design D8).
- [x] 7.6 Tier-2.5 render-scenario tests + snapshots: a selected cell, a pencil
      cursor, a cell with pencil marks, a mistake-overlay frame (paint twice —
      §3.2), and a completion-flash frame.

## 8. findMistakes (design D6)

- [x] 8.1 `findMistakes(state)`: re-solve from the **givens only** to the unique
      solution; flag placed cells that contradict it (`kind: "cell"`) and empty
      cells whose non-empty pencil notes have crossed out the solution value
      (`kind: "note"`); `[]` when not uniquely deducible.
- [x] 8.2 Keep the C's always-on live dup/distance error highlighting as a
      **separate** display feature (render red) — it must not gate Check-&-Save and
      `findMistakes` must not read the live flags.
- [x] 8.3 Tests: a wrong placement is flagged; a crossed-out-note cell is flagged;
      a correct partial board reports `[]`; a paint-twice render test (§3.2).

## 9. Differential

- [x] 9.1 `puzzles/auxiliary/seismic-trace.c` (`#include "../unreleased/seismic.c"`
      — the first unreleased-game trace harness); add its `cliprogram()` line.
- [x] 9.2 Fixture matrix: all twelve presets plus a **≤ 7×7** size sweep, both
      modes, each seed dumping the generated desc (design D7, Risks — budget
      generous per-fixture time).
- [x] 9.3 `seismic-differential.test.ts`: TS `newDesc` reproduces the C desc
      **byte-for-byte** for each fixture (validates generator + solver + codec at
      once over `random.ts`).

## 10. Registration and stage 1 close-out

- [x] 10.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). The
      C/WASM build stays as the in-app fallback (playbook §1.1) — no CMake change
      yet.
- [x] 10.2 Behavioural tests: codec round-trip, param round-trip, solver on hand
      boards, generator determinism, move/no-op suppression, win, keypad, midend
      lifecycle + save round-trip.
- [x] 10.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [x] 10.4 `openspec validate add-seismic-ts-port --strict`.
- [x] 10.5 Dev-verify in the browser (both modes): select / enter /
      cap-at-region / pencil marks / mark-all (per-region candidate sets) /
      9-key and 5-key keypads / Solve completing the board / Check-&-Save
      refusing a wrong board with the red overlay / the Custom dialog rejecting
      10×10 with its reason / all twelve presets in the type menu.
      0 console errors.
- [x] 10.6 Update `docs/porting/game-port-playbook.md` if the port surfaced a
      reusable lesson (the first unreleased-game trace harness path; region-over-
      `Dsf` byte-match; two-mode differential surface).

## 11. Stage 2 — on owner acceptance only

- [x] 11.1 Added `TS_PORTED` to `puzzle(seismic …)` in
      `puzzles/unreleased/CMakeLists.txt` and dropped `solver(seismic …)`. The
      `ts_ported_names` union was already wired for the unreleased dir (abcd was
      the first such flip), so this was the one-line flag.
- [x] 11.2 Deleted `puzzles/unreleased/seismic.c` (2,069 lines) and
      `puzzles/auxiliary/seismic-trace.c` plus its `cliprogram()` line. The frozen
      `__fixtures__/seismic-c-reference.json` stays as the gated differential's
      baseline.
- [x] 11.3 `rm -rf build/wasm/` and rebuilt: seismic keeps its catalog entry
      (name / description / objective / `collection: unreleased`) with **no**
      `seismic.wasm`. Icons already existed. Browser-verified with the C gone —
      the board generates, a digit enters, mark-all fills per-region candidate
      sets; 0 console errors. The frozen differential runs C-free and is green.
- [x] 11.4 Archived as `2026-07-27-add-seismic-ts-port`; stage 2 + archive
      committed together.

## 12. Findings recorded during implementation

- [x] 12.1 Generator scaling measured (design F1): `MAX_CELLS = 49` in
      `validateParams`, `MAX_ATTEMPTS = 5_000_000` sized from the worst measured
      legitimate board (1,184,978 attempts).
- [x] 12.2 The wall codec's `'z'` round-trip bug fixed in the range where the C's
      own reader cannot invert its writer (F2), guarded by a C-rules decoder.
- [x] 12.3 `game_redraw`'s `char` truncation of the 9-bit pencil mask fixed (F3),
      with a hand-built nine-cell-region board as the regression test.
- [x] 12.4 The C's own generation milliseconds recorded per fixture, so the 7×7
      cost is attributable rather than guessed at (F5).
- [x] 12.5 Owner decision surfaced in `design.md`: whether to replace the region
      generator (the author's own recommendation) in a follow-up change.
