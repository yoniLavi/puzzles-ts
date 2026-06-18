# Tasks: Add a move hint + animation to Untangle

## 1. Engine: thread `aux` into the hint hook
- [x] 1.1 `Game.hint` becomes `hint?(state, aux?)`; the midend passes `this.aux`
  in `computeHintPlan`. Additive — deductive games ignore the argument.

## 2. State: shared aux helpers + crossing-pair count
- [x] 2.1 `findCrossings` also returns `count` (number of crossing pairs).
- [x] 2.2 Extract `parseAux` and `dihedralSolvedUnits` (the solution parse +
  closest-dihedral-symmetry match) to `state.ts`; refactor `index.ts` `solve` to
  use them (same d=2 output).

## 3. hint.ts: aux plan primary, heuristic fallback
- [x] 3.1 `UntangleHint` highlight type: `{ vertex; to }`.
- [x] 3.2 Aux plan: rescale the dihedral-matched solution to fill the play box
  (uniform scale → planar + spaced), then greedily place vertices one at a time in
  the order that keeps intermediate crossings lowest. Guaranteed untangled.
- [x] 3.3 Heuristic fallback (no aux): greedy crossing-reduction with centroid +
  outward-pushed candidate targets and a pairwise-clustering spread tie-break.
- [x] 3.4 `deduceUntangleHintPlan(state, aux?)`: refuse on solved; prefer aux when
  present, else heuristic. Empty `explanation`.

## 4. index.ts + render.ts: wiring + render
- [x] 4.1 `hint: (s, aux) => deduceUntangleHintPlan(s, aux)`; thread `hint` param
  into `redraw`; add `COL_HINT` palette entry.
- [x] 4.2 Draw a `COL_HINT` line from the hinted vertex to its target and a
  `COL_HINT` marker at the target; fold the hint signature into the redraw
  early-out so a manual hint repaints.

## 5. Tests
- [x] 5.1 Tier-1 aux: the plan fully untangles **and** fills the box on n=10 and
  n=25; aux preferred over the heuristic when present.
- [x] 5.2 Tier-1 heuristic fallback: plan reduces crossings monotonically; every
  step a legal `executeMove`; refusal on a solved board; empty narration.
- [x] 5.3 Tier-2.5: `renderScenario({ showHint })` to a hint frame — assert the
  `COL_HINT` line + marker present + `toMatchSnapshot`.

## 6. Gate + docs
- [x] 6.1 Pre-commit gate green (`tsc -b --noEmit` → biome → vitest → vite build).
- [x] 6.2 Update `docs/porting/hint-authoring.md` (live wiki): non-deductive
  heuristic-hint pattern + the multi-objective spread tie-break; the aux-solution
  hint strategy (rescale-to-fill for spacing) when a game knows its solution.
- [x] 6.3 `openspec validate add-untangle-hint --strict`.

## 7. Parity gate
- [x] 7.1 Owner acceptance: aux hint fully untangles and spaces out (verified
  in-browser on n=25 — fully solved, vertices fill the box, 0 console errors);
  owner-accepted 2026-06-18.
