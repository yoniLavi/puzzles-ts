# Tasks: add-hint-plans

- [ ] 1. Engine contract (`src/native/engine/game.ts`): add `HintStep` and
  `HintTrackVerdict`; change `HintResult` ok-variant to `{ steps: HintStep[] }`;
  change `ActiveHint` to `{ steps, index }`; change `hintKeepTrack` to
  `(move, step, state) => HintTrackVerdict` (document the in-place `step.move`
  adjustment allowance and the "completed ⇒ resulting state matches the plan"
  obligation); change `redraw`'s hint parameter to `HintStep`.
- [ ] 2. Midend (`src/native/engine/midend.ts`): store the plan; current-step
  accessor feeding `redraw` and the status bar; `hint()` refresh-no-op when a
  plan is active, compute+store otherwise (reject empty `steps`);
  `executeHint()` executes the current step (computing a plan if absent) and
  advances at animation settle (`advanceHintOnAnimationEnd` replacing
  `clearHintOnAnimationEnd`); `processInput` maps verdicts to advance / keep /
  drop; clear on undo/redo/restart/newGame/solve and when exhausted or solved.
- [ ] 3. Engine tests (`midend.test.ts`): migrate the fake game to the new
  shapes; add coverage for plan advance (manual completed move), refresh-no-op
  `hint()`, drop on off-plan move, recompute after invalidation, clear on
  exhaustion and on solve.
- [ ] 4. Sixteen search (`src/native/games/sixteen/index.ts`): reconstruct the
  full path from the A* search (parent pointers on `SearchNode`) and from the
  bidirectional fallback (parent keys both sides); myopic fallback returns the
  partial path to `bestNode`.
- [ ] 5. Sixteen narration: extract `narrateStep` and build `HintStep[]` by
  simulating the path (landing-cell narration, in-grid delta normalization,
  two-leg preview from the next step); drop `secondMove` from
  `SixteenHintHighlights`; `redraw` takes the current `HintStep`.
- [ ] 6. Sixteen `hintKeepTrack`: return verdicts; adjust `step.move` delta on
  partial progress (`onTrack`).
- [ ] 7. Sixteen tests: migrate hint-shape assertions; switch playthrough
  property tests to follow whole plans (assert each step's landing equals its
  highlighted target; re-hint only on exhaustion); keep the cycling-board and
  two-swap-endgame regression tests green; add a test that the endgame plan is
  computed once (no per-step bidirectional recompute, e.g. via a hint-call
  counter or timing-free spy seam).
- [ ] 8. Owner acceptance in `npm run dev`: follow a manual hint sequence to
  completion (step auto-advance), watch auto-play cross the two-swap endgame
  without wobble, verify a manual off-plan move drops the hint and the next
  Hint press recomputes.
- [ ] 9. Full gate (`tsc -b --noEmit`, `biome lint`, `vitest run`,
  `vite build`) and archive the change.
