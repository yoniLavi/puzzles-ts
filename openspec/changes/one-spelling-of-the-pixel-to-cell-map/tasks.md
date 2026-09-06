# one-spelling-of-the-pixel-to-cell-map — tasks

`re-express-the-collection` B3. Implemented 2026-09-06.

## 1. Prove the equivalence before relying on it

- [x] 1.1 **Numerically, not just algebraically** — 14,868 samples over twelve
      tile sizes (including fractional), seven border shapes and pixels from −3
      to +8 tiles. The four floor spellings: **0 mismatches**. `Math.trunc`:
      **4,401 differences**, all at negative pixels, which is exactly the border
      margin. These are input maps; an assumed equivalence would move clicks.

## 2. Converge the floor family

- [x] 2.1 The `+ ts … − 1` form — bridges, dominosa, lightup, map, singles, slant.
- [x] 2.2 The `+ (ts − b)` form — keen, solo, towers.
- [x] 2.3 Whole-tile origins — magnets (one tile), salad (one tile), abcd (`n`
      tiles). Each now names its origin instead of folding it into an offset.
- [x] 2.4 Already the plain form but not calling the helper — boats, range.
- [x] 2.5 Non-tile stride and compound origins — unequal (`square(ts)`, a cell
      plus its inequality gap), pattern (border + gutter + `tlborder(d)` tiles),
      tents (`TLBORDER`).
- [x] 2.6 **Tents also had the origin defect** `unify-the-board-origin` swept
      for: `TLBORDER` in `render.ts`, its value re-typed as a literal `1` in
      `interpretMove`. Exported and imported.

## 3. Leave the override alone, and make it legible

- [x] 3.1 blackbox, crossing, group, mathrax, rome, seismic keep `Math.trunc`.
      All six already document why and name the shared helper they decline —
      checked, not assumed.
- [x] 3.2 `engine/geometry.ts` now states the convention, records that the four
      spellings were the same function, and names the six overrides with the
      one way they differ.

## 4. Verify

- [x] 4.1 `tsc -b --noEmit` clean; the seventeen games pass — **1,029 tests**.
- [x] 4.2 **Ran the app**, because the suites drive moves directly and barely
      touch the pixel path. The three riskiest conversions clicked at both
      extremes of the board in Chrome: unequal (gap-inclusive stride — the 3
      landed in the corner cell clicked), abcd (`n`-tile origin — A and D landed
      in opposite corners and the violated clues turned red), pattern (compound
      origin — both corners filled on a 15×15 grid, where an off-by-one is
      obvious).

## Findings

- **The override was invisible while the convention had four spellings.** Six
  games decline the shared helper for a real, player-visible reason, and every
  one of them says so — but that reads as an override only once the other
  seventeen agree. Converging the majority is what turned six scattered
  `Math.trunc` calls into a documented exception with a population.
