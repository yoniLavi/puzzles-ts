# Tasks — reach-ten-by-ten-seismic

## 1. Design the fill

- [ ] 1.1 Re-read the measurements in `openspec/changes/archive/2026-07-28-replace-seismic-region-generator/design.md` F4/F5 — nine distributions, and why small regions are provably infeasible at 10×10.
- [ ] 1.2 Choose between constraint-guided partitioning and repair-on-failure; state why the chosen one cannot degrade to a lottery.
- [ ] 1.3 Decide what a 10×10 board should *look* like — mean region size is a visible property, not a free parameter.

## 2. Implement

- [ ] 2.1 New fill, behind the existing generator interface.
- [ ] 2.2 Clue-stripping cost at 10×10 measured and brought inside budget.
- [ ] 2.3 `MAX_CELLS` raised to the measured reach, per mode.

## 3. Verify

- [ ] 3.1 Every generated board uniquely solvable at its stated difficulty.
- [ ] 3.2 Generation time distribution at 10×10 reported (tail, not median).
- [ ] 3.3 Solver fixtures unchanged and green; the desc byte-match differential
      replaced by the solvability/uniqueness form, with the loss recorded.
- [ ] 3.4 Full gate green.

## 4. Close out

- [ ] 4.1 Spec delta into `seismic`.
- [ ] 4.2 Update `help/games/seismic.md`'s size note.
