# Tasks — add-sokoban-ts-port

## 0. Confirm the generator decision first

- [x] 0.1 Confirm design D1 with the owner: ship the **faithful reverse-move
      generator** now (recommended), with curated hand-authored level packs as a
      separate follow-up change — or hold the port pending a curated-levels design.
      Everything below assumes (A). **Owner confirmed (A) — ship the faithful
      generator now — on 2026-07-21.**

## 1. Survey and scaffold

- [x] 1.1 Re-read `puzzles/unfinished/sokoban.c` against the long-tail-risk
      checklist (playbook §1) and confirm the design findings: no animation
      (`game_anim_length` = 0), no solver (`solve_game` = NULL), no wrong-but-legal
      state, self-contained (no leaf deps).
- [x] 1.2 `scripts/new-game-port.sh sokoban` to stamp the `src/native/games/sokoban/`
      skeleton; dropped the `solver.ts` stub (there is no solver — D3).

## 2. Params, state and the desc codec

- [x] 2.1 Params `{ w, h }`, presets `12x10 / 16x12 / 20x16`, `validateParams`
      (both ≥ 4), `encodeParams`/`decodeParams` (`%dx%d`, square fallback on a bare
      number — via `parseDimensions`).
- [x] 2.2 `paramConfig`: not needed — a plain `w`/`h` game whose config summary
      `{width}x{height}` is served by the worker adapter's generic base; verified the
      existing `augmentation.ts` `sokoban` summary renders (header shows `5x5`/`12x10`
      live). (No `Game.paramConfig` — the default custom dialog covers w/h.)
- [x] 2.3 State: the grid as a `Uint8Array` of cell chars, `px`/`py`, `completed`.
      The character alphabet and its predicates (`isPlayer`/`isBarrel`/
      `isOnTarget`/`targetise`/`detargetise`/`barrelLabel`) as an idiomatic module —
      ported **all** of them, including pits and labelled barrels (D7).
- [x] 2.4 Desc codec: the run-length grid encoding (char, then a decimal run count
      when it repeats) and its decode. `newState` places the player from the desc and
      leaves `SPACE`/`TARGET` beneath.
- [x] 2.5 `validateDesc`: area equals `w*h` (distinguish "too much" from "too
      little"), exactly one player, no invalid characters — faithful to the C.

## 3. The faithful generator (design D1 A)

- [x] 3.1 `sokobanGenerate(w, h, grid, moves, nethack, rng)` — the reverse-move loop:
      wall ring + `INITIAL` interior, random player placement, then `w*h` iterations of
      enumerate-pulls → BFS priority queue → pick a pull → carve/apply. Ported the
      hand-rolled binary min-heap faithfully (byte-match over `random.ts`).
- [x] 3.2 The end-of-generation `INITIAL` → wall mapping (in the desc encoder) and the
      player-cell finalise.
- [x] 3.3 `newSokobanDesc`: generate with `moves = w*h`, `nethack = false`, then emit
      the run-length desc. No solver gate — the level is solvable by construction.
- [x] 3.4 Confirmed determinism: same seed → same desc (unit test), so `params#seed`
      reproduces.

## 4. Moves, pushes, pits and win

- [x] 4.1 `moveType(state, dx, dy)` (upstream `move_type`): `illegal` / `walk` /
      `push` (discriminated string, not a magic `-1/0/1`).
- [x] 4.2 Move model: discriminated union `{ type: "move"; dx; dy }` (D2), built by
      `interpretMove`, consumed by `executeMove`. Returns `null` for an illegal move.
- [x] 4.3 `interpretMove` input (D6): cursor keys **and bare digits** `1`–`9`
      (except `5`) for the eight directions (`MOD_NUM_KEYPAD` never arrives — §3.8a);
      `LEFT_BUTTON` direction relative to the player cell (can be diagonal); no drag.
- [x] 4.4 `executeMove`: apply the walk or the push, including pit consumption
      (`PIT` → filled → `SPACE`, barrel consumed; `DEEP_PIT` eats the barrel and
      remains) and on-target `targetise`/`detargetise`. State is rebuilt immutably.
- [x] 4.5 Win detection: upstream's "cannot become any *more* complete" rule.

## 5. Rendering

- [x] 5.1 Palette in C enum order (`BACKGROUND, TARGET, PIT, DEEP_PIT, BARREL,
      PLAYER, TEXT, GRID, OUTLINE, HIGHLIGHT, LOWLIGHT, WALL`) via `mkhighlight`, with
      the derived `WALL` and pit/target shades. Indices C-identical — the
      `augmentation.ts` `sokoban` dark-mode `paletteSwaps` `[[9,10]]` targets
      HIGHLIGHT/LOWLIGHT.
- [x] 5.2 `computeSize`/`setTileSize`: the **`NARROW_BORDERS`** arm (`BORDER = 0` —
      D5, playbook §3.2).
- [x] 5.3 `redraw`/`drawTile`: per-tile `Int32Array` cache (cell char + flash-bit),
      grid lines once in `!ds.started`, wall bevel, discs for
      target/pit/deep-pit/player/barrel, barrel labels, own background fill.
- [x] 5.4 The three-blink completion flash over `FLASH_LENGTH = 0.3`.
- [x] 5.5 `textFormat` omitted (`canFormatAsText: false` — D8, honest since it always
      returns nothing). `hint`/`findMistakes`/`solve` are **not** implemented (D3, D4)
      — recorded why in the module doc.
- [x] 5.6 Tier-2.5 render-scenario test + snapshot: a generated board and a
      post-winning-push frame.

## 6. Differential

- [x] 6.1 `puzzles/auxiliary/sokoban-trace.c` on the established pattern
      (`#include "../unfinished/sokoban.c"`); added its `cliprogram()` line. Dumps the
      generated desc for `(w, h, seed)` tuples.
- [x] 6.2 `sokoban-differential.test.ts`: TS `newSokobanDesc` reproduces the C desc
      **byte-for-byte** across all three presets and a size sweep (12 fixtures) —
      **green first run**. Validates generator + codec, the strongest check here.

## 7. Registration and stage 1 close-out

- [x] 7.1 Registered in `ts-ported-ids.ts` + `games/index.ts` (TS-served). Because an
      unfinished game has **no in-app C fallback** (it's gated behind
      `PUZZLES_ENABLE_UNFINISHED` and absent from the catalog), the `puzzle(sokoban …)`
      entry was moved into the **main** `puzzles/CMakeLists.txt` with `TS_PORTED` (and
      out of `unfinished/CMakeLists.txt`) so the game appears in the catalog at all;
      `puzzles/unfinished/sokoban.c` stays as the reference until stage-2 acceptance.
      Rebuilt wasm (no `sokoban.wasm`); catalog + `ts-ported-ids` guard green.
- [x] 7.2 Behavioural tests: codec round-trip, `moveType` legality (walk/push/
      illegal, diagonal rules), pit consumption, win condition (incl. a
      spare-barrel case), generator determinism, midend lifecycle + save round-trip.
- [x] 7.3 Full gate green (`tsc -b --noEmit` → biome ci → `vitest run` (4080) →
      `vite build`).
- [x] 7.4 `openspec validate add-sokoban-ts-port --strict`.
- [x] 7.5 **Dev-verified in the browser**: hand-authored ID decode, click-to-move
      (incl. diagonal walk), keyboard arrows, push onto a target, win + completion
      flash/dialog. 0 console errors. (Owner acceptance still pending — stage 2.)
- [x] 7.6 Updated `docs/porting/game-port-playbook.md` §1.1 with the unfinished-game
      catalog/fallback lesson this port surfaced.

## 8. Stage 2 — on owner acceptance only

**Owner accepted 2026-07-21.**

- [x] 8.1 (Already done for catalog visibility — see 7.1.) `puzzle(sokoban …)` sits
      in the main `puzzles/CMakeLists.txt` with `TS_PORTED`.
- [x] 8.2 Deleted `puzzles/unfinished/sokoban.c` and the `sokoban-trace` harness (and
      its `cliprogram()` line); updated the `unfinished/CMakeLists.txt` breadcrumb.
- [x] 8.3 `rm -rf build/wasm/` and rebuilt — sokoban in the catalog, no
      `sokoban.wasm`. Icons already existed from the WASM era. Verified; the frozen
      differential fixture still runs C-free.
- [x] 8.4 Archive, then commit port + archive together.
