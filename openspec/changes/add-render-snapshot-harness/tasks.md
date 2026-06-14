## 1. Shared recording GameDrawing

- [ ] 1.1 `src/native/engine/testing/recording-drawing.ts`: a `GameDrawing` that
      captures every call (rect/line/text/polygon/circle + clip/unclip;
      `blitter*` no-op) into a normalised, ordered `{ op, ...args, colour }`
      record. Colours resolved through the game palette to stable labels.
- [ ] 1.2 Deterministic: integer-rounded coords, stable colour labels,
      draw-order ordering. Unit-test the primitives.

## 2. Midend scenario driver

- [ ] 2.1 `src/native/engine/testing/render-scenario.ts`: `renderScenario({
      game, params, desc, moves?, showHint?, showMistakes? })` → drives a real
      `Midend` to the frame (replaying `Move`s, not pointer events), runs
      `redraw` against the recording drawing, returns the record (+ the active
      hint step for assertions).

## 3. Verification flow + seed

- [ ] 3.1 `toMatchSnapshot` on the record + targeted op assertions as the
      standard pattern (decided: vitest snapshots, no committed images).
- [ ] 3.2 Seed: Palisade hint tests — the `equivalentEdges` frame reached via
      prefix moves + `hint()` (assert action edge `COL_HINT`, sibling
      `COL_HINT_SIBLING`, region `COL_HINT_CELL`, clue unshaded) + a snapshot;
      plus at least one other rule's frame.

## 4. Optional SVG view

- [ ] 4.1 (Optional) `toSvg(record)` — z-ordered SVG of the same record for the
      rare case the composited frame needs inspecting. Not required by the test
      flow.

## 5. Docs + gate

- [ ] 5.1 Note the harness in `AGENTS.md` testing-tiers section (a snapshot/
      scenario tier alongside the recording-double tier).
- [ ] 5.2 Full gate green (tsc/biome/vitest/vite build); harness is dev-only.
- [ ] 5.3 Owner acceptance.
