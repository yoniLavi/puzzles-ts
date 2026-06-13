# Tasks: Pre-port tidy #2

## 1. Recessed-border helper
- [x] 1.1 Create `src/native/engine/draw.ts` with `drawRecessedBorder(dr,
  { left, top, right, bottom }, inset, highlight, lowlight)` drawing the two
  bevel pentagons in one canonical winding (per design D1).
- [x] 1.2 `draw.test.ts`: a recording `GameDrawing` double asserts the two
  `drawPolygon` calls and their vertices for a sample bound box.
- [x] 1.3 Migrate `fifteen`, `sixteen`, `twiddle`, `samegame`, `flood` to call
  it (each keeps its own edge/`hw` derivation; flood keeps its separator
  rectangle). Delete the five private copies.

## 2. Rect-outline helper
- [x] 2.1 Add `drawRectOutline(dr, x, y, w, h, colour)` to `draw.ts` using the
  upstream-inclusive convention (`x..x+w−1`); cover it in `draw.test.ts`.
- [x] 2.2 Migrate `blackbox` (delete its copy) and `galaxies` (replace the
  inline four-`drawLine` cursor block) to call it.
- [x] 2.3 Migrate `flood`: delete its copy and drop the compensating `−1` at the
  call site (`ts−1−inset*2` → `ts−inset*2`) so output stays pixel-identical.

## 3. Permutation-parity helper
- [x] 3.1 Move `permParity(perm, n)` into `src/native/engine/shuffle.ts`; export
  it; add a unit test (a few known permutations + their inversion parity).
- [x] 3.2 Repoint `fifteen/state.ts` and `sixteen/state.ts` to import it; delete
  both local copies. Per-game parity-correction logic stays local.

## 4. `describeParams` Game hook
- [x] 4.1 Add optional `describeParams?(p: Params): ConfigValues` to the `Game`
  interface in `game.ts`, documented as the type-summary config-values mapping
  (relationship to `augmentation.ts` `describeConfig`).
- [x] 4.2 Implement `describeParams` on each game with non-`w`/`h` config:
  `blackbox`, `pegs`, `sixteen`, `flip`, `galaxies`, `flood`, `guess`, `mosaic`,
  `samegame` — each returning its own typed extras (real booleans / numeric
  choice indices), value-for-value matching today's switch arm.
- [x] 4.3 Replace the `decodeCustomParams` switch in `worker-adapter.ts` with the
  generic `w`/`h` base + `...game.describeParams?.(p)` spread, keeping the
  `try/catch`. Delete the per-`puzzleId` branches.
- [x] 4.4 Extend `worker-adapter.test.ts`: keep the existing per-game decode
  assertions green (they now exercise the hook path); confirm the Guess
  real-boolean case still passes.

## 5. Gate
- [x] 5.1 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green. (No `build:wasm` change; no `dev` smoke needed — this
  is a no-visible-behaviour refactor verified by tier-2 render tests + the gate.)
- [x] 5.2 Spot-check in `npm run dev` that one bevelled game (e.g. Sixteen) and
  one outline game (Blackbox) render their borders/cursors unchanged, and one
  custom-params game's type summary (e.g. Guess "+ blank") still annotates —
  cheap confirmation the pixel-identity and config-identity claims hold live.
- [x] 5.3 Commit; archive the change.
