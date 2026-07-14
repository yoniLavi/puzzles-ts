# Tasks

## 1. Render

- [x] 1.1 `render.ts`: resolve the hinted tile's cell in the board being drawn —
      `landing` while that step's own slide animates, `tile` otherwise
      (`isMoveBeingAnimated`).
- [x] 1.2 `render.ts`: draw the destination/landing outlines in `drawHintTargets`,
      after every tile and at the cell's unshifted position; keep the outline bits in
      the cache word so a stale outline is still repainted away.

## 2. Tests

- [x] 2.1 `netslide-hint.test.ts`: a mid-slide frame on a board whose hint aims at a
      cell *on the line being slid* — the tile mark is drawn at the tile's offset
      position, the destination outline at the cell's own.
- [x] 2.2 Re-baseline the hint render snapshot (paint order only).

## 3. Guides

- [x] 3.1 `docs/porting/hint-authoring.md`: a mark on a *tile* rides the animation; a
      mark on a *cell* does not — and mid-animation the displayed step's indices still
      refer to the pre-move board.

## 4. Gate

- [x] 4.1 `tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build`.
- [x] 4.2 Dev-verify a real mid-slide frame in the browser.
- [x] 4.3 `openspec validate fix-netslide-hint-anim-marks --strict`.
