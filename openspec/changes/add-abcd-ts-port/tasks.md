# Tasks — add-abcd-ts-port

## 1. Scaffold and survey

- [ ] 1.1 `scripts/new-game-port.sh abcd` to stamp `src/native/games/abcd/` with
      typed `Game<…>` stubs; read a logic-puzzle exemplar end-to-end first
      (`unequal/` or `keen/` for the Solo-style entry + pencil model, `galaxies/`
      for the findMistakes + render-cache pattern).
- [ ] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise (ABCD has a real `game_print` but this fork has no print pipeline).
      Record it in `design.md` if anything surprises.

## 2. Params, state and desc codec

- [ ] 2.1 `AbcdParams { w, h, n, diag, removenums }`; `encodeParams`/`decodeParams`
      (`%dx%dn%d` + `D` if diag + `R` if removenums, `R` **full-only**; decode reads
      optional `x h`, optional `n n`, optional `D`, optional `R`) — design D2.
- [ ] 2.2 `validateParams` in upstream order + messages: `w ≥ 2`, `h ≥ 2`,
      `n ≥ 3` (normal) but `n ≥ 5` when `diag`, `n ≤ 9`.
- [ ] 2.3 `paramConfig`: Width, Height, Letters (numeric via `parseConfigInt`),
      "Remove clues" (boolean → `removenums`), "Allow diagonal touching" (boolean →
      `diag = !bval` — port the **inversion**, D2).
- [ ] 2.4 Presets — the seven upstream presets (`4×4`/`5×5` Easy+Hard, `6×6` Easy,
      `7×7` n3, `7×7` n4; all non-diag); default = `5×5 n4` Easy. `describeParams`
      emits the keys `augmentation.ts` reads (playbook §3.4). Owner may trim (D2/open Q1).
- [ ] 2.5 State (D1): `grid` (`Int8Array`, letter index or `EMPTY`), `pencil`
      candidate cube (`Uint8Array`/bitset of `w·h·n`), immutable `numbers`
      (`(w+h)·n`, shared-frozen by reference across states — §3.1), `completed`,
      `cheated`. Named `horClue`/`verClue`/`cuboid` helpers. `cloneState` copies
      grid+pencil, aliases numbers.
- [ ] 2.6 Desc codec (D2): `newGame` parses the comma-separated clue list
      (digits→number, `-`→`NO_NUMBER`); the generator's encoder emits the exact
      inverse. Byte-match surface.
- [ ] 2.7 `validateDesc`: per-axis magnitude bound (`num ≤ 1 + w/2` for a row clue,
      `num ≤ 1 + h/2` for a column clue), exact count `(w+h)·n` — distinguishing
      "not enough" from "too many", plus unknown-character rejection.

## 3. The deductive solver (no leaf lib)

- [ ] 3.1 `solveGame(params, numbers)` → discriminated `SOLVED` / `AMBIGUOUS` /
      `CONTRADICTION` (not magic `-1/0/1`), over a working candidate cube +
      `remaining[]` line counts (D3). Self-contained — **no `latin`/`dsf`**; record
      why in `solver.ts`'s module doc.
- [ ] 3.2 `placeLetter(x, y, letter)`: set the cell, rule the letter out of the
      cell's other candidates and its orthogonal (and, under `diag`, diagonal)
      neighbours, and decrement the row/column `remaining` counts.
- [ ] 3.3 Technique 1 — satisfied/exhausted clue (`remaining == 0` → rule the letter
      out of the whole line). Technique 2 — single-candidate cell → `placeLetter`.
      Rerun 1+2 to fixpoint before technique 3 (`if (busy) continue;`).
- [ ] 3.4 Technique 3 — runs (`abcd_solver_runs`): per line, maximal candidate runs;
      line maximum `Σ ⌈Lᵢ/2⌉`; when it equals the required count, force every
      odd-length run's even offsets. Port the boundary/`⌈L/2⌉` arithmetic verbatim.
- [ ] 3.5 Final classification (`validate_puzzle`): contradiction (empty candidate
      set / clue over- or under-satisfied), else incomplete → `AMBIGUOUS`, else all
      cells filled + all clues met → `SOLVED`.
- [ ] 3.6 Tier-1 tests: a hand-built tiny puzzle solves to a known grid; a
      contradictory clue set → `CONTRADICTION`; an under-clued set → `AMBIGUOUS`.

## 4. The generator

- [ ] 4.1 `generateBoard` (D4): random fill (one `random_upto` per cell over the
      cell's legal candidates, `placeLetter` keeping it no-touch-legal), count clues
      into `numbers`, gate on `solveGame(...) === SOLVED`, retry on reject.
- [ ] 4.2 Remove-clues phase (only when `removenums`): **one `shuffle`** of the
      `(w+h)·n` index array, then greedily hide each clue, keeping the removal only
      while `solveGame` still returns `SOLVED`, else restoring it (byte-match surface).
- [ ] 4.3 `newDesc` emitting the comma-terminated clue list; no `aux` threading —
      `solve()` re-runs `solveGame` from the clues (playbook §3.6, D4).
- [ ] 4.4 Tier-1: every shipped preset (bounded attempts) and a small odd-size sweep
      generate a board the solver drives to a unique grid; a `removenums` board stays
      unique after removal.

## 5. Input, moves and completion

- [ ] 5.1 Move model (D7): the `AbcdMove` discriminated union
      (`enter` / `pencil` / `markAll` / `solve`), not the C move strings.
- [ ] 5.2 `Ui` (ephemeral): cursor `hx,hy`, `hpencil`, `hshow`, `hcursor`.
      `interpretMove` — left-click select-for-ink (toggle off on repeat), right-click
      select-for-pencil (not over a filled cell), arrow-key cursor,
      Enter/`CURSOR_SELECT` toggles ink/pencil; all `UI_UPDATE`. Convert the pointer
      with the shared `fromCoord` (`BORDER = 0`, D9).
- [ ] 5.3 Letter entry: `A`–`I` / `a`–`i` / **bare `1`–`9`** (playbook §3.8a — no
      `MOD_NUM_KEYPAD` in this frontend), each clamped `< n`, → `enter`/`pencil`;
      Backspace/Space/`0` → `enter` with `letter: null`; pencil over a filled cell →
      `MOVE_NO_EFFECT`. `M`/`m` → `markAll` when an empty cell lacks a mark.
- [ ] 5.4 `executeMove`: `enter` sets the cell (clearing wipes that cell's pencil
      cube); `pencil` toggles one candidate; `markAll` fills every empty cell's
      candidate cube; `solve` overwrites the grid from the canonical solution and sets
      `completed`+`cheated`. Recompute `completed` after `enter` (D8).
- [ ] 5.5 `solve()` returns `{ kind: "solve", grid }` from a fresh
      `solveGame(numbers)`; error on no/ambiguous solution. Test Solve **through a
      real `Midend`** (playbook §3.6).
- [ ] 5.6 Win check `isCompleted(state)` = upstream `validate_puzzle == 0` (no clue
      violation, no adjacency violation incl. both diagonals under `diag`, every cell
      filled), D8. `completed` never clears once set.
- [ ] 5.7 `textFormat` — the ASCII board (`board_text_format`); `canFormatAsText`
      guarded to `w < 19 && h < 19` (upstream's two-digit-clue limitation).

## 6. `findMistakes` and rendering

- [ ] 6.1 `findMistakes(state)` (D5): re-solve the clues to the canonical grid, flag
      every entered cell whose letter differs. Ships because ABCD has a unique
      solution (playbook §3.5). Tier-1 test: a wrong entry flags, the canonical entry
      does not.
- [ ] 6.2 Palette in C enum order (`COL_OUTERBG`, `COL_INNERBG`, `COL_GRID`,
      `COL_BORDERLETTER`, `COL_TEXT`, `COL_GUESS`, `COL_ERROR`, `COL_PENCIL`,
      `COL_HIGHLIGHT`, `COL_LOWLIGHT`); derive from the app background, do **not**
      luminance-adjust for dark mode (playbook §3.3 — the app owns it).
- [ ] 6.3 `computeSize`/`setTileSize` (D9): `(w+n)·TILESIZE + 1` × `(h+n)·TILESIZE`,
      `BORDER = 0` (`NARROW_BORDERS` arm), `innerCoord(x) = (x+n)·TILESIZE`.
- [ ] 6.4 `redraw`: border letters + edge clues (red on clue error), per-tile letter
      (red on adjacency error) / pencil-mark grid, cursor highlight, diag corner
      crosses; `Int32Array` cache key packing letter + cursor/pencil + error mask +
      flash phase (playbook §3.2). **Every overlay in the diff key** or it won't repaint.
- [ ] 6.5 Live error flags as base render (D5): clue over/under-satisfied
      (`count_clues`) and identical-letter adjacency (`set_errors_adjacent`,
      orthogonal + both diagonals under `diag`) — separate from `findMistakes`.
- [ ] 6.6 Completion flash (D9): diagonal-stripe over `FLASH_TIME = 0.7 s` in
      `FLASH_FRAME = 0.1 s` steps, non-cheated completions only. No move animation
      (`animLength = 0`).
- [ ] 6.7 Tier-2.5 render-scenario tests + snapshots: a selected-cursor frame, a
      pencil-mark frame, an adjacency-error frame, and a completion-flash frame.

## 7. Differential

- [ ] 7.1 `puzzles/auxiliary/abcd-trace.c` on the established pattern; add its
      `cliprogram()` line.
- [ ] 7.2 Fixture matrix (D6): the shipped presets plus a modest odd-biased size
      sweep, at least one `removenums` (hard) fixture and, if it generates in
      reasonable time, one `diag` fixture — each seed dumping the generated desc.
      Budget the trace's time (D4 cost note).
- [ ] 7.3 `abcd-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte for every fixture (validates generator + solver + codec, D6).

## 8. Registration and stage 1 close-out

- [ ] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unreleased/abcd.c` stays — stage-2 gate.
- [ ] 8.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [ ] 8.3 `openspec validate add-abcd-ts-port --strict`.
- [ ] 8.4 Dev-verify in the browser: select / arrow cursor / ink + pencil entry /
      bare-digit entry / `M` fill-marks / Solve / live error colouring / completion
      flash / Check & Save hard-block on a wrong entry / Custom params (incl. the
      inverted "Allow diagonal touching" checkbox).
- [ ] 8.5 Update `docs/porting/game-port-playbook.md` if anything was newly learned
      (the self-contained deductive solver + runs technique, the inverted-config
      gotcha, the findMistakes-vs-live-error split).

## Stage 2 — on owner acceptance only (parity gate)

- [ ] 9.1 Add `TS_PORTED` to the `puzzle(abcd …)` entry in
      `puzzles/unreleased/CMakeLists.txt` (drop `solver(abcd)`).
- [ ] 9.2 Delete `puzzles/unreleased/abcd.c`.
- [ ] 9.3 `rm -rf build/wasm/` and rebuild — abcd in the catalog, no `abcd.wasm`.
      Icons already exist.
- [ ] 9.4 Archive, then commit port + archive together.
