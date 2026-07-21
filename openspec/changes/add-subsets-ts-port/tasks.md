# Tasks — add-subsets-ts-port

## 1. Scaffold and survey

- [ ] 1.1 `scripts/new-game-port.sh subsets` to stamp `src/native/games/subsets/`
      with typed `Game<…>` stubs; read `galaxies/` (grid + findMistakes exemplar)
      and a small toggle game end-to-end first.
- [ ] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise. Record in `design.md` if anything surprises.

## 2. Params, state and desc codec

- [ ] 2.1 `SubsetsParams { w, h, n }`; `encodeParams` (`"%dx%dn%d"`) /
      `decodeParams` (read `w`, optional `x h`, optional `n n`). Round-trips.
- [ ] 2.2 `validateParams`: accept only `w = h = n = 4` (exact upstream message);
      no `paramConfig` — a single legal configuration has nothing to configure (D8).
- [ ] 2.3 Preset: the one upstream preset `"4x4 Size 4"`; `describeParams` emits
      the key `augmentation.ts` reads (playbook §3.4).
- [ ] 2.4 State: per-cell `clues` (arrow flags), `immutable`, `known`, `mask`
      bitmasks over `n` letters (typed arrays); `completed`/`cheated`;
      immutable-by-reference where shared per §3.1. `cloneState` copies the four
      arrays.
- [ ] 2.5 Desc codec (D1): encode one token per cell (set number or `_`, then
      `URDL` arrow markers, comma-separated) and its exact inverse decode. Port
      `new_game_desc`'s emit and `attempt_load_game`'s read as inverses — byte-match
      surface.
- [ ] 2.6 `validateDesc` reproducing every upstream check, distinguishing the
      cases: too much data, too little data, number out of range, missing
      separator, unexpected character, arrow off grid, contradicting arrows.

## 3. The solver (byte-match-critical)

- [ ] 3.1 `solveBoard(state)` → `STATUS_{COMPLETE,UNFINISHED,INVALID}`, driving the
      cube fixpoint. Cube = per-cell candidate set-values (a `boolean[][]` or a
      `Uint16Array` of candidate bitmasks — representation free, D2).
- [ ] 3.2 Port all seven rule functions in the C loop order: `sync_cube`,
      `cube_single_count`, `apply_arrows`, `disjoint`, `bits_from_cube`,
      `solve_single_position`, `apply_arrows_advanced`; restart the loop on first
      progress, break when none.
- [ ] 3.3 **Do not port the dead code** — the commented-out "remove options that
      don't fit the larger set" block in `apply_arrows_advanced` (`subsets.c:738`)
      is not compiled; leave it out with a comment naming it (D2). Porting it would
      strengthen the solver and diverge the desc.
- [ ] 3.4 `subsets_validate` → status + optional per-cell error flags + per-value
      counts (drives both the solver loop and `findMistakes`/render).
- [ ] 3.5 Tier-1 tests: a small hand-built board solves to `COMPLETE`; an
      inconsistent board reports `INVALID`; a genuinely ambiguous board reports
      `UNFINISHED`.

## 4. The generator

- [ ] 4.1 `generateBoard`: seed all `2^n` sets, **`shuffle(known)`** (sole set
      assignment), `mask = known`, derive every arrow clue from the ⊆ relation.
- [ ] 4.2 **`shuffle(spaces)`**, then blank each cell in that order, re-solve a
      fresh copy, restore the given if the solver no longer reaches `COMPLETE`
      (uniqueness gate). Port verbatim — RNG surface is exactly the two shuffles.
- [ ] 4.3 `newDesc` emitting the codec (D1); no `aux` (Solve re-runs the solver,
      playbook §3.6).
- [ ] 4.4 Tier-1: the preset generates a soluble, internally-consistent board
      whose givens the solver completes.

## 5. Input, moves, solve and completion

- [ ] 5.1 Move model: the `SubsetsMove` discriminated union
      (`{ kind: "set"; type; pos; bit } | { kind: "solve"; known; mask }`), not a
      move string (D4).
- [ ] 5.2 `interpretMove`: map a click / cursor-select on a letter slot to a
      tri-state cycle — left/Enter U→K→C→U, right/Space U→C→K→U, middle/Backspace
      →U; reject immutable slots (`UI_UPDATE`/no-op); keyboard cursor skipping the
      inter-cell gap rows/cols. Convert the pointer with the shared `fromCoord`
      (half-tile offset, playbook §2.3).
- [ ] 5.3 `executeMove`: apply the `known`/`mask` bit edits per the K/C/U arms; set
      `completed` when `subsets_validate == STATUS_COMPLETE`.
- [ ] 5.4 `solve()`: re-run the solver on a copy; unless `INVALID`, return
      `{ kind: "solve", known, mask }`; error on an invalid board. Test Solve
      **through a real `Midend`**.
- [ ] 5.5 `textFormat` (`game_text_format`): the ASCII board with letter slots and
      `>`/`<`/`v`/`^` arrows; `canFormatAsText` static `true` (D9).

## 6. findMistakes

- [ ] 6.1 `findMistakes(state)` → the rule-validator error set (D5): duplicated
      placed sets (`{ kind: "cell"; pos }`) and violated edge relations
      (`{ kind: "edge"; pos; dir }`), from `subsets_validate`'s flags.
- [ ] 6.2 Wire it into the mistake overlay: `render.ts` recolours flagged cells /
      arrows `COL_ERROR`; `canFindMistakes` is true (Check & Save is a real check).
- [ ] 6.3 Tier-1 tests: a duplicate placement flags both cells; an arrow whose
      subset relation is violated flags that edge; a correct partial board flags
      nothing.

## 7. Rendering

- [ ] 7.1 Palette in the C enum order (`COL_OUTERBG`, `COL_INNERBG`, `COL_GRID`,
      `COL_HIGHLIGHT`, `COL_LOWLIGHT`, `COL_FIXED`, `COL_GUESS`, `COL_ERROR`,
      `COL_CURSOR`); derive the bevel from the app background, do **not**
      luminance-adjust for dark mode (playbook §3.3 — the app owns it).
- [ ] 7.2 `computeSize`/`setTileSize`: `w·(cw+1)·TILESIZE` × `h·(ch+1)·TILESIZE`
      plus the tally band (`game_compute_size`).
- [ ] 7.3 `redraw`: per-cell letter slots with bevel, given vs guessed letter
      colours, the grid frame; cache keyed on a packed `Int32Array` of
      `known`/`mask` + flash bit per cell (playbook §3.2). Every mistake/flash
      overlay in the diff key or it won't repaint.
- [ ] 7.4 The horseshoe arrows between cells (from `clues`, `COL_ERROR` when
      flagged) and the disjointness crosses on violated missing-arrow edges.
- [ ] 7.5 The set tally below the grid (each `2^n` set-value + placement count,
      coloured by count) and the completion flash over `FLASH_TIME = 0.6 s`
      (toggling each `FLASH_FRAME`). No move animation — `animLength` is `0` (D10).
- [ ] 7.6 Tier-2.5 render-scenario tests + snapshots: a mid-solve frame, a
      mistake-overlay frame, and a completion-flash frame.

## 8. Differential

- [ ] 8.1 `puzzles/auxiliary/subsets-trace.c` on the established pattern; add its
      `cliprogram()` line.
- [ ] 8.2 Fixture matrix: a seed sweep at `4x4n4`, each dumping the generated desc.
- [ ] 8.3 `subsets-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte for each seed (validates generator + solver + codec, D6).

## 9. Registration and stage 1 close-out

- [ ] 9.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unreleased/subsets.c` stays — stage-2 gate.
- [ ] 9.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [ ] 9.3 `openspec validate add-subsets-ts-port --strict`.
- [ ] 9.4 Dev-verify in the browser: click / right-click / cursor tri-state
      toggling, Solve, the set tally, mistake highlighting on Check, completion
      flash, game-ID round-trip.
- [ ] 9.5 Update `docs/porting/game-port-playbook.md` if the tri-state sub-cell
      input or the set-tally render taught anything the guide lacked.

## Stage 2 — on owner acceptance only (design D11)

- [ ] S2.1 Add `TS_PORTED` to `puzzle(subsets …)` in
      `puzzles/unreleased/CMakeLists.txt` (and drop `solver(subsets)`).
- [ ] S2.2 Delete `puzzles/unreleased/subsets.c`.
- [ ] S2.3 `rm -rf build/wasm/` and rebuild — Subsets TS-served, no `subsets.wasm`
      (the `option()`-cache gotcha, playbook §1.1). Icons already exist.
- [ ] S2.4 Archive, then commit port + archive together.
