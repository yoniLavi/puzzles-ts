# Tasks: roll the hint element-type colour legend out to every existing port

## 1. Range — fix the cited-black premise colour

- [x] 1.1 Add `COL_HINT_BLACKREF` (teal, same hue as Singles) to
      `range/render.ts` palette, clear of `COL_ERROR`/`COL_HINT`/`COL_HINT_CELL`/
      `COL_WHITEBG`.
- [x] 1.2 In `drawCell`, the `hintKind === 4` (decided-black premise) ring draws
      `COL_HINT_BLACKREF` instead of `COL_HINT`. Target/area paths unchanged.
- [x] 1.3 Test: reach an `adjacency` hint frame (render-scenario) and assert the
      cited black premise rings `COL_HINT_BLACKREF` while the forced cell fills
      `COL_HINT` (distinct).

## 2. Unruly — give the premise ring its own colour

- [x] 2.1 Add `COL_HINT_REF` (distinct orange) to `unruly/render.ts` palette,
      appended past the dark-mode override range (like `COL_HINT`/`COL_HINT_CELL`).
- [x] 2.2 The `FF_HINT_RING` draw uses `COL_HINT_REF` instead of `COL_HINT`.
      Target fill / area shade unchanged.
- [x] 2.3 Test: reach a hint frame whose ring cells are filled premises and
      assert they ring `COL_HINT_REF`, distinct from the `COL_HINT` target.

## 3. Palisade + Filling — document the legend they already implement

- [x] 3.1 Spec: add "Palisade hint colour legend" (forced edge = `COL_HINT`,
      region = `COL_HINT_CELL` shade, clue = digit on the shaded cell;
      equivalent forced edges share `COL_HINT`).
- [x] 3.2 Spec: add "Filling hint colour legend" (target = empty mild `COL_HINT`
      fill, no digit; premise region = `COL_HINT_CELL` shade, digit on top).
- [x] 3.3 Confirm no code change needed (re-read the render paths against the new
      spec text).

## 4. Guide + spec wording

- [x] 4.1 `docs/porting/hint-authoring.md`: drop the "Range/Palisade/Filling/
      Unruly … follow-ups" framing; add a per-game legend summary table; record
      the **single-action imperative exemption** (Sixteen/Fifteen/Flood) so future
      movement-game ports know the legend doesn't apply.
- [x] 4.2 Add the per-game `range`/`unruly` "hint colour legend" requirements
      (these note the new colour).

## 5. Gate + acceptance

- [x] 5.1 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`.
- [x] 5.2 `npm run dev` smoke: a Range `adjacency` hint rings the cited black
      square teal, distinct from the blue target; an Unruly hint rings its premise
      cells in the new colour, distinct from the blue placed cell.
- [x] 5.3 Owner acceptance of the Range + Unruly look → commit + archive.
