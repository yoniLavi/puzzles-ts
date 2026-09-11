## 1. Baseline and rubric

- [x] 1.1 Record per-game and engine line counts and comment share in
      `baseline.txt` in this change, and verify it covers all 57 games plus the
      engine.
- [x] 1.2 Point `docs/games/mechanics.md` § "Idiomatic state, not a C
      transliteration" at the new repo-layout requirement, and verify
      `openspec validate --all --strict` passes.

## 2. Pilot

- [x] 2.1 Galaxies: apply the pass, and verify its tests pass with differentials
      and snapshots unchanged and the diff net-negative; commit.
- [x] 2.2 Slide: same pass and verification; commit.
- [x] 2.3 Bridges: same pass and verification; commit.
- [x] 2.4 Compare the three diffs, revise the rubric where the pilot showed it
      unclear, and verify the revision is reflected in the brief the agents
      receive.

## 3. Fan out over the remaining games

- [x] 3.1 Run the remaining 54 games in waves of disjoint directories, each
      agent verifying its own game's tests with fixtures and snapshots
      unchanged; verify every game has a commit or a recorded reason for none.
- [x] 3.2 Repoint any `docs/` citation of a renamed function, and verify a grep
      for each old name in `docs/` returns nothing.

## 4. Engine

- [x] 4.1 Apply the pass to `src/engine/`, re-anchoring the probe where lines
      moved, and verify `npm run probe -- --verify` and the engine tests pass.

## 5. App shell and tooling

- [x] 5.1 Apply the pass to `src/puzzle/`, `src/screens/`, `src/dialogs/`,
      `src/components/`, `src/utils/`, `src/store/` and the `src/` root, and
      verify their tests pass with custom element names, public properties
      and event names unchanged.
- [x] 5.2 Apply the pass to `scripts/` and `vite-plugins/`, and verify every
      gate step still runs green on the full tree.

## 6. Close

- [x] 6.1 Re-measure against `baseline.txt`, and verify the total and every
      game's count went down or did not move.
- [x] 6.2 Run the full gate, open a handful of games and every dialog in the
      running app, and verify each plays and renders.
- [x] 6.3 Archive the change.
