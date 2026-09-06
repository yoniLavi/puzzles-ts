# give-flip-and-pegs-a-state-module — tasks

`re-express-the-collection` B7. Implemented 2026-09-06.

## 1. Measure before splitting

- [x] 1.1 **Corrected the batch's own premise.** It was filed as weak on an
      unmeasured claim that the split "is looser"; `state.ts` is 55 of 57, as
      settled as the renderer was. `generator.ts` (45) and `solver.ts` (46) do
      vary, and that variation is a real per-game judgment.

## 2. Split

- [x] 2.1 flip — `state.ts` (types, the hex bitmap desc codec, `dupGrid`) and
      `generator.ts` (the crosses and RANDOM toggle matrices).
- [x] 2.2 pegs — `state.ts` (grid vocabulary, board types, params, presets,
      `validateDesc`, `newState`, `newUi`, `status`, `textFormat`, move
      serialization) and `generator.ts` (reverse-move board generation).
- [x] 2.3 Neither gains a `solver.ts`: neither has a solver.
- [x] 2.4 `index.ts` re-exports each game's types, as Galaxies already does, so
      the registry and the tests see an unchanged surface.

## 3. Undo the workaround this makes unnecessary

- [x] 3.1 Pegs' `GRID_HOLE`/`GRID_PEG`/`GRID_OBST` move from `render.ts` — where
      `move-renderers-into-render-ts` had to put them, with a comment saying so
      — into `state.ts`. `render.ts` imports them from there.
- [x] 3.2 The import cycle is now impossible rather than avoided: `render.ts`
      imports no *value* from `index.ts`. `module-layering.test.ts` passes.

## 4. Verify

- [x] 4.1 `tsc -b --noEmit` clean; both games plus `module-layering` and
      `capability-surface` pass.
- [x] 4.2 Both games carry a **frozen differential**, which is the byte-level
      proof no desc or game ID moved. Both byte-clean.

## Findings

- **A workaround is a marker.** The grid values sitting in `render.ts` with a
  comment explaining that Pegs has no `state.ts` was the previous batch writing
  down exactly what the next one needed to do. Worth noticing when a change
  leaves a comment that names a missing thing.
- **"This one varies" is a claim and it rots**, like a count in prose. Two
  minutes of `ls` turned a batch filed as weak into one of the two strongest in
  the survey — the fifth instrument correction of this sweep.
