## 1. colour-mkhighlight extraction
- [x] 1.1 Create `src/native/engine/colour-mkhighlight.ts` with `mkhighlightBackground` (copied from Galaxies, with the epsilon fix)
- [x] 1.2 Update `src/native/games/galaxies/index.ts` to import from `../../engine/colour-mkhighlight.ts`
- [x] 1.3 Delete the local `mkhighlightBackground` function from `galaxies/index.ts`

## 2. pointer extraction
- [x] 2.1 Create `src/native/engine/pointer.ts` with button code constants + `PointerAction` type + `parsePointerAction`
- [x] 2.2 Update `src/native/games/flip/index.ts` to import button constants from `../../engine/pointer.ts`
- [x] 2.3 Update `src/native/games/galaxies/index.ts` to import button constants from `../../engine/pointer.ts`
- [x] 2.4 Delete local button code declarations from both games

## 3. dsf promotion
- [x] 3.1 Move `src/native/games/galaxies/dsf.ts` → `src/native/engine/dsf.ts`
- [x] 3.2 Update `src/native/games/galaxies/solver.ts` import path
- [x] 3.3 Update `src/native/games/galaxies/galaxies.test.ts` import path (if it imports dsf)
- [x] 3.4 Update `src/native/games/galaxies/dsf.test.ts` import path
- [x] 3.5 Delete `src/native/games/galaxies/dsf.ts`

## 4. Engine index re-export
- [x] 4.1 Add `colour-mkhighlight`, `pointer`, `dsf` re-exports to `src/native/engine/index.ts`

## 5. Validation
- [x] 5.1 Run `tsc -b --noEmit`
- [x] 5.2 Run `biome lint`
- [x] 5.3 Run `vitest run`
- [x] 5.4 Run `vite build`
