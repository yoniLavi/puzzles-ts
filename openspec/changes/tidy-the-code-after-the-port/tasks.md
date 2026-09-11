## 1. Baseline and rubric

- [x] 1.1 Record per-game and engine line counts and comment share in
      `baseline.txt` in this change, and verify it covers all 57 games plus the
      engine.
- [x] 1.2 Point `docs/games/mechanics.md` § "Idiomatic state, not a C
      transliteration" at the new repo-layout requirement, and verify
      `openspec validate --all --strict` passes.

## 2. Pilot

- [ ] 2.1 Galaxies: apply the pass, and verify its tests pass with differentials
      and snapshots unchanged and the diff net-negative; commit.
- [ ] 2.2 Slide: same pass and verification; commit.
- [ ] 2.3 Bridges: same pass and verification; commit.
- [ ] 2.4 Compare the three diffs, revise the rubric where the pilot showed it
      unclear, and verify the revision is reflected in the brief the agents
      receive.

## 3. Fan out over the remaining games

- [ ] 3.1 Run the remaining 54 games in waves of disjoint directories, each
      agent verifying its own game's tests with fixtures and snapshots
      unchanged; verify every game has a commit or a recorded reason for none.
- [ ] 3.2 Repoint any `docs/` citation of a renamed function, and verify a grep
      for each old name in `docs/` returns nothing.

## 4. Engine

- [ ] 4.1 Apply the pass to `src/engine/`, re-anchoring the probe where lines
      moved, and verify `npm run probe -- --verify` and the engine tests pass.

## 5. Close

- [ ] 5.1 Re-measure against `baseline.txt`, and verify the total and every
      game's count went down or did not move.
- [ ] 5.2 Run the full gate, open a handful of games in the running app, and
      verify each plays and renders.
- [ ] 5.3 Archive the change.
