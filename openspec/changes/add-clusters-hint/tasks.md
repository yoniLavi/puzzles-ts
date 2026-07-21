# Tasks — add-clusters-hint

## 1. Guess-free audit (design D2 — do this first)

- [ ] 1.1 Fixed-seed sweep (~500 boards/preset): count how many generated boards
      need `solverRecurse` (depth-1 lookahead) beyond `solverTry`-only. Record the
      numbers in `design.md`.
- [ ] 1.2 Confirm `solverRecurse`'s propagation never needs a *second* standing
      hypothesis (forcing chain = deduction, not nested speculation). If any board
      does, resolve by reject-at-generation (task 4.x) and re-measure gen time.
- [ ] 1.3 Decide (with the owner's D-open-question answer) whether depth-1 firings
      are narrated as chains (D3) or rejected at generation; record the decision.

## 2. Recording deduction pass (design D1)

- [ ] 2.1 `deduceHintPlan(grid, w, h): ClustersDeduction[]` in `solver.ts` — rerun
      the single-cell forcing with recording on; per firing capture `index`, `fill`,
      the `reason` (which of surrounded / dotOvercount / reachTwo the opposite colour
      trips, recomputed via `cellInError` on the tentatively-opposite board) and the
      `evidence` neighbours. Non-recording `solveGame`/`clustersValidate` untouched.
- [ ] 2.2 Depth-1 firings (if kept per 1.3): record the `chain` reason — the
      `solverRecurse` hypothetical + the `solverTry` propagation trace to the
      contradiction (`ChainStep[]`), capped in length.
- [ ] 2.3 Tier-1 tests: on a hand-built board, assert each rule kind fires with the
      right forced colour and evidence; assert the plan order is the deterministic
      row-major scan (recompute-stable).

## 3. hint / hintKeepTrack (design D4, D6)

- [ ] 3.1 `hint(state)` in `index.ts`: refuse on solved / on `findMistakes() > 0`
      (standard banner), else map `deduceHintPlan` to a `HintResult` — one journey
      per firing, `COL_HINT` target, `COL_HINT_CELL` evidence, premise→contradiction→
      conclusion prose (D4 strings). Multi-leg `continuesPrevious` chain for depth-1.
- [ ] 3.2 `hintKeepTrack(m, step, state)`: completed iff the move sets the hinted
      cell to the hinted colour; chain legs stay displayed; off-plan → `"off"`.
- [ ] 3.3 Register `canHint` (via the hook presence) — verify the Hint toolbar
      button appears for Clusters.

## 4. Generation change (only if 1.2/1.3 require it)

- [ ] 4.1 If a board needs un-narratable nested speculation: reject it at
      generation (retry, same RNG stream) so every shipped board is hint-narratable;
      re-measure generation time and record.

## 5. Rendering (design D5)

- [ ] 5.1 Append `COL_HINT` / `COL_HINT_CELL` past the palette enum; add an
      `OverlaySidecar` on the draw state; pack/stale/commit the hint highlight in
      `redraw` (§3.2). No forced-colour pre-placement.
- [ ] 5.2 Add Clusters to `src/native/engine/testing/hint-games.ts` so
      `hint-overlay.test.ts` guards its overlay.
- [ ] 5.3 Tier-2.5 render-scenario: reach a hint frame via `renderScenario({ …,
      showHint: true })`, assert `COL_HINT`/`COL_HINT_CELL` ops + snapshot; for a
      chain, walk `hintUntil` to a mid-chain leg and assert the accumulated marks.

## 6. Tests + gate

- [ ] 6.1 `clusters-hint.test.ts`: each rule narrates the right why; the plan
      auto-plays through a real `Midend` (hint → follow → next); refusal on
      mistaken/solved boards; `hint-resume` stability.
- [ ] 6.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [ ] 6.3 `openspec validate add-clusters-hint --strict`.
- [ ] 6.4 Dev-verify in the browser: request a hint, read the why, follow it,
      auto-play a chain; refusal banner on a wrong board. 0 console errors.
- [ ] 6.5 Update `hint-authoring.md` if the contradiction-narration or the
      forcing-chain-as-gradual-marks surfaced anything the guide didn't cover.

## 7. Close out — on owner acceptance

- [ ] 7.1 Archive `add-clusters-hint`; commit hint + archive together.
