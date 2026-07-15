# Tasks — add-net-ts-port

## 0. Shared wire module (extract from netslide first, behaviour-preserving)

- [x] 0.1 Create the shared wire module (direction algebra `R/U/L/D`/`A`/`C`/`F`/`ROT`/`X`/`Y`/
      `COUNT`/`offset`, the hex desc codec with `v`/`h` barrier markers, the spanning-tree
      grower over `sorted-multiset`, `computeActive`). **Wire bits only (0x0F)** — leave the
      high bits to each game (0x10 collides: netslide `FLASHING`, Net `LOCKED`). Promote
      `sorted-multiset` per its docstring.
- [x] 0.2 Repoint netslide at the shared module. **Its render snapshots and differential MUST
      stay byte-identical** — run them; if either moves, the extraction is wrong (D2). This is
      the acceptance bar for task 0, before any Net code.

## 1. Scaffold + state/codec

- [x] 1.1 `scripts/new-game-port.sh net`; `state.ts`: params (`w`, `h`, `wrapping`,
      `barrierProbability`, `unique`), encode/decode/validate (incl. `unique && wrapping &&
      (w==2||h==2)` rejection, D5), the tile bits (wires 0x0F + `LOCKED` 0x10 + `ACTIVE`),
      desc codec via the shared module, `newState` (parse, add implicit border barriers when
      not wrapping, **re-derive wrapping=false when every border is walled** — D5), the shared
      immutable barrier block, `cloneState`.
- [x] 1.2 Tier-1 tests: params + desc round-trip (presets + wrapping + fractional barrier
      prob + non-unique); `validateDesc` rejections; the wrapping re-derivation fires when a
      wrapping desc has a full border wall.

## 2. Solver + generator (byte-match-critical)

- [x] 2.1 `solver.ts`: `net_solver` over `engine/dsf.ts` (tile/edge state, dead-ends, todo
      FIFO + marked bitmap, equivalence classes), returning inconsistent/ambiguous/unique;
      `solve` (replay `aux` if present, each digit `|LOCKED`, unlock→rotate→relock; else solve
      the current grid).
- [x] 2.2 `generator.ts`: spanning tree → `aux` → **uniqueness gate** (`net_solver` + `perturb`
      loop, regenerate on stall) → shuffle (per-tile rotate, loop-elimination inner loop, ≥1
      mismatched edge) → barriers (post-shuffle superset) → desc. Every `random_upto` in
      order (D6).
- [x] 2.3 `perturb` (~287 lines): rewire an ambiguous region preserving the spanning tree.
- [x] 2.4 Tier-1 tests: generated grids are spanning trees (all reachable from source, no full
      cross, arm count right); `unique` boards solve to a unique solution with no guessing; a
      higher barrier prob on a seed is a superset; `aux` solves the board.

## 3. Game glue

- [x] 3.1 `index.ts`: `computeActive` + `computeLoops` (over `engine/findloop.ts`, gated by the
      pref), `executeMove` (rotate/lock/jumble/solve; `lastRotateDir` on the state; `noanim`
      for J/S), `interpretMove` (rotate L/R, lock middle/`s`, `f` 180°, jumble expands to an
      explicit move list via a Ui RNG — D4; cursor / Ctrl-source / Shift-origin as
      `UI_UPDATE`; **null for out-of-grid / gutter / rotate-on-locked** — D1, no state
      comparison), `status`, `statusbarText`, the `unlocked-loops` pref, `animLength`/
      `flashLength`, `describeParams`/`paramConfig`, `registerGame`.
- [x] 3.2 `encodeUi`/`decodeUi`: origin `org_x/org_y`, source `cx/cy` survive a
      save (D4); `completed` is state, recovered by move-log replay. **D8's
      `getCursorLocation` origin fix is moot**: the TS `Game` interface has no
      `game_get_cursor_location` hook (the on-screen-keyboard rect isn't part of
      the port surface), so there is nothing to diverge — noted here, not fixed.
- [x] 3.3 Tier-1 tests: `executeMove` pure; rotate/lock/180/jumble/solve transitions; a
      rotate-on-locked click yields no move; `A` then `C` restores the grid and leaves two undo
      entries (the "cycle" non-issue, D1); jumble replays deterministically from its expanded
      move list; win fires exactly when every tile is active; source move re-powers.

## 4. Render (fresh — not shared, D2)

- [x] 4.1 `render.ts`: palette index-for-index with the C enum (`COL_LOCKED` = 0.75·bg,
      `COL_BORDER` = 0.5·bg); **`NARROW_BORDERS` → zero gutter** (D8); the packed 32-bit cache
      word (barriers/corners/keyboard-cursor/wires 2-bits-per-dir incl. error/endpoint/
      on-edge/rotating/locked); `draw_wires`/`draw_tile` (rotated-polygon wires, three colour
      passes incl. the error colour, endpoint + source boxes, cross-border stubs); barriers
      with corner-join flags; the rotation animation (render the old state, repaint the
      rotating tile every frame — D9); the source-centred completion flash.
- [x] 4.2 Tier-2.5 render-scenario tests + snapshots: powered vs unpowered wires; a locked
      tile drawn in `COL_LOCKED`; a barrier-adjacent locked-tile error edge in `COL_ERR`; a
      mid-rotation frame (old state + partial angle) against a settled frame; the flash ripple
      from the source; Solve not celebrated.

## 5. Differential

- [x] 5.1 Transient `puzzles/auxiliary/net-trace.c` (+ its `cliprogram` line), built pure-C
      (`-DUSE_TS_RANDOM=0`); record preset/seed → desc + `aux` fixtures (presets + wrapping +
      fractional barrier + non-unique + non-square).
- [x] 5.2 Gated `net-differential.test.ts`: **byte-match** desc and `aux` for every fixture —
      the guard that `net_solver` + `perturb` + the generator order are faithful (D6, D7).

## 6. Registration + gate (stage 1)

- [x] 6.1 Register: `ts-ported-ids.ts` + `games/index.ts`. Icons already committed.
- [x] 6.2 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build`;
      `openspec validate --strict`. **Netslide's suite must be green with no snapshot churn**
      (task 0.2's guarantee, re-checked at the gate).
- [x] 6.3 Dev-verify in the browser (Playwright smoke): the 5×5 board renders with the "TS"
      badge — black source box, cyan powered wires flooding from it, blue/cyan endpoints, black
      unpowered wires, and the red non-wrapping border; "Active: k/25" tracks in the status bar;
      left-clicking a tile rotates it and the active count updates; undo enables; **0 console
      errors** (only the ubiquitous Lit dev-mode warning). Remaining owner-acceptance items
      (animation smoothness, flash ripple, keyboard cursor, Ctrl/Shift moves, `unlocked-loops`
      toggle, Solve) are the stage-2 acceptance surface below.

## 7. Owner acceptance → stage 2

- [x] 7.1 Owner acceptance of full behavioural parity (2026-07-15).
- [x] 7.2 Flip `TS_PORTED`; delete `puzzles/net.c` + `puzzles/auxiliary/net-trace.c` (+ its
      CMake line); `rm -rf build/wasm/` and rebuild; net in the catalog with no `net.wasm`.
- [x] 7.3 Dev guides updated with what this port taught (the shared `engine/wires.ts` model
      added to the playbook §2.1 helper list). The undo-equality risk was already struck from
      `AGENTS.md` during scoping (verified unevidenced across the C tree, D1); the playbook §1
      risk table row is now updated to match — Net shipped needing no state comparison.
- [x] 7.4 `openspec archive add-net-ts-port` in the same commit as the C deletion.
