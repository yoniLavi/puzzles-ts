# Tasks — add-salad-ts-port

## 1. Scaffold and survey

- [x] 1.1 `scripts/new-game-port.sh salad` to stamp `src/native/games/salad/` with
      typed `Game<…>` stubs; read [`galaxies/`](../../src/native/games/galaxies/)
      and a latin-family exemplar (`keen/`, `unequal/`) end-to-end first, plus
      playbook §2.2 (latin.ts reuse) / §3.7 (pencil UX) / §3.8 (keypad).
- [x] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise. Record it in `design.md` if anything surprises.

## 2. Params, state and the desc codec

- [x] 2.1 `SaladParams { order, nums, mode, diff }`; `encodeParams`/`decodeParams`
      (`%dn%d%c` — order, `n`, nums, `L`/`B` mode — then `d%c` diff char on full;
      `decode` reads a leading int, optional `n<nums>`, `L`/`B`, optional `d<char>`).
- [x] 2.2 `validateParams` in upstream order: `nums ≥ 2` → `nums < order` →
      `order ≥ 3` → `nums ≤ 9` → `diff` in range, with the C messages.
- [x] 2.3 `paramConfig` (Game Mode / Size (s*s) / Symbols / Difficulty) with keys
      **`game-mode` / `size` / `symbols` / `difficulty`** matching `augmentation.ts`
      (playbook §3.4); `game-mode`/`difficulty` as `choices`, `size`/`symbols`
      numeric via `parseConfigInt`. `describeParams` returns those same keys (choice
      indices; string sizes) — the existing `salad` `describeConfig` reads them.
- [x] 2.4 Presets — the eleven upstream presets (design D5 table); labels
      `Letters: NxN A~c` / `Numbers: NxN 1~c`.
- [x] 2.5 State: `SaladState { grid, holes, borderclues, gridclues, marks,
      completed, cheated }` (immutable; typed arrays cloned per move; the fixed
      clues shared by reference — §3.1). Move/UI types (`SaladMove` union, D6;
      `SaladUi` with cursor + pencil/show flags).
- [x] 2.6 Desc codec (design D4): the shared run-length `salad_serialize` (empty-run
      lowercase, `X`/`O`, symbol + base — base `'A'-1` for border, `'0'` for
      number-grid) and `load_game`'s inverse decode. Letters desc =
      `<border>,<grid>`; numbers desc = `<grid>`. Byte-match surface.
- [x] 2.7 `validateDesc` = decode-and-discard, reproducing the C messages:
      border too long / invalid char / clue out of range / too short; grid too long /
      invalid char / clue out of range / too short.

## 3. The solver (a `latin.ts` consumer)

- [x] 3.1 `usersolver` (upstream `salad_solver_easy`): `latinholes_solver_sync`
      (hole↔candidate over the order-`o` cube, D2) + `salad_letters_solver` (border
      clue deduction, letters mode only) + `latinholes_solver_count` (per-line hole/
      circle counting). Trivial `valid` callback.
- [x] 3.2 Difficulty driver: **Normal** (`DIFF_EASY`) and **Extreme** (`DIFF_HARD`)
      mapped onto `latinSolver` `cfg`; the salad `usersolver` only at the easy tier
      (Extreme's `DIFFLIST` func is `NULL`); **`diff_recursive = DIFF_IMPOSSIBLE` so
      both tiers are guess-free** (design D3). Do not add a guessing tier.
- [x] 3.3 `latinholes_check` (line hole counts + each symbol once) and
      `salad_checkborders` (letters mode) as the completion predicate.
- [x] 3.4 `salad_solve(state, maxdiff)` — place fixed clues into the cube, run
      `latinSolver`, verify. Also the `DIFF_HOLESONLY` mode the numbers generator's
      quality check needs (holes-only fixpoint of sync + count).
- [x] 3.5 Tier-1 tests: each preset's clues solve to a unique full grid; a
      hand-built puzzle solves; an under-clued board is reported non-unique.

## 4. The generator (`latinGenerate` + solver-gated removal)

- [x] 4.1 `salad_scan_dir` (first non-hole symbol looking inward) and
      `salad_strip_clues` (shuffle + remove-if-still-soluble at `diff`).
- [x] 4.2 Numbers generator (design D7): `latinGenerate(o)` → grid clues (value
      `> nums` → cross); shuffle; weaken ball→circle then remove-ball, each
      solver-gated; the `DIFF_HOLESONLY` quality-check retry loop.
- [x] 4.3 Letters generator: `latinGenerate(o)` → grid clues + derived border clues;
      the `order < 8` empty-grid quality rule vs the strip-grid-then-border path.
- [x] 4.4 `newDesc` dispatching on `mode`; no `aux` threading (playbook §3.6 —
      `solve` re-derives from the clues).
- [x] 4.5 Tier-1: every preset (both modes) and a size sweep generate a board whose
      `salad_solve` yields a unique solution at exactly the target difficulty.

## 5. Input, moves and completion

- [x] 5.1 `SaladMove` discriminated union (`set` / `pencil` / `markAll` / `solve`),
      not the `R`/`P`/`M`/`S` strings (design D6).
- [x] 5.2 `interpretMove`: left/right-click select (right = pencil), click-again
      deselect, middle-click circle/cross cycle, arrow-cursor move,
      `Enter`/`CURSOR_SELECT` toggle pencil (playbook §3.8 traps — bare chars only,
      no `MOD_NUM_KEYPAD`). No-op → `null` locally (playbook §1).
- [x] 5.3 Symbol / `X` / `O` / Backspace entry in ink or pencil mode, honouring the
      C's guards (can't place on a fixed number clue; circle-clue restrictions).
- [x] 5.4 `M` mark-all (fill every empty cell's candidates; `canMarkAll: true`,
      playbook §3.7) — emitted only when it would change the board.
- [x] 5.5 `executeMove`: apply `set`/`pencil`/`markAll`/`solve` immutably; recompute
      `completed` via `latinholes_check` + `salad_checkborders`; `solve` sets
      `completed = cheated = true`.
- [x] 5.6 `solve()` re-runs `salad_solve(dup, DIFF_HARD)`; returns the solved grid as
      a `{ kind: "solve" }` move, or errors "No solution found." Test Solve **through
      a real `Midend`** (playbook §3.6).
- [x] 5.7 `textFormat` — the ASCII board (`game_text_format`); `canFormatAsText`
      stays static `true`.
- [x] 5.8 `requestKeys` (playbook §3.8): `nums` symbol keys (base `A`/`1`), then `X`,
      `O`, clear — from `mode`/`nums`.

## 6. Rendering (design D10)

- [x] 6.1 Palette in C enum order (background / highlight / lowlight / border /
      border-clue / pencil / immutable-num/ball/ballbg/hole / guess-* / error-*),
      derived from the app background; app owns dark mode (playbook §3.3).
- [x] 6.2 `computeSize`/`setTileSize`: `(order + 2)² · tilesize`, one-tile clue
      margin (`FROMCOORD = x/TILE_SIZE − 1`) — not `NARROW_BORDERS`.
- [x] 6.3 `redraw`: per-tile cell (bg / cursor / pencil-triangle), square border,
      ball (concentric circles, mode-dependent bg), cross (X), symbol glyph, pencil
      marks (solo-style candidate grid); border clues in the margin (letters).
      Per-tile `Int32Array` cache; **every overlay in the diff key** (§3.2).
- [x] 6.4 Live error highlight (duplicate symbol in a line; border-clue violation) as
      its own flag bits — distinct from `findMistakes` (design D8).
- [x] 6.5 Completion flash over `FLASH_TIME = 0.7 s`, three-phase diagonal wave
      (`(int)(flashtime / FLASH_FRAME) % 3`). `animLength` is `0`.
- [x] 6.6 Tier-2.5 render-scenario tests + snapshots: selected ink cell, pencil-marked
      cell, ball/cross clue, live error, `findMistakes` overlay, completion flash.

## 7. `findMistakes` + pencil UX

- [x] 7.1 `findMistakes(state)` (playbook §3.5): re-solve from fixed clues to the
      unique solution; flag placed symbols/crosses/circles that contradict it, and
      notes that cross out the solution value (`kind: "note"`, §3.7). `[]` when not
      uniquely deducible. Overlay in the cache diff key (§3.2).
- [x] 7.2 Pencil UX (playbook §3.7): `canMarkAll` (done in 5.4), sticky-pencil `Ui`
      pref via the `prefs` hook, a pencil-mode indicator, notes-first-class in
      `findMistakes` (7.1).
- [x] 7.3 Paint-twice mistake test (§3.2): paint, `findMistakes()`, redraw the same
      drawstate, assert the highlight appears on the second paint and clears on a
      third overlay-free frame.

## 8. Differential

- [x] 8.1 `puzzles/auxiliary/salad-trace.c` on the established pattern
      (`#include "../unreleased/salad.c"`, linking `latin.c`); add its `cliprogram()`
      line. Dumps the generated desc for `(params, seed)` tuples.
- [x] 8.2 Fixture matrix: every preset × both difficulties (design D9), plus a size
      sweep, each seed dumping the generated desc.
- [x] 8.3 `salad-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte across all fixtures (validates generator + solver + codec).

## 9. Registration and stage-1 close-out

- [x] 9.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served). C/WASM
      remains the fallback — no CMake change yet (`salad.c` still builds `salad.wasm`).
- [x] 9.2 Behavioural tests: params/desc round-trip, solver uniqueness, generator
      determinism (same seed → same desc), move transitions, win detection, midend
      lifecycle + save round-trip.
- [x] 9.3 Full gate green (`tsc -b --noEmit` → biome ci → `vitest run` →
      `vite build`).
- [x] 9.4 `openspec validate add-salad-ts-port --strict`.
- [x] 9.5 Dev-verify in the browser: both modes, letter/number entry, pencil marks,
      mark-all, `X`/`O` markers, keypad, Check & Save (clean + mistake), Solve,
      completion flash, Custom params.
- [x] 9.6 Update `docs/porting/game-port-playbook.md` if the port surfaces anything
      the guide didn't cover (the two-mode latin game; the pseudo-Latin hole trick).

## Stage 2 — on owner acceptance only

- [x] S2.1 Add `TS_PORTED` to `puzzle(salad …)` in
      `puzzles/unreleased/CMakeLists.txt` and drop `solver(salad …/latin.c)`.
- [x] S2.2 Delete `puzzles/unreleased/salad.c` and the `salad-trace` harness (and its
      `cliprogram()` line).
- [x] S2.3 `rm -rf build/wasm/` and rebuild — salad in the catalog, no `salad.wasm`
      (playbook §1.1 cache gotcha). Icons already exist.
- [x] S2.4 Archive, then commit port + archive together.
