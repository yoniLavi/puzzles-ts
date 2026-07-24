# Tasks — add-spokes-ts-port

## 1. Scaffold and survey

- [x] 1.1 `scripts/new-game-port.sh spokes` to stamp `src/native/games/spokes/`
      with typed `Game<…>` stubs; read `galaxies/` end-to-end and a logic-game
      exemplar (`tracks/`, `rect/`) for the edge-drawing `findMistakes` shape first.
- [x] 1.2 Confirm the long-tail-risk checklist (design intro): no `supersededDesc`,
      no state-string undo, no `#ifdef EDITOR` letters. Record the one note — Spokes
      has a real `game_print` that this port deliberately does not carry (no print
      promise, fork policy).

## 2. Params, state and the desc codec

- [x] 2.1 `SpokesParams { w, h, diff }` (`diff` = Easy/Tricky/Hard);
      `encodeParams` (`%dx%d` then `d<e|t|h>` when full) / `decodeParams` (w, optional
      `x`h with square fallback, optional `d<char>`).
- [x] 2.2 `validateParams`: `w ≥ 2`, `h ≥ 2` (no upper bound — faithful to the C).
- [x] 2.3 `paramConfig` (Width, Height string items + a Difficulty choices item);
      keys matching the C config slugs — `width` / `height` / `difficulty` (playbook
      §3.4), numeric `set` via `parseConfigInt`.
- [x] 2.4 Presets — the six upstream presets (`4×4` and `6×6`, each Easy/Tricky/Hard;
      `DEFAULT_PRESET` = 6×6 Easy). `describeParams` emits the keys the existing
      `augmentation.ts` `spokes` template reads (`width` / `height` / `difficulty`
      index) so the type header renders (playbook §3.4).
- [x] 2.5 State: `numbers` (`Int8Array`, `0` = hole) and `spokes` (`Uint16Array`,
      eight 2-bit spokes), `completed`, `cheated`; `GET_SPOKE` / `SET_SPOKE` /
      `spokesPlace(i, dir, s)` helpers (spoke + inverse on the neighbour); the
      `blank_game` edge-spoke hiding and `new_game` hole-processing (D1).
- [x] 2.6 Desc codec: flat one-char-per-cell grid of clue digits (`'0'`–`'8'`, `'X'`
      for a hole) — **not** run-length (D1). `newState` reads digits → clues and
      processes holes.
- [x] 2.7 `validateDesc`: each char `'0'`–`'8'` or `'X'`; distinguish "too short"
      (< `w*h`) from "too long" (trailing data) — faithful to the C.

## 3. The tiered deductive solver (design D2, D3)

- [x] 3.1 The recount scratch (`nodes` / `lines` / `marked` / `dsf` / `open`) as an
      allocate-once object over `engine/dsf.ts` `Dsf`; `spokesSolverRecount`
      (with/without the diagonal-mark `full` pass) and `spokesFindIsolated`.
- [x] 3.2 `spokesValidate` → `INVALID` / `INCOMPLETE` / `VALID` (discriminated, not
      magic `0/1/2`): per-hub line/mark counts, crossing-`LINE`-diagonal check, and
      the `dsf`-based isolated-set / fully-solved check.
- [x] 3.3 The deduction rules: `spokesSolverOnes`, `spokesSolverFull`,
      `spokesSolverDiagonal`, and `spokesSolverAttempt` (bounded contradiction
      look-ahead). `spokesSolve(state, diff)` runs the fixpoint with the correct tier
      mapping (Tricky → attempt at `DIFF_LIMITED` with `ACTION_LIMIT = 4`; Hard →
      attempt at `DIFF_EASY`) — port the tiers verbatim (D3).
- [x] 3.4 Tier-1 tests: a hand-built board solves to a known unique solution; an
      unsolvable board reports `INVALID`; each tier solves exactly the boards it
      should (an Easy-only board isn't over-graded, a Hard board needs the look-ahead).

## 4. The solver-gated generator (design D4)

- [x] 4.1 `spokesGenerateHubs` — draw every H/V line and one random diagonal per
      interior cell (the sole per-cell `randomUpto(2)` draw), recording the drawn
      lines; then the single `shuffle` (byte-match surface — reproduce the draw order
      exactly, playbook §4.3).
- [x] 4.2 The strip loop: for each shuffled line, tentatively remove it (keep every
      hub ≥ 1 line), recompute clues, clear, re-solve at `diff`, restore if not
      `STATUS_VALID`; the final acceptance gate (solvable at `diff`, not at `diff − 1`
      unless Easy).
- [x] 4.3 `newDesc`: loop `spokesGenerate` until it accepts, then emit the flat digit
      desc. No `aux` (the solver re-derives — playbook §3.6).
- [x] 4.4 Tier-1: every preset and a small size sweep generate a board whose clues
      round-trip through `validateDesc` and whose `spokesSolve` yields a unique
      `STATUS_VALID` solution at the recorded difficulty.

## 5. Input, moves and completion (design D5, D8)

- [x] 5.1 Move model: the `SpokesMove` discriminated union (`{ kind: "set"; index;
      dir; state } | { kind: "solve"; spokes }`), not a move string.
- [x] 5.2 `interpretMove` drag phases: press records `drag_start` on the ephemeral
      `Ui`; drag computes the eight-way direction via `atan2` with the dead-zone
      radius and sets `drag_end` (`UI_UPDATE`); release toggles the spoke (left
      `LINE`⇄`EMPTY`, right `MARKED`⇄`EMPTY`), rejecting a `LINE` diagonal whose
      crossing partner is a `LINE`. No valid toggle → `UI_UPDATE` (local no-op
      suppression). Use the shared `fromCoord` (`BORDER = 0`, D7).
- [x] 5.3 Keyboard: arrow-key cursor on the `(3w−2)×(3h−2)` half-grid; `CURSOR_SELECT`
      draws, `CURSOR_SELECT2` marks. Reuse `engine/pointer.ts` cursor helpers where
      they fit.
- [x] 5.4 `executeMove`: apply a `set` via `spokesPlace` (respecting `HIDDEN`); apply
      a `solve` by clearing to `EMPTY` then setting the resolved spokes; set
      `completed` when `spokesValidate` returns `VALID`; set `cheated` on solve.
- [x] 5.5 `solve()` returns `{ kind: "solve", spokes }` from a full-difficulty
      `spokesSolve` of a clean copy; error when no solution is found. Test Solve
      **through a real `Midend`** (playbook §3.6).
- [x] 5.6 `textFormat` — the ASCII board grid (`game_text_format`); `canFormatAsText`
      stays static `true` (works on any `w×h`).

## 6. `findMistakes` (design D6)

- [x] 6.1 `findMistakes(state)`: re-solve a clean (clues-only) copy to the unique
      solution; flag every player `LINE` the solution forbids and every player `MARKED`
      where the solution needs a line; a missing line is *incomplete*, not a mistake;
      return `[]` when not uniquely deducible.
- [x] 6.2 Keep it distinct from the existing live `COL_ERROR` rendering (over-count /
      isolated set) — that stays as immediate local validation, separate from the
      solution comparison.
- [x] 6.3 Paint-twice tier-2 test (playbook §3.2): draw a wrong line, `findMistakes()`,
      redraw the *same* drawstate and assert the mistake overlay appears on the second
      paint, and clears on a third frame without it.

## 7. Rendering (design D7)

- [x] 7.1 Palette in C enum order (`BACKGROUND, BORDER, HOLDING, LINE, MARK, DONE,
      ERROR, CURSOR`). Derive from the app background; do **not** luminance-adjust for
      dark mode (playbook §3.3 — the app owns it).
- [x] 7.2 `computeSize`/`setTileSize`: `w*TILESIZE × h*TILESIZE`, `BORDER = 0`, hubs
      centred at `TOCOORD` (D7).
- [x] 7.3 `redraw`: per-hub rendering (circle + eight spoke dots, `LINE` spokes as
      thick lines, the clue digit, the `DONE`/`HOLDING`/`ERROR`/`CURSOR` colour
      states), the diagonal-corner touch-ups, packed into an `Int32Array` cache key —
      **the drag `HOLDING` highlight and the `findMistakes` overlay bits both in the
      diff key** (playbook §3.2) or they won't repaint.
- [x] 7.4 The keyboard-cursor blitter overlay driven off the ephemeral `Ui` cursor.
- [x] 7.5 The completion flash over `FLASH_TIME = 5 × FLASH_FRAME = 0.6 s`. No slide
      interpolation — `animLength` is `0`.
- [x] 7.6 Tier-2.5 render-scenario tests + snapshots: a mid-solve frame, a drag-hold
      frame, a `findMistakes` frame, and a completion-flash frame.

## 8. Differential (design D9)

- [x] 8.1 `puzzles/auxiliary/spokes-trace.c` on the established pattern
      (`#include "../unreleased/spokes.c"`); add its `cliprogram()` line. Dumps the
      generated desc for `(w, h, diff, seed)` tuples.
- [x] 8.2 Fixture matrix: every preset plus a small size sweep, each seed dumping the
      generated desc.
- [x] 8.3 `spokes-differential.test.ts` via `describeDescDifferential`: TS `newDesc`
      reproduces the C desc **byte-for-byte**, with `validateDesc` as the `extra`
      check — validates generator + solver + codec at once.

## 9. Registration and stage 1 close-out

- [x] 9.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). The C/WASM
      `puzzle(spokes …)` build stays as the in-app fallback — stage-2 gate (D11).
- [x] 9.2 Behavioural tests: codec round-trip, solver tiers, generator determinism,
      move/toggle transitions, diagonal-crossing rejection, win condition, midend
      lifecycle + save round-trip.
- [x] 9.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [x] 9.4 `openspec validate add-spokes-ts-port --strict`.
- [x] 9.5 Dev-verify in the browser: left-drag lines, right-drag marks, diagonal
      crossing blocked, keyboard cursor draw/mark, Check & Save flags a wrong line,
      Solve, completion flash, Custom params.
- [x] 9.6 Update `docs/porting/game-port-playbook.md` if the port surfaces anything
      new (the eight-way spoke model, the half-grid cursor, the flat digit codec).

## 10. Owner-review follow-ups (2026-07-24)

- [x] 10.1 Fix the difficulty gate: run the "…and not one tier easier" check from
      an empty position rather than the previous candidate's leftover. Keep the
      byte-match oracle by giving the generator an `upstreamDirtyGate` option that
      only `spokes-differential.test.ts` sets. Re-measure grading *and* cost, and
      replace the quirk-pinning test with one that asserts honest grading.
- [x] 10.2 Mark hubs whose spoke count is met (owner request; the Bridges fork
      aid). New `COL_SATISFIED` a clear step below the background — upstream's
      pure-white fill is invisible against either colour scheme's background —
      plus a `mark-satisfied` preference, default on. Tier-2 tests for on, off and
      the untouched board.
- [x] 10.3 Dev-verify both in the browser and re-run the full gate.

## 11. Stage 2 — on owner acceptance only (design D11)

- [ ] 11.1 Add `TS_PORTED` to the `puzzle(spokes …)` entry in
      `puzzles/unreleased/CMakeLists.txt` (no `spokes.wasm` is built).
- [ ] 11.2 Delete `puzzles/unreleased/spokes.c` and the `spokes-trace` harness (and
      its `cliprogram()` line); delete any advisory `scripts/diff-spokes.test.ts`.
- [ ] 11.3 `rm -rf build/wasm/` and rebuild — spokes served by TS, no `spokes.wasm`.
      Icons already exist.
- [ ] 11.4 Archive, then commit port + archive together.
