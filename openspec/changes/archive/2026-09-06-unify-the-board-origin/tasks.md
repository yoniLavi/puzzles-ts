# unify-the-board-origin — tasks

Scaffolded 2026-09-06 by `declare-the-board-model`'s exploration, and
implemented in the same session.

## 1. One origin per game, exported from the module that paints

For each game: hoist the origin to a single named, exported function in
`render.ts` (the module that owns geometry), delete the input side's copy, and
import it. Keep the existing arithmetic **byte-identical** — this change moves a
definition, it does not improve one.

- [x] 1.1 blackbox — `border(ts)`, currently inline in `fromDraw` and in `redraw`.
- [x] 1.2 dominosa — `border(ts)` (already `-gutter(ts)` in `render.ts`); the
      input side's `-Math.floor(ts / 16)` goes.
- [x] 1.3 galaxies — `border(ts)`; both sides say `= tile`.
- [x] 1.4 range — `border(ts)`; `render.ts`'s is already the right shape.
- [x] 1.5 signpost — `BORDER`; also `FLASH_SPIN`, which is duplicated the same
      way in the same two files and is the same defect.
- [x] 1.6 singles — `border(ts)`.
- [x] 1.7 slant — `border(ts)`; the input side's `Math.floor(ts / 3) + 1` is the
      worst instance in the set (a second spelling of `clueRadius(ts) + 1`).
- [x] 1.8 unruly — `border(ts)`; delete `index.ts`'s own `function border`.

## 2. Prove the move changed nothing

- [x] 2.1 Every removed line's replacement is the same number: check each pair
      by reading, before running anything.
- [x] 2.2 `vitest run` over the eight games plus the engine — frozen
      differentials and tier-2.5 snapshots **unmoved**. A moved snapshot is a
      live bug found, not a re-baseline.
- [x] 2.3 Verify the shape of the diff: every changed line is either a deleted
      duplicate definition, an added import, or a call where a constant stood.

## 3. Record the rule where the next session reads it

- [x] 3.1 `docs/games/mechanics.md` § "One function, both callers" — add the
      coordinate instance, name the two exemplars (`mines/render.ts`'s
      `borderFor`, `bricks/render.ts`'s `offsets`), and state the tell: an input
      path that *cites* the render module in a comment instead of importing
      from it.

## Findings

- **All eight pairs agreed before the change**, so this fixed no live defect and
  removed eight standing opportunities for one. That is the honest result and it
  is why the change carries no spec delta.
- **Signpost duplicated two constants, not one** — `FLASH_SPIN = 0.7` sits beside
  `BORDER = 1` in both files. Sweeping for the origin found it; a sweep scoped
  to "the border" would not have.
- **Galaxies' duplication is `const border = tile` on both sides** — the most
  trivial possible expression, and still worth one import, because the whole
  point is that the input path must not be free to have its own opinion.
