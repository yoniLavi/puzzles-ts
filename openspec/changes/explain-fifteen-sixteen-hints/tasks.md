# Tasks

## 1. Settle the open design questions (start of next session)
- [ ] 1.1 Fifteen (D1): decide how to derive the current target tile + locked
      region (re-derive a small pure frontier helper vs expose from the solver).
- [ ] 1.2 Sixteen (D2): confirm the home-vs-stage rule (landing cell == solved
      cell; for a journey, use the final landing cell) and the wording for a
      journey whose later leg homes the tile.
- [ ] 1.3 Agree the shared home/helper vocabulary (per-game vs tiny shared
      module) and align tone with the Palisade exemplar.

## 2. Fifteen narration
- [ ] 2.1 Compute per-step kind (home vs helper) and the target tile.
- [ ] 2.2 Replace `"Slide tile N into the space"` with explanatory narration:
      a home move states the tile is being placed in its final position; a
      helper move states which target tile it is maneuvering toward home.
- [ ] 2.3 Keep `move`, `highlights`, `hintKeepTrack`, and plan length unchanged.

## 3. Sixteen narration
- [ ] 3.1 Label each step/journey home-vs-stage from the landing cell vs solved
      cell.
- [ ] 3.2 Enrich `narrateStep`'s explanation accordingly (home: "into its final
      place"; stage: "to set up …"), keeping journey continuity + continuation
      legs short.
- [ ] 3.3 Keep planner, highlights, `hintKeepTrack`, and pacing unchanged.

## 4. Tests
- [ ] 4.1 Fifteen: on a concrete board, a step that lands a tile in its solved
      cell narrates "home"; a maneuvering step does not. Plan still solves the
      board (existing invariant test stays green).
- [ ] 4.2 Sixteen: on a concrete board, a home-landing step narrates "final
      place"; a staging step narrates "set up". Existing planner/track tests stay
      green.

## 5. Spec + verify
- [ ] 5.1 Apply the `fifteen` and `sixteen` spec deltas (drafted under
      `changes/explain-fifteen-sixteen-hints/specs/`).
- [ ] 5.2 `openspec validate explain-fifteen-sixteen-hints --strict`.
- [ ] 5.3 Full gate (tsc, biome, vitest, vite build).
- [ ] 5.4 Dev-verify both games in the browser (hint banner reads the new "why"
      wording; auto-hint plays at the uniform 1s pace). Owner acceptance, then
      commit + archive.
