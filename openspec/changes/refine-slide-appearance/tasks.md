# Tasks — refine-slide-appearance

## 1. Decide the look

- [ ] 1.1 Establish the contrast ladder for floor / wall / ordinary block / main
      block, in both schemes, sourced from the shared palette.
- [ ] 1.2 Choose the exit marking to replace the crosshatch; check it at the
      smallest shipped tile size.
- [ ] 1.3 Choose the next-piece mark; it must read as "next", not as a highlight.
- [ ] 1.4 Confirm the target green still reads as the goal against the new
      contrast — the owner's 2026-07-30 decision to keep it stands unless the
      change makes it wrong.

## 2. Implement

- [ ] 2.1 Colours through `engine/colour/colours.ts` / `colour/palette.ts`; no new literals in
      `render.ts`.
- [ ] 2.2 `paletteSwaps` in `augmentation.ts` kept coherent.

## 3. Verify

- [ ] 3.1 Tier-2.5 render scenarios re-baselined; review the op diff.
- [ ] 3.2 `scripts/checks/colour-dark-check.test.ts` clean (`npm run diff`) — a
      new large fill is exactly the shape it catches.
- [ ] 3.3 Browser pass in both schemes (Chrome, via the `playwright-cli` skill).
- [ ] 3.4 Full gate green.

## 4. Close out

- [ ] 4.1 Spec delta into `slide`.
- [ ] 4.2 Owner acceptance on the appearance before archiving.
