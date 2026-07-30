# Tasks — add-slide-ts-port

> **Stage boundary corrected during implementation.** The brief put the catalog
> move in stage 2. For an `unfinished/` game that is wrong: the game is absent from
> `catalog.json`, so registering it alone makes `ts-ported-ids.test.ts` fail and the
> game still doesn't appear — it cannot be smoke-tested at all until its `puzzle()`
> moves into the main `CMakeLists.txt` (playbook §1.1, as for Sokoban / Separate /
> Group). So the catalog move is **stage 1**; what stays gated on owner acceptance
> is the **C deletion**.

## 1. Scaffold and survey

- [x] 1.1 `src/native/games/slide/` written against the C reference, on the
      established multi-file shape (`state` / `solver` / `generator` / `moves` /
      `render` / `index`).
- [x] 1.2 Long-tail-risk checklist clean (design intro): no `supersededDesc`, no
      state-string undo, no `#ifdef EDITOR` letters, no print promise. Three
      *frontend* traps did bite and are recorded as design F1.

## 2. Params, state and desc codec

- [x] 2.1 `SlideParams { w, h, maxmoves }`; `encodeParams`/`decodeParams`
      (`%dx%d` then `m%d` or `u`; an absent suffix keeps the default limit, as
      upstream's mutate-a-default-struct decode does).
- [x] 2.2 `validateParams` in upstream order (`w ≤ 251` → `w ≥ 5` → `h ≥ 4`), plus
      two rejections upstream cannot satisfy: `MAX_CELLS` and a zero move limit
      (design F2/F8).
- [x] 2.3 `paramConfig` (Width / Height / "Solution length limit") with the C's
      config slugs and `parseConfigInt`. Browser-verified.
- [x] 2.4 All three upstream presets; `describeParams` emits the keys
      `augmentation.ts` reads (`width` / `height` / `solution-length-limit`).
- [x] 2.5 State: canonical `board`, immutable `forcefield` shared by reference,
      `tx`/`ty`, `minmoves`, `lastmoved`/`lastmovedPos`, `movecount`, `completed`,
      `cheated`, `soln`/`solnIndex`.
- [x] 2.6 Desc codec ported as exact inverses (byte-match surface, incl. the
      quirk that a `d` cell carries no forcefield prefix).
- [x] 2.7 `validateDesc` rejects every case upstream does, distinguishing too much
      from too little data.

## 3. The BFS solver (idiomatic `tree234` replacement)

- [x] 3.1 `solveBoard(...)`, with the reasoning for *not* porting `tree234` and
      *not* using `SortedMultiset` in the module doc. The visited set is a hashed
      bucket map with exact byte comparison — `memcmp` semantics, no per-candidate
      allocation (design F8: the obvious string key was 35% of generation time).
- [x] 3.2 Per-board expansion ported verbatim, including the direction order and
      the apparently redundant re-enqueue of the anchor's own square, because the
      enumeration order decides which shortest route is reported and the generator
      is gated on it.
- [x] 3.3 Solution reconstruction by diffing consecutive boards.
- [x] 3.4 Tier-1 tests: a hand-built board's known minimum, an insoluble board,
      the move limit cutting the search at the right depth, and the forcefield rule
      in both directions.

## 4. The generator

- [x] 4.1 Wall border + singleton fill, the fixed main piece and fixed target +
      forcefield exit (upstream's unvaried placement, FIXMEs and all), singletons
      removed in scan order until soluble — **plus the missing final check**
      (design F2).
- [x] 4.2 The edge-merge phase: one `shuffle`, then merge-if-still-soluble with the
      `tried_merge` matrix and its read-after-write propagation ported verbatim.
- [x] 4.3 `newDesc` emitting the desc + `,tx,ty,minmoves`; no `aux` (Slide's
      `solve` re-runs the BFS).
- [x] 4.4 Tier-1: presets and small sizes generate soluble boards whose `minmoves`
      matches a fresh solve; the smallest sizes generate at all (design F2).

## 5. Input, moves and completion

- [x] 5.1 `SlideMove` discriminated union, not a move string.
- [x] 5.2 `interpretMove` drag phases (grab → reachability BFS; follow →
      Manhattan-spiral snap; release → move or `UI_UPDATE`), via the shared
      `fromCoord` with `BORDER = 0`. Right folds onto left for touch (design F1).
- [x] 5.3 Step key → next stored-route step, bound to the buttons the frontend
      **actually delivers** (design F1 — upstream's `' '` is dead code here).
- [x] 5.4 `executeMove`: `movePiece`, the move-counting quirks, the route
      advance/stray/finish bookkeeping, and completion.
- [x] 5.5 `solve()` from a fresh BFS — **from the current position**, fixing the
      defect in design F3. Tested through a real `Midend`.
- [x] 5.6 `textFormat` (with the two display-only corrections, design F5).
- [x] 5.7 `changedState` cancels a drag left dangling across a state change
      (design F4) — not in the brief; upstream asserts here.

## 6. Rendering

- [x] 6.1 Palette in C enum order (the `augmentation.ts` dark-mode `paletteSwaps`
      are keyed by index, and `drawTile` derives `ch`/`cl` as `cc+1`/`cc+2`).
      No luminance adjustment — the app owns dark mode.
- [x] 6.2 `computeSize`/`setTileSize`: `w*TILESIZE × h*TILESIZE`, `BORDER = 0`.
- [x] 6.3 `redraw` with per-tile `Int32Array` cache. Every overlay (drag, route
      highlight, shadow, flash) is part of the one packed word, so all are in the
      diff key by construction.
- [x] 6.4 Drag-follow + landing shadow off the ephemeral drag `Ui`, and the
      route-piece highlight. `movePiece`/`executeMove` live in `moves.ts` so
      `render` and `index` don't form a cycle.
- [x] 6.5 Completion flash over `FLASH_TIME`; no slide interpolation.
- [x] 6.6 Tier-2.5 render scenarios + snapshots: opening frame, a mid-drag frame,
      a route frame with its shadow, the highlight advancing, and two *different*
      flash phases (a snapshot alone can't show the animation is moving). The drag
      and route frames are captured on a **warm** draw state.

## 7. Differential

- [x] 7.1 `puzzles/auxiliary/slide-trace.c` + its `cliprogram()` line.
- [x] 7.2 Fixture matrix: all three presets, a size sweep, three move-limited
      boards; each records the desc, an independently re-derived `minMoves`, and the
      C's own `genMs`. Sizes below 5×5 are excluded — the C aborts there (F2).
- [x] 7.3 `slide-differential.test.ts`: **13/13 byte-for-byte, first run**, plus
      TS-solver agreement on every board's minimum (design F7).

## 8. Registration, catalog move and stage-1 close-out

- [x] 8.1 Registered in `ts-ported-ids.ts` + `games/index.ts`.
- [x] 8.2 `puzzle(slide …)` moved from `puzzles/unfinished/CMakeLists.txt` into the
      main `puzzles/CMakeLists.txt` with `TS_PORTED`; `solver(slide)` dropped.
      `rm -rf build/wasm/` then rebuilt — slide is in the catalog with no
      `slide.wasm`, and icons already existed. (Only `nullgame.wasm` remains in the
      whole build.)
- [x] 8.3 Statusbar via the existing `wantsStatusbar` + `statusbarText` — no engine
      addition needed (design F6, resolving D8).
- [x] 8.4 Full gate green (`tsc -b --noEmit` → biome → `vitest run` →
      `vite build`): 5280 tests, 241 files.
- [x] 8.5 `openspec validate add-slide-ts-port --strict`.
- [x] 8.6 Dev-verified in Chrome: board renders (walls, bevelled blocks, blue main
      block, green target, cattle-grid exit); drag grab/follow/snap/release with the
      block lit up at its landing square; move counter and all four statusbar
      states; Solve installing a route with the next-block highlight + landing
      shadow; Space walking the route to completion in exactly `minmoves` moves;
      the completion flash; deep-link by game ID; the Custom dialog with all three
      fields and the `MAX_CELLS` rejection message. **0 console errors.**
- [x] 8.7 Update `docs/porting/game-port-playbook.md` (the dead-step-key trap, the
      drag-preview/`changedState` interaction, the two-role `tree234` replacement,
      and the visited-set cost finding).

## 9. Stage 2 — owner-accepted 2026-07-30

- [x] 9.1 Deleted `puzzles/unfinished/slide.c` and `puzzles/auxiliary/slide-trace.c`
      (+ its `cliprogram()` line). The frozen fixture stays as the gated check's
      baseline, and the differential's header now says the oracle must be recovered
      from git history rather than rebuilt in place. `puzzles/.gitignore` keeps its
      `/unfinished/slide` entries, matching every prior port (it still lists every
      already-deleted game).
- [x] 9.2 `rm -rf build/wasm build/native` and rebuilt: slide in the catalog, no
      `slide.wasm`, and `unfinished/` emits no wasm at all. **Only
      `nullgame.wasm` remains in the whole build.**
- [x] 9.3 Archived (→ `openspec/specs/slide/spec.md`, 4 requirements) and committed
      with the C deletion.

## 10. Carried forward (not blocking)

- [ ] 10.1 The three author-flagged graphics items, incl. the target green the owner
      raised on acceptance — kept as-is for now, with the analysis in this change's
      `design.md` "Open questions" §3 and a pointer in the migration-status memory.
      Scope an openspec change if/when they are greenlit.
