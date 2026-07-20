# Tasks — add-sokoban-ts-port

## 0. Confirm the generator decision first

- [ ] 0.1 Confirm design D1 with the owner: ship the **faithful reverse-move
      generator** now (recommended), with curated hand-authored level packs as a
      separate follow-up change — or hold the port pending a curated-levels design.
      Everything below assumes (A). Do not start until this is settled, since it is
      the one genuine product decision in the port.

## 1. Survey and scaffold

- [ ] 1.1 Re-read `puzzles/unfinished/sokoban.c` against the long-tail-risk
      checklist (playbook §1) and confirm the design findings: no animation
      (`game_anim_length` = 0), no solver (`solve_game` = NULL), no wrong-but-legal
      state, self-contained (no leaf deps).
- [ ] 1.2 `scripts/new-game-port.sh sokoban` to stamp the `src/native/games/sokoban/`
      skeleton; drop the `solver.ts` stub (there is no solver — D3).

## 2. Params, state and the desc codec

- [ ] 2.1 Params `{ w, h }`, presets `12x10 / 16x12 / 20x16`, `validateParams`
      (both ≥ 4), `encodeParams`/`decodeParams` (`%dx%d`, square fallback on a bare
      number — reach for `parseDimensions`).
- [ ] 2.2 `paramConfig`: `dimensionParamConfig()` (width + height). Verify the
      existing `augmentation.ts` `sokoban` summary (`{width}x{height}`) still matches
      `describeParams`.
- [ ] 2.3 State: the grid as a `Uint8Array` of cell chars, `px`/`py`, `completed`.
      The character alphabet and its predicates (`IS_PLAYER`/`IS_BARREL`/
      `IS_ON_TARGET`/`TARGETISE`/`DETARGETISE`/`BARREL_LABEL`) as an idiomatic module
      — port **all** of them, including pits and labelled barrels (D7), even though
      the generator never emits them, so hand-authored IDs work.
- [ ] 2.4 Desc codec: the run-length grid encoding (char, then a decimal run count
      when it repeats) and its decode. `newState` places the player from `u`/`v` and
      leaves `SPACE`/`TARGET` beneath.
- [ ] 2.5 `validateDesc`: area equals `w*h` (distinguish "too much" from "too
      little"), exactly one player, no invalid characters — faithful to the C.

## 3. The faithful generator (design D1 A)

- [ ] 3.1 `sokobanGenerate(w, h, moves, rng)` — the reverse-move loop: wall ring +
      `INITIAL` interior, random player placement, then `w*h` iterations of
      enumerate-pulls → BFS priority queue → pick a pull → carve/apply. Port the
      hand-rolled binary heap faithfully (it is deterministic given grid state, so
      the whole thing is byte-match over `random.ts`).
- [ ] 3.2 The end-of-generation `INITIAL` → wall fill and the player-cell finalise.
- [ ] 3.3 `newDesc`: generate with `moves = w*h`, `nethack = false`, then emit the
      run-length desc. No solver gate — the level is solvable by construction.
- [ ] 3.4 Confirm determinism: same seed → same desc, so `params#seed` reproduces.

## 4. Moves, pushes, pits and win

- [ ] 4.1 `moveType(state, dx, dy)` (upstream `move_type`): illegal / walk / push.
      Push must be orthogonal with a barrel ahead and a space/target/pit/deep-pit
      beyond; diagonal walk needs one shared-adjacent free square (NetHack rule).
- [ ] 4.2 Move model: discriminated union `{ kind: "move"; dx; dy }` (D2), built by
      `interpretMove`, consumed by `executeMove`. Return `null` for an illegal move.
- [ ] 4.3 `interpretMove` input (D6): cursor keys **and bare digits** `1`–`9`
      (except `5`) for the eight directions (`MOD_NUM_KEYPAD` never arrives — playbook
      §3.8a); `LEFT_BUTTON` direction relative to the player cell (can be diagonal);
      no drag.
- [ ] 4.4 `executeMove`: apply the walk or the push, including pit consumption
      (`PIT` → filled → `SPACE`, barrel consumed; `DEEP_PIT` eats the barrel and
      remains) and on-target `TARGETISE`/`DETARGETISE`.
- [ ] 4.5 Win detection: upstream's "cannot become any *more* complete" rule — set
      `completed` when there are no free barrels **or** no free targets (no pit, no
      deep-pit, no empty target). Port the comment explaining why (spare barrels,
      pits).

## 5. Rendering

- [ ] 5.1 Palette in C enum order (`BACKGROUND, TARGET, PIT, DEEP_PIT, BARREL,
      PLAYER, TEXT, GRID, OUTLINE, HIGHLIGHT, LOWLIGHT, WALL`) via `mkhighlight`,
      with the derived `WALL` and pit/target shades. Keep indices C-identical — the
      `augmentation.ts` `sokoban` dark-mode `paletteSwaps` is keyed by index
      (`[[9,10]]`).
- [ ] 5.2 `computeSize`/`setTileSize`: the **`NARROW_BORDERS`** arm (`BORDER = 0`,
      not a full tile — D5, playbook §3.2).
- [ ] 5.3 `redraw`/`drawTile`: per-tile `Int32Array` cache (cell char + flash-bit),
      grid lines once in `!ds.started`, wall bevel, discs for
      target/pit/deep-pit/player/barrel, barrel labels, own background fill. Engine
      paints no pixels of its own.
- [ ] 5.4 The three-blink completion flash over `FLASH_LENGTH = 0.3`
      (`flash_length` fires only on the not-completed → completed transition).
- [ ] 5.5 `textFormat` returns `undefined` (D8). `hint`/`findMistakes`/`solve` are
      **not** implemented (D3, D4) — record why in the module doc.
- [ ] 5.6 Tier-2.5 render-scenario test + snapshot: a generated board, a board with
      the player mid-level, and a completed board (flash frame).

## 6. Differential

- [ ] 6.1 `puzzles/auxiliary/sokoban-trace.c` on the established pattern; add its
      `cliprogram()` line. It dumps the generated desc for `(w, h, seed)` tuples.
- [ ] 6.2 `sokoban-differential.test.ts`: TS `newDesc` reproduces the C desc
      **byte-for-byte** across the preset sizes and a range of seeds. (There is no
      solver to gate — this validates generator + codec, the strongest check
      available here.)

## 7. Registration and stage 1 close-out

- [ ] 7.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unfinished/sokoban.c` stays — stage-2 gate.
- [ ] 7.2 Behavioural tests: codec round-trip, `moveType` legality (walk/push/
      illegal, diagonal rules), pit consumption, win condition (including a
      spare-barrel / pit case), generator determinism.
- [ ] 7.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [ ] 7.4 `openspec validate add-sokoban-ts-port --strict`.
- [ ] 7.5 **Dev-verify in the browser**: generate, walk, push, fill a target, push
      into a pit, complete a level (flash), undo/redo, click-to-move and
      keyboard-diagonal both work. 0 console errors.
- [ ] 7.6 Update `docs/porting/game-port-playbook.md` with anything this port
      surfaced (unfinished-but-complete-frontend case; the no-solver/no-hint/
      no-findMistakes movement-puzzle shape).

## 8. Stage 2 — on owner acceptance only

- [ ] 8.1 Move `puzzle(sokoban …)` from `puzzles/unfinished/CMakeLists.txt` into the
      main `puzzles/CMakeLists.txt` with `TS_PORTED` (playbook §1.1).
- [ ] 8.2 Delete `puzzles/unfinished/sokoban.c` and the `sokoban-trace` harness (and
      its `cliprogram()` line).
- [ ] 8.3 `rm -rf build/wasm/` and rebuild — sokoban in the catalog, no
      `sokoban.wasm`. Icons already exist from the WASM era. Verify.
- [ ] 8.4 Archive, then commit port + archive together.
