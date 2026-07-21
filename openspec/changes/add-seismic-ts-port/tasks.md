# Tasks — add-seismic-ts-port

## 1. Scaffold and survey

- [ ] 1.1 `scripts/new-game-port.sh seismic` to stamp `src/native/games/seismic/`
      with typed `Game<…>` stubs; read `galaxies/` end-to-end and a pencil-mark
      exemplar (`towers/`, `keen/`) first.
- [ ] 1.2 Confirm the long-tail-risk checklist (design Context): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters; note the
      unported `game_print` (design D8). Record any surprise in `design.md`.

## 2. Params, state and the desc codec

- [ ] 2.1 `SeismicParams { w, h, diff, mode }`; `encodeParams`/`decodeParams`
      (`%dx%d` + `T` for Tectonic + `d<char>` for difficulty on full; square
      fallback, `T` before `d` — design D10).
- [ ] 2.2 `validateParams`: `w ≥ 4`, `h ≥ 4`, `diff < DIFFCOUNT` (no upper bound —
      design Risks).
- [ ] 2.3 The twelve presets ({4,6,7}² × {Easy,Hard} × {Seismic,Tectonic}),
      default index 4 = `6×6 Easy Seismic`; preset names
      `"Seismic: 6x6 Easy"` / `"Tectonic: 4x4 Hard"`.
- [ ] 2.4 `describeParams` emits the keys `augmentation.ts` reads —
      `{ "game-mode": <0|1>, width, height, difficulty: <0|1> }` (playbook §3.4) —
      and verify the header renders (no literal `{game-mode}`). `paramConfig`
      (Width / Height strings via `parseConfigInt`; Difficulty / Game-mode
      choices), keyed `width`/`height`/`difficulty`/`game-mode`.
- [ ] 2.5 State: immutable `grid` (`Uint8Array`), `flags` (fixed + live
      dup/distance error bits), `marks` (`Uint16Array` candidate bitmask), the
      region `Dsf` (shared by reference across states — §3.1), `completed`,
      `cheated`. `NUM_BIT`/`AREA_BITS` bit helpers. Record the "no minimal-element
      map" reasoning (design D1).
- [ ] 2.6 Desc codec (design D3): the wall-run/empty-run border encoding
      (`ws = (w−1)·h + w·(h−1)`, horizontal borders then vertical) composed with
      `,⟨clues⟩` (letter runs + digits). Port `new_game_desc`'s encode and the
      decode as **exact inverses** — byte-match surface. Build the region `Dsf`
      from the decoded walls.
- [ ] 2.7 `validateDesc`: reproduce all four verdicts — unknown wall character
      (`INVALID_WALLS`), a region larger than 9 (`INVALID_REGION`), a clue larger
      than its region (`INVALID_CLUESIZE`), else valid.

## 3. The solver (marks-based deduction)

- [ ] 3.1 `SeismicSolver` over the candidate bitmask + grid + region `Dsf`:
      `placeNumber` (place + clear the keep-apart cells + clear the rest of the
      region), mode-parameterised keep-apart (distance N vs 8-neighbour — design
      D2), `solverInit` (seed marks to `AREA_BITS(regionSize)`, apply givens).
- [ ] 3.2 Deduction rungs: **Easy** naked single (`seismic_solver_marks`) +
      hidden-single-in-region (`seismic_solver_areas`); **Hard** trial placement
      (`seismic_solver_attempt`). Loop to a fixpoint, grading Easy/Hard.
      Discriminated progress codes, not the C's `-1/0/1`.
- [ ] 3.3 `validateGame` → `COMPLETE` / `UNFINISHED` / `INVALID` (region
      duplicates, distance/adjacency violations) — the win test and the generator
      gate.
- [ ] 3.4 Tier-1 tests: a hand-built solvable board solves to the expected
      difficulty; an ambiguous board returns `-1`; the keep-apart propagation is
      correct in both modes.

## 4. The generator

- [ ] 4.1 Full-solution fill: `seismic_gen_numbers` (shuffle cells, place lowest
      legal; may fail → retry) and `tectonic_gen_numbers` (sequential random
      placement + the descending-frequency remap — design D2, byte-match).
- [ ] 4.2 `seismic_gen_areas`: singleton regions, shuffled border list, merge when
      two regions share no number; fail if a region isn't a complete 1…N set. Over
      the shared `Dsf` (design D1).
- [ ] 4.3 `seismic_gen_clues` (strip while solvable at `diff`) + `seismic_gen_diff`
      (solvable at `diff`, not at `diff−1`); `seismic_gen_puzzle` retried in
      `newDesc` until it succeeds. Reproduce the RNG draw order exactly over
      `random.ts` (design D4). No `aux` (solve re-derives — playbook §3.6).
- [ ] 4.4 Tier-1: every preset generates a soluble board at the expected
      difficulty band; same seed → same desc (determinism).

## 5. Input, moves, win, keypad

- [ ] 5.1 Move model: the `SeismicMove` discriminated union
      (`set`/`pencil`/`solve`/`markAll` — design D5), not a move string.
- [ ] 5.2 `interpretMove` (Solo scheme): `LEFT_BUTTON` selects for number entry,
      `RIGHT_BUTTON` selects for pencil; cursor keys move the highlight;
      `CURSOR_SELECT` toggles pencil mode; digits `1`–`9` / backspace / space /
      `0` enter or clear; `M` mark-all. Cap entry at the cell's region size; reject
      on a fixed cell or a no-op (return `null`/`UI_UPDATE`, local suppression).
- [ ] 5.3 `executeMove`: apply `set`/`pencil`/`markAll`/`solve` immutably; set
      `completed` when `validateGame` is `COMPLETE`; `solve` sets `cheated`.
- [ ] 5.4 `solve()`: run the solver to completion and emit a `solve` move filling
      the grid; error if unsolvable. Test **through a real `Midend`** if any aux
      threading is involved (playbook §3.6 — here there is none).
- [ ] 5.5 `requestKeys`: `digitKeys(mode === TECTONIC ? 5 : 9)` (playbook §3.8).
- [ ] 5.6 `textFormat` — the board text (`game_text_format`); `canFormatAsText`
      static `true` (works on any size).

## 6. Note-taking UX (playbook §3.7)

- [ ] 6.1 Mark-all button (`canMarkAll: true`) — fill-only, faithful to the C's
      `M` (fills `AREA_BITS(regionSize)` per empty cell; no adaptive cleanup —
      design D9).
- [ ] 6.2 Sticky pencil mode — a `pencilSticky` `Ui` boolean (default true) via
      the `prefs` hook; right-click toggles persistent pencil mode, left-click
      moves the highlight; right-click on a filled/given cell toggles but does not
      select it.
- [ ] 6.3 Pencil-mode indicator glyph, repainted explicitly at the end of `redraw`
      with last-drawn on/off tracking (no cache-safe cell — design D9).

## 7. Rendering

- [ ] 7.1 Palette in C enum order (background / highlight / lowlight / border /
      num-fixed / num-guess / num-error / num-pencil / errordist) via `mkhighlight`
      (playbook §3.3). No dark-mode luminance adjustment — the app owns it.
- [ ] 7.2 `computeSize`/`setTileSize`: the **`NARROW_BORDERS`** arm
      (`BORDER = GRIDEXTRA*2`, `computeSize` subtracts `GRIDEXTRA*2` — design D8,
      playbook §3.2).
- [ ] 7.3 `redraw`: precompute the static region-boundary geometry (`GRIDEXTRA`
      insets + corner-pixel fills off `Dsf` membership); per-tile `Int32Array`
      cache packing value + pencil bitmask + cursor/pencil-cursor highlight + live
      dup/distance-error bits. Numbers coloured fixed/error/guess; pencil-mark grid
      layout; own background fill in `!ds.started`.
- [ ] 7.4 The `findMistakes` overlay via an `OverlaySidecar` in the diff key
      (playbook §3.2 — must repaint a frame after the move).
- [ ] 7.5 The three-phase completion flash (`FLASH_TIME = 0.7`, `FLASH_FRAME =
      0.1`). No move animation (`animLength = 0` — design D8).
- [ ] 7.6 Tier-2.5 render-scenario tests + snapshots: a selected cell, a pencil
      cursor, a cell with pencil marks, a mistake-overlay frame (paint twice —
      §3.2), and a completion-flash frame.

## 8. findMistakes (design D6)

- [ ] 8.1 `findMistakes(state)`: re-solve from the **givens only** to the unique
      solution; flag placed cells that contradict it (`kind: "cell"`) and empty
      cells whose non-empty pencil notes have crossed out the solution value
      (`kind: "note"`); `[]` when not uniquely deducible.
- [ ] 8.2 Keep the C's always-on live dup/distance error highlighting as a
      **separate** display feature (render red) — it must not gate Check-&-Save and
      `findMistakes` must not read the live flags.
- [ ] 8.3 Tests: a wrong placement is flagged; a crossed-out-note cell is flagged;
      a correct partial board reports `[]`; a paint-twice render test (§3.2).

## 9. Differential

- [ ] 9.1 `puzzles/auxiliary/seismic-trace.c` (`#include "../unreleased/seismic.c"`
      — the first unreleased-game trace harness); add its `cliprogram()` line.
- [ ] 9.2 Fixture matrix: all twelve presets plus a **≤ 7×7** size sweep, both
      modes, each seed dumping the generated desc (design D7, Risks — budget
      generous per-fixture time).
- [ ] 9.3 `seismic-differential.test.ts`: TS `newDesc` reproduces the C desc
      **byte-for-byte** for each fixture (validates generator + solver + codec at
      once over `random.ts`).

## 10. Registration and stage 1 close-out

- [ ] 10.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). The
      C/WASM build stays as the in-app fallback (playbook §1.1) — no CMake change
      yet.
- [ ] 10.2 Behavioural tests: codec round-trip, param round-trip, solver on hand
      boards, generator determinism, move/no-op suppression, win, keypad, midend
      lifecycle + save round-trip.
- [ ] 10.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [ ] 10.4 `openspec validate add-seismic-ts-port --strict`.
- [ ] 10.5 Dev-verify in the browser (both modes): select / enter / cap-at-region
      / pencil marks / sticky pencil / mark-all / keypad / arrow cursor / Solve /
      win + flash / Check-&-Save refusal on a wrong board / Custom params.
- [ ] 10.6 Update `docs/porting/game-port-playbook.md` if the port surfaced a
      reusable lesson (the first unreleased-game trace harness path; region-over-
      `Dsf` byte-match; two-mode differential surface).

## 11. Stage 2 — on owner acceptance only

- [ ] 11.1 Add `TS_PORTED` to `puzzle(seismic …)` in
      `puzzles/unreleased/CMakeLists.txt` (wire the `ts_ported_names` union for the
      unreleased dir if this is the first such flip, mirroring the main-catalog
      seam) and drop `solver(seismic …)`.
- [ ] 11.2 Delete `puzzles/unreleased/seismic.c` and the `seismic-trace` harness
      (and its `cliprogram()` line).
- [ ] 11.3 `rm -rf build/wasm/` and rebuild — seismic served by TS, no
      `seismic.wasm`. Icons already exist. The frozen differential fixture still
      runs C-free.
- [ ] 11.4 Archive, then commit port + archive together.
