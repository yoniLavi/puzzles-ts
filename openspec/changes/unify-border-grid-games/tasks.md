# unify-border-grid-games — tasks

Depends on `establish-refactor-baseline`.

## 1. Establish the oracle before touching anything

- [ ] 1.1 Run both games' full test files — differentials, render scenarios,
      snapshots — and confirm green. This is the baseline the whole change is
      measured against.
- [ ] 1.2 Note the exact fixture and snapshot files involved, so it is
      unambiguous later which files must **not** change.

## 2. Classify the 22 clone blocks

- [ ] 2.1 Read every clone block jscpd reports between the two games (the largest
      being `palisade/index.ts:98` ↔ `separate/index.ts:88`, 111 lines).
- [ ] 2.2 Classify each as **mechanic**, **vocabulary**, or **coincidence** per
      design D1, applying the test: *would a change here have to happen in both
      games at once?*
- [ ] 2.3 Record the classification. The coincidences are as important to record
      as the extractions — a later round must not re-litigate them.

## 3. Extract the vocabulary

- [ ] 3.1 Move the `BORDER(d)` / `DISABLED(m)` / `FLIP(d)` bit vocabulary and the
      `DX`/`DY` direction tables into the new engine module.
- [ ] 3.2 Point both games at it. Run both games' tests — green, no snapshot
      updates.

## 4. Extract the mechanic

- [ ] 4.1 Extract the closest-edge hit test (pointer coordinate → which of the
      four edges of which cell, or none).
- [ ] 4.2 Extract the tri-state cycle (YES/MAYBE/NO under left and right button)
      and the paired two-cell edit an edge toggle produces.
- [ ] 4.3 Extract the half-cell cursor scheme (`2x+1`, `2y+1` coordinates, the
      clamp, the corner/centre rejection, and `CURSOR_SELECT`/`SELECT2`
      handling).
- [ ] 4.4 Keep each game's move *type* its own — the shared code produces the
      edit description, the game decides what its `Move` looks like. A shared
      move type would couple the two save formats, which have no reason to be
      the same.
- [ ] 4.5 After each of 4.1–4.3, run both games' tests. Extract in small steps so
      a broken step is attributable.

## 5. Render and state blocks

- [ ] 5.1 Extract only the `render.ts` / `state.ts` blocks classified as mechanic
      or vocabulary in §2. Leave the coincidences.
- [ ] 5.2 Confirm no render snapshot required `-u`.

## 6. Verify the no-op claim

- [ ] 6.1 Run both games' differentials. **Fixtures unmodified.**
- [ ] 6.2 Run both games' render-scenario tests. **Snapshots unmodified, no
      `vitest -u`.**
- [ ] 6.3 `git status` on `__fixtures__/` and `__snapshots__/` for both games
      must be clean. If it is not, the extraction changed behaviour — fix the
      extraction, do not re-baseline.
- [ ] 6.4 Play both games in `npm run dev`: mark walls with left and right button
      by mouse, cycle a wall through all three states, drive the cursor with the
      keyboard through the half-cell positions, and confirm the clue/region
      feedback still behaves. The suite cannot see input feel, and this repo has
      shipped a game that was green and did not render.

## 7. Close out

- [ ] 7.1 Re-run `npm run metrics`; report cross-game clone lines before/after
      (baseline: 2,180 total, 466 between these two games).
- [ ] 7.2 Update `docs/porting/game-port-playbook.md` with the shared border-grid
      module, so a future border-marking game finds it rather than copying a
      third time.
- [ ] 7.3 Full gate green.
- [ ] 7.4 Owner acceptance on both games before archiving.
