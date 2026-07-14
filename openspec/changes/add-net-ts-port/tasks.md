# Tasks — add-net-ts-port

## 0. Shared wire module (extract from netslide first, behaviour-preserving)

- [ ] 0.1 Create the shared wire module (direction algebra `R/U/L/D`/`A`/`C`/`F`/`ROT`/`X`/`Y`/
      `COUNT`/`offset`, the hex desc codec with `v`/`h` barrier markers, the spanning-tree
      grower over `sorted-multiset`, `computeActive`). **Wire bits only (0x0F)** — leave the
      high bits to each game (0x10 collides: netslide `FLASHING`, Net `LOCKED`). Promote
      `sorted-multiset` per its docstring.
- [ ] 0.2 Repoint netslide at the shared module. **Its render snapshots and differential MUST
      stay byte-identical** — run them; if either moves, the extraction is wrong (D2). This is
      the acceptance bar for task 0, before any Net code.

## 1. Scaffold + state/codec

- [ ] 1.1 `scripts/new-game-port.sh net`; `state.ts`: params (`w`, `h`, `wrapping`,
      `barrierProbability`, `unique`), encode/decode/validate (incl. `unique && wrapping &&
      (w==2||h==2)` rejection, D5), the tile bits (wires 0x0F + `LOCKED` 0x10 + `ACTIVE`),
      desc codec via the shared module, `newState` (parse, add implicit border barriers when
      not wrapping, **re-derive wrapping=false when every border is walled** — D5), the shared
      immutable barrier block, `cloneState`.
- [ ] 1.2 Tier-1 tests: params + desc round-trip (presets + wrapping + fractional barrier
      prob + non-unique); `validateDesc` rejections; the wrapping re-derivation fires when a
      wrapping desc has a full border wall.

## 2. Solver + generator (byte-match-critical)

- [ ] 2.1 `solver.ts`: `net_solver` over `engine/dsf.ts` (tile/edge state, dead-ends, todo
      FIFO + marked bitmap, equivalence classes), returning inconsistent/ambiguous/unique;
      `solve` (replay `aux` if present, each digit `|LOCKED`, unlock→rotate→relock; else solve
      the current grid).
- [ ] 2.2 `generator.ts`: spanning tree → `aux` → **uniqueness gate** (`net_solver` + `perturb`
      loop, regenerate on stall) → shuffle (per-tile rotate, loop-elimination inner loop, ≥1
      mismatched edge) → barriers (post-shuffle superset) → desc. Every `random_upto` in
      order (D6).
- [ ] 2.3 `perturb` (~287 lines): rewire an ambiguous region preserving the spanning tree.
- [ ] 2.4 Tier-1 tests: generated grids are spanning trees (all reachable from source, no full
      cross, arm count right); `unique` boards solve to a unique solution with no guessing; a
      higher barrier prob on a seed is a superset; `aux` solves the board.

## 3. Game glue

- [ ] 3.1 `index.ts`: `computeActive` + `computeLoops` (over `engine/findloop.ts`, gated by the
      pref), `executeMove` (rotate/lock/jumble/solve; `lastRotateDir` on the state; `noanim`
      for J/S), `interpretMove` (rotate L/R, lock middle/`s`, `f` 180°, jumble expands to an
      explicit move list via a Ui RNG — D4; cursor / Ctrl-source / Shift-origin as
      `UI_UPDATE`; **null for out-of-grid / gutter / rotate-on-locked** — D1, no state
      comparison), `status`, `statusbarText`, the `unlocked-loops` pref, `animLength`/
      `flashLength`, `describeParams`/`paramConfig`, `registerGame`.
- [ ] 3.2 `encodeUi`/`decodeUi`: origin `org_x/org_y`, source `cx/cy`, `completed` survive a
      save (D4). Fix `getCursorLocation` to apply the origin (D8 — upstream bug, we diverge).
- [ ] 3.3 Tier-1 tests: `executeMove` pure; rotate/lock/180/jumble/solve transitions; a
      rotate-on-locked click yields no move; `A` then `C` restores the grid and leaves two undo
      entries (the "cycle" non-issue, D1); jumble replays deterministically from its expanded
      move list; win fires exactly when every tile is active; source move re-powers.

## 4. Render (fresh — not shared, D2)

- [ ] 4.1 `render.ts`: palette index-for-index with the C enum (`COL_LOCKED` = 0.75·bg,
      `COL_BORDER` = 0.5·bg); **`NARROW_BORDERS` → zero gutter** (D8); the packed 32-bit cache
      word (barriers/corners/keyboard-cursor/wires 2-bits-per-dir incl. error/endpoint/
      on-edge/rotating/locked); `draw_wires`/`draw_tile` (rotated-polygon wires, three colour
      passes incl. the error colour, endpoint + source boxes, cross-border stubs); barriers
      with corner-join flags; the rotation animation (render the old state, repaint the
      rotating tile every frame — D9); the source-centred completion flash.
- [ ] 4.2 Tier-2.5 render-scenario tests + snapshots: powered vs unpowered wires; a locked
      tile drawn in `COL_LOCKED`; a barrier-adjacent locked-tile error edge in `COL_ERR`; a
      mid-rotation frame (old state + partial angle) against a settled frame; the flash ripple
      from the source; Solve not celebrated.

## 5. Differential

- [ ] 5.1 Transient `puzzles/auxiliary/net-trace.c` (+ its `cliprogram` line), built pure-C
      (`-DUSE_TS_RANDOM=0`); record preset/seed → desc + `aux` fixtures (presets + wrapping +
      fractional barrier + non-unique + non-square).
- [ ] 5.2 Gated `net-differential.test.ts`: **byte-match** desc and `aux` for every fixture —
      the guard that `net_solver` + `perturb` + the generator order are faithful (D6, D7).

## 6. Registration + gate (stage 1)

- [ ] 6.1 Register: `ts-ported-ids.ts` + `games/index.ts`. Icons already committed.
- [ ] 6.2 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build`;
      `openspec validate --strict`. **Netslide's suite must be green with no snapshot churn**
      (task 0.2's guarantee, re-checked at the gate).
- [ ] 6.3 Dev-verify in the browser: wires render powered/unpowered; left/right rotate,
      middle locks, `f` flips, `j` jumbles; the keyboard cursor rotates and locks; Ctrl-arrow
      moves the source and re-powers; on a wrapping preset Shift-arrow shifts the origin and
      there is no border wall; the `unlocked-loops` pref toggles loop highlighting; Solve
      powers and locks the whole board; the rotation animation plays and the completion flash
      ripples from the source; the game menu offers a plain Quick-save (no Check & Save); 0
      console errors.

## 7. Owner acceptance → stage 2

- [ ] 7.1 Owner acceptance of full behavioural parity.
- [ ] 7.2 Flip `TS_PORTED`; delete `puzzles/net.c` + `puzzles/auxiliary/net-trace.c` (+ its
      CMake line); `rm -rf build/wasm/` and rebuild; net in the catalog with no `net.wasm`.
- [ ] 7.3 Dev guides updated with what this port taught. **Delete the false "Net's rotation
      cycles" parenthetical from `AGENTS.md`'s undo-equality risk** — and note the risk itself
      is unevidenced across the C tree (D1), so a future port need not fear it.
- [ ] 7.4 `openspec archive add-net-ts-port` in the same commit as the C deletion.
