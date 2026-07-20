# Tasks — add-slide-ts-port

## 1. Scaffold and survey

- [ ] 1.1 `scripts/new-game-port.sh slide` to stamp `src/native/games/slide/`
      with typed `Game<…>` stubs; read `galaxies/` and a movement exemplar
      (`sixteen/`, `netslide/`) end-to-end first.
- [ ] 1.2 Confirm the long-tail-risk checklist is clean (design intro): no
      `supersededDesc`, no state-string undo, no `#ifdef EDITOR` letters, no print
      promise. Record it in `design.md` if anything surprises.

## 2. Params, state and desc codec

- [ ] 2.1 `SlideParams { w, h, maxmoves }`; `encodeParams`/`decodeParams`
      (`%dx%d` then `m%d` for a limit or `u` for none; `decodeParams` reads
      `maxmoves` only on `m`, sets `-1` on `u`).
- [ ] 2.2 `validateParams` in upstream order: `w ≤ MAXWID (251)` → `w ≥ 5` →
      `h ≥ 4`. `maxmoves` is unclamped.
- [ ] 2.3 `paramConfig` (Width, Height, "Solution length limit") — keys matching
      the C config slugs (playbook §3.4); numeric `set` via `parseConfigInt`.
- [ ] 2.4 Presets — the three upstream presets (`7×6 max 25`, `7×6 no limit`,
      `8×6 no limit`); `describeParams` emits the keys `augmentation.ts` reads
      (playbook §3.4). Owner may trim (design D9).
- [ ] 2.5 State: canonical `board` (`Uint8Array`, the anchor/main/dist/empty/wall
      byte encoding), immutable `forcefield` (`Uint8Array`/`boolean[]` shared by
      reference across states — §3.1 shared-frozen pattern), `tx`/`ty`,
      `minmoves`, `lastmoved`/`lastmovedPos`, `movecount`, `completed`, `cheated`,
      and the stored-solution fields `soln`/`solnIndex` (design D4).
- [ ] 2.6 Desc codec: the run-length block encoding (`d<dist>`, `f`-prefix
      forcefield, `a`/`m`/`e`/`w` + optional count) composed with `,tx,ty,minmoves`
      (`minmoves` optional on read). Port `new_game`'s decode and `new_game_desc`'s
      encode as exact inverses — byte-match surface (design D6).
- [ ] 2.7 `validateDesc`: reject too-much/too-little data (distinguishing which),
      `≠ 1` main piece, out-of-range/invalid `d` back-references, unknown
      characters, missing target coords.

## 3. The BFS solver (idiomatic `tree234` replacement)

- [ ] 3.1 `solveBoard(w, h, board, forcefield, tx, ty, movelimit)` → minimum move
      count or `-1`, optionally the move list. Visited = `Map`/`Set` keyed by the
      canonical board bytes; queue = plain array FIFO (design D1). **No `tree234`,
      no `SortedMultiset`** — record why in `solver.ts`'s module doc.
- [ ] 3.2 The per-board expansion: build the block linked-list (`next`/`which`),
      then for each anchor BFS the cells it can slide to (walls, other blocks,
      forcefield-vs-main rules), enqueueing each new canonical board with a
      parent pointer; stop when the main anchor reaches `(tx,ty)` or the queue
      empties or `movelimit` is hit.
- [ ] 3.3 Solution reconstruction: backtrack parent pointers, diffing consecutive
      boards to recover each `(from, to)` anchor move (`slide.c:590-616`).
- [ ] 3.4 Tier-1 tests: a hand-built tiny board solves to a known minimum; an
      unsolvable board returns `-1`; `movelimit` cuts the search at the right depth.

## 4. The generator

- [ ] 4.1 `generateBoard` over the solver: wall border + singleton fill, the
      **fixed** main piece and **fixed** target + forcefield cells (port upstream's
      unvaried placement, FIXMEs and all — design D6), remove singletons in scan
      order until soluble.
- [ ] 4.2 The edge-merge phase: build the inter-block edge list, **one
      `shuffle`**, then merge-if-still-soluble with the `tried_merge[wh*wh]`
      matrix and the dsf-canonical propagation ported verbatim (byte-match
      surface).
- [ ] 4.3 `newDesc` emitting the desc + `,tx,ty,minmoves`; `aux` carries nothing
      the solver can't re-derive (Slide's `solve` re-runs the BFS), so no `aux`
      threading (playbook §3.6).
- [ ] 4.4 Tier-1: every preset and a small size sweep generate a soluble board
      whose `minmoves` matches a fresh `solveBoard`.

## 5. Input, moves and completion

- [ ] 5.1 Move model: the `SlideMove` discriminated union
      (`{ kind: "move"; from; to } | { kind: "solve"; moves }`), not a move string
      (design D4).
- [ ] 5.2 `interpretMove` drag phases (design D5): grab (`LEFT_BUTTON` →
      reachable-set BFS on the ephemeral `Ui`), follow (`LEFT_DRAG` →
      Manhattan-spiral snap to nearest reachable, `UI_UPDATE`), release
      (`LEFT_RELEASE` → emit a `move` if the anchor moved, else `UI_UPDATE`).
      Convert the pointer with the shared `fromCoord` (round fractional input;
      `BORDER = 0`).
- [ ] 5.3 Spacebar → next stored-solution step (design D4): emit the next
      `{ kind: "move" }` from `state.soln`, adjusting the source for a
      partially-moved piece (`slide.c:1411-1414`).
- [ ] 5.4 `executeMove`: `movePiece` (the linked-list walk, `slide.c:1423`); the
      move-counting quirks (same piece again doesn't count, revert decrements —
      `lastmoved`/`lastmovedPos`); the stored-solution advance/stray/finish
      bookkeeping; set `completed` when the main anchor reaches `(tx,ty)`.
- [ ] 5.5 `solve()` returns `{ kind: "solve", moves }` from a fresh
      `solveBoard(..., movelimit = -1)`; error on unsolvable / already-solved.
      Test Solve **through a real `Midend`** (the soln threading lives in the
      move path, playbook §3.6).
- [ ] 5.6 `textFormat` — the board text (`board_text_format`); `canFormatAsText`
      stays static `true` (works on any `w×h`, design D8).

## 6. Rendering

- [ ] 6.1 Palette in C enum order (background + three highlight/lowlight triples
      each for normal / dragging / main / main-dragging / target — `slide.c:81-104`,
      the "base then highlight then lowlight" ordering `draw_tile` depends on).
      Derive from the app background; do **not** luminance-adjust for dark mode
      (playbook §3.3 — the app owns it).
- [ ] 6.2 `computeSize`/`setTileSize`: `w*TILESIZE` × `h*TILESIZE`, `BORDER = 0`
      (`NARROW_BORDERS` arm, design D7).
- [ ] 6.3 `redraw`: per-tile piece rendering with light/shadow bevels and inter-block
      borders (via a dsf over the board, `find_piecepart`), packed into an
      `Int32Array` cache key (playbook §3.2). **Every drag/solve overlay in the
      diff key** or it won't repaint.
- [ ] 6.4 The drag-follow + **landing shadow** overlay driven off the ephemeral
      drag `Ui` (piece follows pointer lit up; shadow at `dragCurrpos`), and the
      solve-piece highlight when a stored path exists (design D3). If `render`
      needs the release-move helper, split it into `moves.ts` (playbook §3.2).
- [ ] 6.5 The completion flash over `FLASH_TIME = 0.3 s` (three intervals). No
      slide interpolation — `animLength` is `0` (design D3).
- [ ] 6.6 Tier-2.5 render-scenario tests + snapshots: a grabbed piece, a
      mid-drag frame with its landing shadow, a solve-highlight frame, and a
      completion-flash frame.

## 7. Differential

- [ ] 7.1 `puzzles/auxiliary/slide-trace.c` on the established pattern; add its
      `cliprogram()` line.
- [ ] 7.2 Fixture matrix: every preset plus a size sweep (design D6), each seed
      dumping the generated desc and its `minmoves`.
- [ ] 7.3 `slide-differential.test.ts`: TS `newDesc` reproduces the C desc
      byte-for-byte **and** the TS `solveBoard` reports the same minimum move
      count for each C board.

## 8. Registration and stage 1 close-out

- [ ] 8.1 Register in `ts-ported-ids.ts` + `games/index.ts` (TS-served).
      `puzzles/unfinished/slide.c` stays — stage-2 gate.
- [ ] 8.2 Statusbar (design D8): surface move count / minimum the cheapest way the
      engine already supports; record which way it went.
- [ ] 8.3 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`).
- [ ] 8.4 `openspec validate add-slide-ts-port --strict`.
- [ ] 8.5 Dev-verify in the browser: grab / drag / snap / release, spacebar
      Solve stepping, completion flash, move counter, Custom params.
- [ ] 8.6 Update `docs/porting/game-port-playbook.md` (movement-drag input, the
      landing-shadow render, the two-role-`tree234` replacement).

## 9. Stage 2 — on owner acceptance only (gated on the catalog decision, design D9)

- [ ] 9.1 Move `puzzle(slide …)` from `puzzles/unfinished/CMakeLists.txt` into the
      **main** `puzzles/CMakeLists.txt` with `TS_PORTED` (and drop `solver(slide)`).
- [ ] 9.2 Delete `puzzles/unfinished/slide.c`.
- [ ] 9.3 `rm -rf build/wasm/` and rebuild — slide in the catalog, no `slide.wasm`
      (the playbook §1.1 gotcha: the entry *moved*, so the cache must be cleared).
      Icons already exist.
- [ ] 9.4 Archive, then commit port + archive together.
</content>
