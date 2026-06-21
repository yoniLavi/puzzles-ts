# Tasks: Add an explained deduction hint to Towers

## 1. Pencil notes as first-class markings (`findMistakes`)
- [x] 1.1 `TowersMistake` becomes `{ kind: "cell" | "note"; x; y }`.
- [x] 1.2 `findMistakes`: after re-solving to the unique solution, also flag every
  empty cell whose non-empty `pencil` set excludes the solution height
  (`kind: "note"`); keep the filled-cell check (`kind: "cell"`). Derive the
  solution from grid only. Return empty when not uniquely solvable.
- [x] 1.3 `render.ts`: note-mistakes drive the same red inset overlay as
  cell-mistakes (map both kinds into `ds.wrong`).
- [x] 1.4 Tests: a note excluding the truth is flagged; a note with extra
  candidates is not; a wrong filled cell still is; Check-&-Save refuses a board
  carrying an invalid note (the cells highlighted, save left intact); a board
  with only valid (truth-containing) notes saves clean.

## 2. Recording solver (`engine/latin.ts` + `towers/solver.ts`)
- [x] 2.1 `HintRecord` / reason types: discriminate by technique (Latin
  positional/numeric, set, forcing, Towers facing-clue, clue line-of-sight
  lower-bound, clue run-completion, hard arrangement) with each carrying its
  premise (the clue index + the cells reasoned over).
- [x] 2.2 Thread an optional `record(kind, cell, n, reason)` callback through
  `LatinSolver.{place, elim, set, forcing}` and `solverEasy`/`solverHard`,
  firing on each candidate cleared and each placement. Gate every reason
  allocation on the recorder so the generator's solve path is byte-for-byte
  unchanged.
- [x] 2.3 Hint-path `stepBudget` on the fixpoint (gated on the recorder), per
  hint-authoring §7.2.
- [x] 2.4 `deduceHintPlan(state)`: seed a sound cube from the grid, run the
  recording solver to the difficulty cap, return the ordered script of
  eliminate/place operations with reasons.
- [x] 2.5 Tests: each technique records the expected reason on a crafted board;
  the recorded script, applied in order, completes a generated board; the
  generator differential (byte-match vs C reference) is still green
  (recorder-off path unchanged).

## 3. Hint + keep-track (`index.ts`)
- [x] 3.1 `pencilStrike` move (`{ type; marks: {x,y,n}[] }`); `executeMove`
  clears those candidate bits (idempotent). Unit-test purity + idempotency.
- [x] 3.2 `TowersHint` highlight type (driving clue + line-of-sight area; target
  cells; struck candidate digits).
- [x] 3.3 `hint(state, aux?)`: refuse on solved / on non-empty `findMistakes`,
  else build steps from `deduceHintPlan` expressed against live notes+grid:
  conditional `pencilAll` populate, then per-firing eliminate journeys
  (`pencilStrike`, one firing = one multi-cell step), then `set` placements.
  Skip any operation already reflected on the board.
- [x] 3.4 Narration per technique, meeting the quality bar (indication → reasoning
  → necessity-voice conclusion; lead with the spotted clue pattern; name heights
  by value). Cheap guard: conclusion contains a necessity modal, not a bare
  "is/stays".
- [x] 3.5 `hintKeepTrack`: a `pencilStrike` subset of the step's marks →
  `onTrack` (step shrunk in place) / `completed` (last struck); a placement of
  the hinted value → `completed`; anything else → `off`.
- [x] 3.6 Wire `hint`/`hintKeepTrack` into the Game object; set `canSolve` etc.
  unchanged.
- [x] 3.7 Add `towersGame` to `hint-resume.test.ts` (resume from any mid-game
  position to solved). Plus: plan solves from empty; refusal cases;
  keep-track completed/onTrack/off.

## 4. Hint rendering (`render.ts`)
- [x] 4.1 `COL_HINT` + `COL_HINT_CELL` palette entries (appended; mind the
  appended-palette/cache caveat noted in the playbook); hint cache bits folded
  into the per-tile `Int32Array` key.
- [x] 4.2 `redraw` consumes the displayed `HintStep`: shade the driving clue's
  line of sight `COL_HINT_CELL`, mark target cell(s) `COL_HINT`, show struck
  candidate digit(s) struck in `COL_HINT`; populate step renders as the
  candidates appearing.
- [x] 4.3 Tier-2.5 render-scenario snapshot of an elimination-journey frame
  (target `COL_HINT`, clue line `COL_HINT_CELL`, clues still drawn) + targeted
  op assertions; fixed-seed scan to reach a known clue-deduction frame.

## 5. Gate + smoke
- [x] 5.1 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build` — all green (1412 native tests).
- [x] 5.2 `npm run dev` smoke (Playwright): verified end-to-end — Hint populates
  candidates; a narrated clue lower-bound elimination shades the clue's line of
  sight, strikes height 5, reads "Clue 3 can see only 3 towers… it can't go
  here"; placements narrate "Every other height has been ruled out… so it must be
  a 3" against a cell visibly collapsed to one note; Auto-Hint stepped through to
  a fully solved board ("Way to go!"); Check-&-Save refused a board with a struck
  correct height ("Not saved — 1 mistake found"); 0 console errors; sticky
  pencil-mode indicator renders.
- [x] 5.3 Commit (parity-gated; owner acceptance pending — commit on acceptance,
  per the openspec-changes workflow).

### Implementation notes (for owner-acceptance review)
- **Recording mode** lives in shared `engine/latin.ts` (`DeductionRecorder`,
  `LatinReason`, a `group` per firing, a fixpoint `budget`), enabled *after*
  `alloc` so seeding the cube from givens isn't recorded. Recorder-off path is
  byte-for-byte unchanged — the C differential is still green.
- **A placement's row/column eliminations** are recorded as `dup` strikes and
  emitted as a `continuesPrevious` strike step after the placement; on recompute
  after a real placement they bake into the cube and drop out (so the resume walk
  is mostly placements, while Auto-Hint still teaches the cleanup). Tunable — see
  design.md "Tuning latitude" if acceptance finds the cleanup steps tedious.
- **Hint difficulty cap** is the board's own difficulty, capped below recursion
  (`min(diff, DIFF_EXTREME)`): a guess isn't a teachable note strike, so on an
  Unreasonable board the hint teaches the deductive part and then refuses when
  only a guess remains.

### Playtesting iteration (owner suggestions, 2026-06-21 — dev-verified)
1. **Auto-pencil preference (default on).** Placing a tower now auto-strikes that
   height from the pencil marks of every other cell in its row and column. The
   decision is baked into the `set` move (`autoElim`, read off `ui.autoPencil` in
   `interpretMove`) so `executeMove` stays pure and replay is deterministic. When
   on, the hint folds those trivial eliminations into the placement (no step); when
   off, it teaches them as an explicit `continuesPrevious` strike. `Game.hint`
   gained an optional third `ui` arg (the midend passes `this.ui`) so the hint can
   read the pref; other games ignore it.
2. **Naked-single-first hint.** `buildSteps` was rewritten to walk a working copy
   of the board the way a person solves: a naked single (a cell whose notes
   collapsed to one candidate) first, else the next clue elimination, else a forced
   placement. This both surfaces the human-natural move and stops burying the
   interesting clue deductions. Key fix: the clue-strike window extends to the first
   *unreflected* placement (the facing-clue placement is recorded first and, once
   applied, must not hide the clue strikes recorded after it). Plan length on a 5×5
   easy board dropped from ~57 trivial-heavy steps to ~39 (auto-pencil on), and the
   clue deductions are now taught rather than hidden.
   Dev-verified live: Auto-Hint solves with clean auto-pencilled notes and narrated
   clue deductions; 0 console errors.
3. **Mistake-overlay cache bug fixed (owner-reported).** The red mistake overlay
   (`ds.wrong`) was passed to `drawTile` but **not** part of the per-tile diff key,
   so a Check-&-Save (which runs a frame after the offending move drew the cell)
   repainted nothing — the highlight never showed. Fix: a `drawnWrong` sidecar
   added to the cache-miss condition (mirrors `drawnHint`). Regression test redraws
   the same drawstate twice (paint → `findMistakes()` → redraw) and asserts the red
   appears on the second paint. Playbook gained the general "overlays must be in
   the diff key" gotcha.
4. **Hints highlight the driving clue cell (owner-requested).** A clue deduction
   now shades the clue cell(s) themselves (`COL_HINT_CELL`, same premise colour as
   the line of sight), so the player sees *which* clue the hint is about; a facing
   pair shades both clues. `reasonArea` prepends `cluePos(...)`; the facing reason
   gained `clue2`. Dev-verified live (facing pair + single-clue lower-bound frames).

## 6. Dev guides (live wiki — part of "done")
- [x] 6.1 `hint-authoring.md`: a "candidate-elimination games" section — solver
  cube as notes, sound-cube-seeded-from-grid invariant, persist+populate, the
  `pencilStrike` one-firing-one-step pattern, note-as-marking findMistakes.
- [x] 6.2 `game-port-playbook.md`: pencil-mark games — note-mistakes in
  Check-&-Save (the cross-game convention), pointer to this as the exemplar for
  Solo/Keen/Unequal/Undead.

## 7. Owner acceptance
- [x] 7.1 Owner follows hints / Auto-Hint and Check-&-Save to verify Towers plays
  and teaches correctly (incl. the note populate/strike flow and invalid-note
  rejection).
- [x] 7.2 Flip `TS_PORTED` stays as-is (already ported); archive the change on
  acceptance, updating tasks to reflect any acceptance-driven iteration.
