# Tasks — add-netslide-ts-port

## 1. Scaffold + state/codec

- [x] 1.1 `scripts/new-game-port.sh netslide`; fill `state.ts`: params
      (`w`, `h`, `wrapping`, `barrierProbability`, `movetarget`),
      encode/decode/validate params (incl. the `%g`/`atof` float handling,
      D10), the wire/barrier bit constants and rotation helpers, desc codec
      (hex wire digit + optional `v`/`h` barrier markers), `newState`
      (parse desc, add border barriers when not wrapping, compute the
      barrier corner flags), `cloneState` (barriers shared, D9), the move
      union (D8), the slide primitives, and the ring-cursor helpers
      `c2pos`/`c2diff`/`pos2c` (D2).
- [x] 1.2 Tier-1 tests: params round-trip (all 9 presets + wrapping +
      fractional barrier probability + movetarget), desc round-trip,
      `validateDesc` rejections (short, long, bad character), slide
      primitives wrap correctly in both directions, ring cursor walks the
      border and skips the centre row/column.
- [x] 1.3 The `solver.ts` scaffold stub was **deleted** — Netslide has no
      solver (`solve` replays the generator's `aux`).

## 2. Generator (byte-match-critical)

- [x] 2.1 `generator.ts`: spanning-tree grid growth over a `SortedMultiset`
      keyed by `xyd_cmp` (D1) — suppress the fourth arm of a T-piece, drop
      possibilities pointing into the tile just reached (loop avoidance), add
      the new frontier; then the shuffle (with the reject-after-drawing loop
      reproduced exactly, D6.2); then barrier selection from the
      post-shuffle candidate set (D6.3); then desc encoding + the `aux`
      unshuffled grid.
- [x] 2.2 Tier-1 tests: generated grids are spanning trees (every tile
      reachable from the centre, no full-cross tile, arm count = 2(wh − 1) so
      no loop); wires and barriers are symmetric; a higher barrier probability
      on the same seed keeps the grid and yields a superset of the walls;
      `aux` solves the board.

## 3. `computeActive`, moves, and the Game glue

- [x] 3.1 `index.ts`: `computeActive` flood (D5), `executeMove`
      (slide + solve, completion detection), `interpretMove` (border-arrow
      hit-testing, right button reverses — D7; ring cursor + select),
      presets, `status`, `solve` (replay `aux`), `statusbarText`,
      `animLength`/`flashLength`, `describeParams`, `paramConfig`,
      `registerGame`.
- [x] 3.2 Tier-1 tests: a slide move produces the expected grid and is undone
      by its opposite; `executeMove` is pure; clicking each of the four border
      gutters emits the right move and the right button reverses it; a click
      beside the centre row/column (or on the board) is refused; the win
      condition fires exactly when every tile is active; a mid-slide line
      reports unpowered.

## 4. Render

- [x] 4.1 `render.ts`: palette index-for-index with the C enum; `computeSize`
      on the **`NARROW_BORDERS`** geometry (D4); the per-tile `Int32Array`
      cache (packed wires | ACTIVE | FLASHING); wire drawing with
      powered/unpowered colour, endpoint + centre boxes, cross-border
      connection stubs; barriers with their corner-joining flags; the border
      arrows incl. the cursor-highlighted one; the slide animation with the
      wrapped tile drawn off-grid; the distance-from-centre completion flash.
- [x] 4.2 Tier-2.5 render-scenario tests: an opener frame snapshot + targeted
      assertions (powered vs unpowered wires, barriers drawn); a mid-slide
      frame draws the moving row a whole tile past the grid's last column
      (against a settled frame that never does); the completion flash ripples
      outward (frame 1 = the centre tile alone, frame 2 = the ring of 8), and
      Solve is deliberately *not* celebrated.

## 5. Differential

- [x] 5.1 Transient C trace harness `puzzles/auxiliary/netslide-trace.c` +
      the `cliprogram` line; built **pure-C** (`-DUSE_TS_RANDOM=0`, playbook
      §4.2); fixtures recorded (9 presets + wrapping / fractional-barrier /
      movetarget / non-square / 2×2 variants, 15 in all) to
      `__fixtures__/netslide-c-reference.json`.
- [x] 5.2 Gated `netslide-differential.test.ts` via `describeDescDifferential`
      — **byte-match green on the first run**, desc *and* `aux`, all 15
      fixtures.

## 6. Registration + gate (stage 1)

- [x] 6.1 Register: `ts-ported-ids.ts` + import in `games/index.ts`.
- [x] 6.2 Icons: already committed (netslide has always been in the catalog as
      a C game) — `src/assets/icons/netslide-{64,128}d8.png`. Nothing to do.
- [x] 6.3 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run`,
      2498 tests → `vite build`); `openspec validate --strict` passes.
- [x] 6.4 Dev-verified in the browser (Playwright, 3×3 easy and 5×5 hard):
      board renders with wires / powered-cyan / blue endpoints / black centre /
      red barriers; gutter arrows on every slidable line and none beside the
      centre row or column; left-click slides and wraps; right-click reverses;
      the keyboard ring cursor skips the centre lines and highlights its arrow;
      Enter slides it; Solve powers the whole board (Active 9/9) and fires the
      completion dialog; the wrapping preset has no border walls; the status
      bar tracks moves and the active count; the game menu correctly offers a
      plain **Quick-save** (no Check & Save — netslide has no `findMistakes`);
      **0 console errors**.

## 7. Owner acceptance → stage 2

- [ ] 7.1 Owner accepts full behavioural parity.
- [ ] 7.2 Flip `TS_PORTED` in `puzzles/CMakeLists.txt`; delete
      `puzzles/netslide.c` + `puzzles/auxiliary/netslide-trace.c` (+ its
      CMake line); `rm -rf build/wasm/` and rebuild; confirm netslide is in
      the catalog with no `netslide.wasm`.
- [ ] 7.3 Update `AGENTS.md` with the port entry; `openspec archive
      add-netslide-ts-port --yes` in the same commit as the C deletion.
