# Tasks: hint element-type colour legend (Singles pilot)

## 1. Singles render legend

- [x] 1.1 Add `COL_HINT_BLACKREF` (teal) + `COL_HINT_WHITEREF` (violet) palette
      entries in `singles/render.ts` (clear of error/target/number/strand/
      cursor), index 12/13 after the existing hint colours.
- [x] 1.2 In the evidence ring branch (`(DS_HINT_EVID|DS_HINT_STRAND) &
      (DS_BLACK|DS_CIRCLE)`), choose the ring colour by decided state:
      `DS_BLACK` → `COL_HINT_BLACKREF`, `DS_CIRCLE` → `COL_HINT_WHITEREF`,
      strand → `COL_HINT_STRAND` (unchanged). Target/number/shade paths
      unchanged. No change to `SinglesHint` or `index.ts`.

## 2. Tests

- [x] 2.1 Render-scenario: reach an `adjBlack` frame (`6x6dk#scan-0`,
      predicate on "can't be adjacent"); assert the cited black premise rings
      `COL_HINT_BLACKREF` and the target fills `COL_HINT` (distinct).
- [x] 2.2 Render-scenario: reach a `sameLine` frame ("ringed white square");
      assert the cited white premise rings `COL_HINT_WHITEREF`.
- [~] 2.3 Existing hint-frame `toMatchSnapshot` stays green (the new colours
      don't appear in that frame, so no re-baseline needed). New frames assert
      ops directly; no extra snapshot.
- [x] 2.4 Keep the existing disjoint-roles test green (target/evidence/strand
      never overlap).

## 3. Docs + spec

- [x] 3.1 `docs/porting/hint-authoring.md`: add the **colour-by-type legend**
      convention (per-game stable legend, colour always paired with a
      non-colour cue) and the Singles legend table; link the render exemplar.
- [x] 3.2 Confirm the spec deltas (`ts-engine` Hint System convention,
      `singles` legend requirement) match what shipped.

## 4. Gate + acceptance (parity-gated)

- [x] 4.1 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`.
- [x] 4.2 `npm run dev` smoke: a Singles hint citing a shaded square rings it in
      the black-ref colour distinct from the blue target; one citing a ringed
      white square rings it in the white-ref colour; numbers/corners unchanged.
- [x] 4.3 Owner decision on **two ring colours vs one** `COL_HINT_REF` (design
      open question): **decided 2026-06-19 — keep two** (teal `COL_HINT_BLACKREF`
      for a cited shaded square, violet `COL_HINT_WHITEREF` for a cited ringed-
      white square). Rationale: the legend is a stable per-game map of element
      *types*; the cell's own black/white reinforces which ring is which.
- [x] 4.4 Owner acceptance (2026-06-19) → commit + archive.

## 5. Follow-ups (separate parity-gated changes, not this change)

- [ ] 5.1 Note for handoff: apply the convention to Range, Palisade, Filling,
      Unruly, one change each, after Singles acceptance.
