# Tasks: Extract the shared candidate-elimination hint plan

> Behaviour-preserving refactor. The regression gate is the **existing** per-game hint
> suites + `hint-resume.test.ts` (they already assert narration, journeys, keep-track,
> resume, and the no-stale-step / no-mutate guarantees). A migration is correct when
> those pass with **no snapshot change**. Read `docs/porting/hint-authoring.md` §9 and
> the four games' current `index.ts` hint sections first.

## 1. Tier 1 — pure helpers + keep-track/refresh (`engine/candidate-hint.ts`)
- [ ] 1.1 New module `src/native/engine/candidate-hint.ts` with the pure helpers over
  `(grid, pencil, ops)`: `nakedSingle`, `anyEmptyLacksNotes`,
  `firstUnreflectedPlaceIndex`, `nextStrike`, `nextPlace`, `joinNums` — extracted from
  the current copies (assert they are byte-identical across the four games first).
- [ ] 1.2 A structural `PencilMove` type and generic `hintKeepTrack` /
  `refreshHintStep` over it (D5).
- [ ] 1.3 `candidate-hint.test.ts`: the helpers' unit behaviour (naked single found,
  strike-group liveness, unreflected-place index, keep-track verdicts, refresh drops
  dead marks).
- [ ] 1.4 Route Keen → Towers → Unequal → Solo onto the tier-1 helpers, deleting each
  inline copy; re-run each game's hint suite + `hint-resume.test.ts` after each (no
  snapshot change).

## 2. Generalise the placement classifier (`engine/latin-hint.ts`)
- [ ] 2.1 `classifyPlacement` takes a **region list** (cells + kind/name), returning
  naked / hidden(region) / forced; existing row/column callers pass `[row, col]`.
- [ ] 2.2 Solo's `soloPlacementReason` folds into a config of the shared classifier
  (`[row, col, block, diag0, diag1]`); its block/diagonal hidden-single cases keep
  working (guarded by `solo-hint.test.ts` "hidden single by its region").
- [ ] 2.3 `latin-hint.test.ts` extended for a non-row/column region (block).

## 3. Tier 2 — the `buildCandidatePlan` driver (`engine/candidate-hint.ts`)
- [ ] 3.1 `buildCandidatePlan(state, config)` runs the 5-step walk (naked single →
  lazy populate → basic-region cull → next deductive elimination → forced placement) +
  one-firing-one-journey emission, with the D3 injection points
  (`recordDeductions` / `placementReason` / `narrate` / `reasonArea` / `placementArea`
  / `strikeSplit` / `basicRegionStrike`).
- [ ] 3.2 The `strikeSplit` policy covers by-cell, by-digit and single-step (Keen/Solo
  cages by cell, Towers by height, Solo `intersect` single-step).
- [ ] 3.3 Migrate Keen → Towers → Unequal → Solo's `buildSteps` onto the driver,
  deleting the per-game walk; re-run each game's suite (no snapshot change).

## 4. Undead evaluation
- [ ] 4.1 Confirm whether the tier-1 helpers fit Undead's monster-bitmask candidate
  model; migrate if clean, else leave it and record the reason in
  `docs/porting/hint-authoring.md` §9.4/§9.5.

## 5. Close-out
- [ ] 5.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`); confirm the C differentials are untouched (no solver change) and no
  hint snapshot drifted unintentionally.
- [ ] 5.2 Update `docs/porting/hint-authoring.md` §9 to point at the shared module as
  the implementation (the per-game sections become "configure the shared driver"
  rather than "copy this code"); fold §9.5's bespoke-solver note into the shared shape.
- [ ] 5.3 Owner acceptance: spot-check a hint in each migrated game still reads and
  plays identically; on sign-off, commit + `openspec archive extract-candidate-hint-plan`.
