# Tasks: Add an explained deduction hint to Towers

## 1. Pencil notes as first-class markings (`findMistakes`)
- [ ] 1.1 `TowersMistake` becomes `{ kind: "cell" | "note"; x; y }`.
- [ ] 1.2 `findMistakes`: after re-solving to the unique solution, also flag every
  empty cell whose non-empty `pencil` set excludes the solution height
  (`kind: "note"`); keep the filled-cell check (`kind: "cell"`). Derive the
  solution from grid only. Return empty when not uniquely solvable.
- [ ] 1.3 `render.ts`: note-mistakes drive the same red inset overlay as
  cell-mistakes (map both kinds into `ds.wrong`).
- [ ] 1.4 Tests: a note excluding the truth is flagged; a note with extra
  candidates is not; a wrong filled cell still is; Check-&-Save refuses a board
  carrying an invalid note (the cells highlighted, save left intact); a board
  with only valid (truth-containing) notes saves clean.

## 2. Recording solver (`engine/latin.ts` + `towers/solver.ts`)
- [ ] 2.1 `HintRecord` / reason types: discriminate by technique (Latin
  positional/numeric, set, forcing, Towers facing-clue, clue line-of-sight
  lower-bound, clue run-completion, hard arrangement) with each carrying its
  premise (the clue index + the cells reasoned over).
- [ ] 2.2 Thread an optional `record(kind, cell, n, reason)` callback through
  `LatinSolver.{place, elim, set, forcing}` and `solverEasy`/`solverHard`,
  firing on each candidate cleared and each placement. Gate every reason
  allocation on the recorder so the generator's solve path is byte-for-byte
  unchanged.
- [ ] 2.3 Hint-path `stepBudget` on the fixpoint (gated on the recorder), per
  hint-authoring §7.2.
- [ ] 2.4 `deduceHintPlan(state)`: seed a sound cube from the grid, run the
  recording solver to the difficulty cap, return the ordered script of
  eliminate/place operations with reasons.
- [ ] 2.5 Tests: each technique records the expected reason on a crafted board;
  the recorded script, applied in order, completes a generated board; the
  generator differential (byte-match vs C reference) is still green
  (recorder-off path unchanged).

## 3. Hint + keep-track (`index.ts`)
- [ ] 3.1 `pencilStrike` move (`{ type; marks: {x,y,n}[] }`); `executeMove`
  clears those candidate bits (idempotent). Unit-test purity + idempotency.
- [ ] 3.2 `TowersHint` highlight type (driving clue + line-of-sight area; target
  cells; struck candidate digits).
- [ ] 3.3 `hint(state, aux?)`: refuse on solved / on non-empty `findMistakes`,
  else build steps from `deduceHintPlan` expressed against live notes+grid:
  conditional `pencilAll` populate, then per-firing eliminate journeys
  (`pencilStrike`, one firing = one multi-cell step), then `set` placements.
  Skip any operation already reflected on the board.
- [ ] 3.4 Narration per technique, meeting the quality bar (indication → reasoning
  → necessity-voice conclusion; lead with the spotted clue pattern; name heights
  by value). Cheap guard: conclusion contains a necessity modal, not a bare
  "is/stays".
- [ ] 3.5 `hintKeepTrack`: a `pencilStrike` subset of the step's marks →
  `onTrack` (step shrunk in place) / `completed` (last struck); a placement of
  the hinted value → `completed`; anything else → `off`.
- [ ] 3.6 Wire `hint`/`hintKeepTrack` into the Game object; set `canSolve` etc.
  unchanged.
- [ ] 3.7 Add `towersGame` to `hint-resume.test.ts` (resume from any mid-game
  position to solved). Plus: plan solves from empty; refusal cases;
  keep-track completed/onTrack/off.

## 4. Hint rendering (`render.ts`)
- [ ] 4.1 `COL_HINT` + `COL_HINT_CELL` palette entries (appended; mind the
  appended-palette/cache caveat noted in the playbook); hint cache bits folded
  into the per-tile `Int32Array` key.
- [ ] 4.2 `redraw` consumes the displayed `HintStep`: shade the driving clue's
  line of sight `COL_HINT_CELL`, mark target cell(s) `COL_HINT`, show struck
  candidate digit(s) struck in `COL_HINT`; populate step renders as the
  candidates appearing.
- [ ] 4.3 Tier-2.5 render-scenario snapshot of an elimination-journey frame
  (target `COL_HINT`, clue line `COL_HINT_CELL`, clues still drawn) + targeted
  op assertions; fixed-seed scan to reach a known clue-deduction frame.

## 5. Gate + smoke
- [ ] 5.1 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green (needs `build:wasm` assets present).
- [ ] 5.2 `npm run dev` smoke (Playwright): Hint populates candidates, then a
  narrated clue elimination strikes the right heights, then a placement; the
  banner shows the *why*; Check-&-Save refuses a board where a correct height was
  crossed out (red overlay), saves a clean one; Auto-Hint steps through to a
  solved board; 0 console errors.
- [ ] 5.3 Commit (parity-gated; owner acceptance pending).

## 6. Dev guides (live wiki — part of "done")
- [ ] 6.1 `hint-authoring.md`: a "candidate-elimination games" section — solver
  cube as notes, sound-cube-seeded-from-grid invariant, persist+populate, the
  `pencilStrike` one-firing-one-step pattern, note-as-marking findMistakes.
- [ ] 6.2 `game-port-playbook.md`: pencil-mark games — note-mistakes in
  Check-&-Save (the cross-game convention), pointer to this as the exemplar for
  Solo/Keen/Unequal/Undead.

## 7. Owner acceptance
- [ ] 7.1 Owner follows hints / Auto-Hint and Check-&-Save to verify Towers plays
  and teaches correctly (incl. the note populate/strike flow and invalid-note
  rejection).
- [ ] 7.2 Flip `TS_PORTED` stays as-is (already ported); archive the change on
  acceptance, updating tasks to reflect any acceptance-driven iteration.
