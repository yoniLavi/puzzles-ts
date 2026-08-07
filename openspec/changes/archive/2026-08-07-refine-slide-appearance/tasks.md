# Tasks — refine-slide-appearance

## 0. Prerequisite (found while doing 1.1; landed as its own commit `4166828`)

- [x] 0.1 A pure white had no dark-mode value at all — `oklch(NaN% 0 0)`, which a
      canvas ignores silently. 57 palette entries in 42 games; Slide's blocks had
      lost the lowlight half of every bevel, so no ladder could be judged in dark
      mode until it was fixed. See `design.md` D0.

## 1. Decide the look

- [x] 1.1 Establish the contrast ladder for floor / wall / ordinary block / main
      block, in both schemes, sourced from the shared palette. Three variants
      rendered side by side in both schemes; A chosen, B and C rejected with
      reasons (`design.md` D1).
- [x] 1.2 Choose the exit marking to replace the crosshatch; check it at the
      smallest shipped tile size. A dashed outline around the gate *region*, in
      the wall's colour — a boundary rather than a fill, because the gate usually
      lies on top of the exit (`design.md` D2).
- [x] 1.3 Choose the next-piece mark; it must read as "next", not as a highlight.
      The piece keeps its fill and wears an accent band; its destination is the
      same accent as an empty outline (`design.md` D3).
- [x] 1.4 Confirm the target green still reads as the goal against the new
      contrast — kept, and now more prominent by everything else stepping back,
      which is the pairing the author's own note asks for.

## 2. Implement

- [x] 2.1 Colours through `engine/colour/colours.ts` / `colour/palette.ts`; no new
      literals in `render.ts`. Four board materials as functions of the host
      background in `palette-games.ts`; the route accent is `ORANGE`.
- [x] 2.2 `paletteSwaps` in `augmentation.ts` kept coherent — two pairs added, and
      the dark-mode pass extracted to `src/puzzle/dark-palette.ts` so the pairs
      could be tested at all (`design.md` D4).

## 3. Verify

- [x] 3.1 Tier-2.5 render scenarios re-baselined; op diff reviewed **mechanically**
      rather than by eye: with colours stripped, three of the four existing
      snapshots are byte-identical (so every changed line is a colour, and no op
      was added, removed or moved), and the fourth differs by exactly one removed
      rect — the destination ghost's interior, which is the change.
- [x] 3.2 `scripts/checks/colour-dark-check.test.ts` run. Three new rows, all
      `paletteSwaps` members, none a defect; the report now marks and explains
      them, and the invariant they *do* owe is asserted in
      `src/puzzle/dark-palette.test.ts` (`design.md` D4).
- [x] 3.3 Browser pass in both schemes (Chrome, via the `playwright-cli` skill),
      0 console errors. Pixel-probed rather than eyeballed: wall, floor and
      ordinary block were the identical `(212,213,213)` before and are
      `(123,123,123)` / `(212,213,213)` / `(168,168,168)` after, with the floor
      and the exit untouched.
- [x] 3.4 Full gate green.

## 4. Close out

- [x] 4.1 Spec delta into `slide`, plus one into `ts-engine` for the swap
      invariant (which is the engine's rule, not Slide's).
- [x] 4.2 Owner acceptance on the appearance before archiving. **Accepted
      2026-08-07**, including the D1 judgement flagged for overruling (the wall
      as the lightest large area under a dark scheme) — it stands.
