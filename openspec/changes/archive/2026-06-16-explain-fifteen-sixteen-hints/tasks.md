# Tasks

## 1. Settle the open design questions (start of next session)
- [x] 1.1 Fifteen (D1): decide how to derive the current target tile + locked
      region (re-derive a small pure frontier helper vs expose from the solver).
      → `computeHint` now also returns `target` (upstream `nextpiece`); a step is
      a home move iff it slides `target` into its solved cell (old gap == target-1).
- [x] 1.2 Sixteen (D2): confirm the home-vs-stage rule (landing cell == solved
      cell; for a journey, use the final landing cell) and the wording for a
      journey whose later leg homes the tile. → `finalPos = ultimatePos ?? targetPos`;
      home iff `finalPos === tile - 1`; the why attaches to leg 0 of a journey,
      continuation legs stay terse (conservative: never overclaims home).
- [x] 1.3 Agree the shared home/helper vocabulary (per-game vs tiny shared
      module) and align tone with the Palisade exemplar. → owner chose the
      **goal:tactic** voice ("Working on tile N: …"). Shared `workingOn(tile)`
      prefix + `HINT_SETTING_UP` marker in `src/native/engine/hint-vocab.ts`;
      home/tactic verbs stay per-game (grammar differs). See design D3 for the
      concrete wording.

## 2. Fifteen narration
- [x] 2.1 Compute per-step kind (home vs helper) and the target tile.
- [x] 2.2 Replace `"Slide tile N into the space"` with goal:tactic narration:
      `Working on tile {target}: slide it into place` (home) / `… slide it closer`
      (target nearer) / `… reposition it` (target pushed away to route the gap —
      owner fix 2026-06-15) / `… slide tile {tile} out of the way` (helper).
- [x] 2.3 Keep `move`, `highlights`, `hintKeepTrack`, and plan length unchanged.

## 3. Sixteen narration
- [x] 3.1 Label each step/journey home-vs-stage from the landing cell vs solved
      cell.
- [x] 3.2 Enrich `narrateStep` to goal:tactic (`Working on tile N: move it to
      <line>[, then <line>]`) with the why clause (home: ", its final spot";
      stage: " (setting up)"), keeping journey continuity + continuation legs short.
- [x] 3.3 Keep planner, highlights, `hintKeepTrack`, and pacing unchanged.

## 4. Tests
- [x] 4.1 Fifteen: on a concrete board, a step that lands a tile in its solved
      cell narrates "home"; a maneuvering step does not. Plan still solves the
      board (existing invariant test stays green).
- [x] 4.2 Sixteen: on a concrete board, a home-landing step narrates "final
      place"; a staging step narrates "setting up". Existing planner/track tests
      stay green.

## 5. Spec + verify
- [x] 5.1 Apply the `fifteen` and `sixteen` spec deltas (drafted under
      `changes/explain-fifteen-sixteen-hints/specs/`). → applied at archive time.
- [x] 5.2 `openspec validate explain-fifteen-sixteen-hints --strict`.
- [x] 5.3 Full gate (tsc, biome, vitest, vite build).
- [x] 5.4 Dev-verify both games in the browser (hint banner reads the new "why"
      wording; auto-hint plays at the uniform 1s pace). **Owner-accepted
      2026-06-16** (incl. the closer/reposition fix, stable-goal fix, and the
      uniform-1s hint-animation pacing fix). Commit + archive.
