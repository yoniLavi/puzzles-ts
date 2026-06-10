# Tasks: refactor-pre-port-tidy

## 1. OpenSpec repair (direct fixes)

- [x] 1.1 Move `openspec/archive/add-pegs-ts-port` →
      `openspec/changes/archive/2026-05-26-add-pegs-ts-port` and
      `openspec/archive/add-sixteen-ts-port` →
      `openspec/changes/archive/2026-06-04-add-sixteen-ts-port`; remove the
      stray `openspec/archive/` directory.

## 2. Engine helper consolidation

- [x] 2.1 `colour-mkhighlight.ts`: hoist `colourDistance`/`colourMix` to
      module scope; add `mkhighlight(bg: Colour): { background, highlight,
      lowlight }` implementing the full `game_mkhighlight` derivation,
      including upstream's pure-white/pure-black saturation in the
      near-extreme branches (fixes the inline copies' collapsed-highlight
      defect on light hosts).
- [x] 2.2 Add `src/native/engine/colour-mkhighlight.test.ts`: assert
      value-identity with the previous inline derivation on mid-range
      backgrounds, upstream saturation on near-extreme backgrounds, and
      brightness-ordering/in-gamut properties across all of them.
- [x] 2.3 Update `pegs/index.ts` and `sixteen/index.ts` `colours()` to
      destructure `mkhighlight(...)`; delete the duplicated inline blocks.
- [x] 2.4 Add `src/native/engine/params.ts` with `parseLeadingInt`; update
      `flip/index.ts` and `galaxies/index.ts` to import it; export from
      `engine/index.ts`.
- [x] 2.5 `pointer.ts`: remove `PointerAction`, `parsePointerAction`,
      `PointerButton`, `CursorDirection`; update `engine/index.ts` exports
      and the module doc comment.

## 3. Test relocation

- [x] 3.1 Move `flip/sorted-multiset.test.ts` →
      `engine/sorted-multiset.test.ts` and `galaxies/dsf.test.ts` →
      `engine/dsf.test.ts`; fix relative imports.

## 4. Spec recovery

- [x] 4.1 Delta files for `ts-engine` (ADDED ×2, RENAMED+MODIFIED pointer,
      REMOVED ×2 by migration), `pegs` (ADDED ×2, recovered), `sixteen`
      (ADDED ×3, recovered + migrated). `openspec validate
      refactor-pre-port-tidy --strict` passes.

## 5. Docs

- [x] 5.1 Update AGENTS.md: "What's been done" entries for
      extract-shared-helpers, Pegs, Sixteen, hint system, drag-to-slide,
      hint plans; mark the queued helper extractions done; keep the
      `--screenshot` icon-capture item visible as outstanding.

## 6. Gate

- [x] 6.1 `tsc -b --noEmit`, `npm run lint`, `npm run test:run`,
      `npm run build` all green.
- [x] 6.2 Dev-server visual spot-check of Pegs and Sixteen on a light
      theme: done 2026-06-10 via playwright (Pegs cross bevel and Sixteen
      tile bevels render pure white; Flip and Galaxies load with zero
      console errors).
- [ ] 6.3 Owner acceptance of the mkhighlight fallback fix (visible
      rendering change on light themes), then archive this change.
