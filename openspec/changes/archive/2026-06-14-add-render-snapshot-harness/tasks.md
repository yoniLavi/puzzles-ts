## 1. Shared recording GameDrawing

- [x] 1.1 `src/native/engine/testing/recording-drawing.ts`: a `GameDrawing` that
      captures every call (rect/line/text/polygon/circle + clip/unclip;
      `blitter*` no-op) into a normalised, ordered `{ op, ...args, colour }`
      record. Colours resolved through the game palette to stable `rgb()` labels
      (raw index kept too).
- [x] 1.2 Deterministic: integer-rounded coords, stable colour labels,
      draw-order ordering. Unit-tested the primitives (`recording-drawing.test.ts`).

## 2. Midend scenario driver

- [x] 2.1 `src/native/engine/testing/render-scenario.ts`: `renderScenario({
      game, id, moves?, showHint?, hintUntil?, showMistakes? })` → drives a real
      `Midend` to the frame (replaying `Move`s via the new `Midend.playMoves`, not
      pointer events; optionally walking the hint plan via `hintUntil`), runs
      `redraw` against the recording drawing, returns the record + the active
      hint step (`Midend.activeHintStep`) + mistake count + size + palette +
      midend. Mechanics covered by `render-scenario.test.ts`.

## 3. Verification flow + seed

- [x] 3.1 `toMatchSnapshot` on the record + targeted op assertions as the
      standard pattern (decided: vitest snapshots, no committed images).
- [x] 3.2 Seed: Palisade hint tests (`palisade-render-scenario.test.ts`) — the
      `equivalentEdges` frame reached in-process by walking the hint plan
      (`hintUntil` siblings present) over a deterministic seed scan (assert
      action edge `COL_HINT`, sibling `COL_HINT_SIBLING`, region `COL_HINT_CELL`,
      clue digits still drawn) + a fixed opener-frame snapshot exercising a
      second rule.

## 4. Optional SVG view

- [x] 4.1 (Optional) `toSvg(record, size)` (`svg-drawing.ts`) — z-ordered SVG of
      the same record for the rare case the composited frame needs inspecting.
      Not required by the test flow; smoke-tested in `render-scenario.test.ts`.

## 5. Docs + gate

- [x] 5.1 Note the harness in `AGENTS.md` testing-tiers section (added "Tier 2.5
      — render scenarios + snapshots").
- [x] 5.2 Full gate green: tsc 0, biome lint clean (237 files), vitest 1088
      passed (incl. 13 new), vite build OK. Harness is dev-only (no
      runtime/bundle impact). `toMatchSnapshot` baseline generated and committed.
- [x] 5.3 Owner acceptance (2026-06-14).
