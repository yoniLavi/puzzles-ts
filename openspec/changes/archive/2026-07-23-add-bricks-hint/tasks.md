# Tasks — add-bricks-hint

## 1. Recording deduction pass (`solver.ts`)

- [x] 1.1 `BricksReason` discriminated union: `three` / `unsupported` /
      `overcount` / `strandSupport` / `undercount` (Easy tier) + `chain`
      (recursive tier), each carrying the evidence cell indices (design D3).
- [x] 1.2 `nextForcedMove(grid, w, h)` — the Easy single-cell contradiction with
      the reason read from the rejected trial's `FE_*` flags (run `bricksValidate`
      with an `errors` array); fixed priority three → gravity → count when several
      fire. Returns `{ index, to, reason } | null`.
- [x] 1.3 Recursive fallback: at an Easy stall, `nextForcedMoveRecurse(grid, w, h,
      maxdiff)` — tentative colour → `solveGame(maxdiff-1)` INVALID → forced
      opposite, reason `chain` with the sub-solve's final `FE_*` cells.
- [x] 1.4 `deduceBricksPlan(grid, w, h)` — clone, loop `nextForcedMove` (then
      recurse) applying one cell per step, recording `{ index, to, reason }`, until
      complete / no move / `HINT_PLAN_MAX` (design D1). Deterministic scan order
      (recompute-stable).

## 2. `hint()` / `hintKeepTrack()` (`index.ts`)

- [x] 2.1 Refusal guards (design D2): solved → banner; `findMistakes().length > 0`
      → "fix mistakes" banner; re-solve clues to the unique solution and compare
      the player's placed cells → mismatch → "a placed cell doesn't match the
      solution" banner.
- [x] 2.2 `narrate(reason, state)` — premise → contradiction → conclusion in the
      necessity voice, one function per `BricksReason` kind (design D3); name the
      clue value where a clue is the evidence.
- [x] 2.3 `hint()` builds `HintResult<BricksMove, BricksHint>`: one step per forced
      cell, `move` = the `paint` of that cell, `highlights = { target, forced,
      evidence }`. No `continuesPrevious` (single-cell deductions).
- [x] 2.4 `hintKeepTrack` — `"completed"` when the move paints the target to the
      hinted colour, else `"off"` (design D5).
- [x] 2.5 Wire `hint`/`hintKeepTrack` onto `bricksGame`.

## 3. Rendering (`render.ts`)

- [x] 3.1 Append `COL_HINT` (blue) + `COL_HINT_CELL` (light blue) after
      `COL_CURSOR` (index-for-index stable); update `colours()`.
- [x] 3.2 Consume the `hint` param in `redraw`: target cell `COL_HINT` fill,
      evidence cells an inset `COL_HINT_CELL` ring; do **not** pre-place the forced
      colour. Fold the per-cell hint role into the cache word (§3.2) so it repaints
      and clears like the mistake overlay.

## 4. Tests

- [x] 4.1 `bricks-hint.test.ts` tier-1: on a crafted board, each Easy reason kind
      (three / unsupported / overcount / strandSupport / undercount) fires and its
      narration names the rule + forces the right colour; the recursive kind fires
      on a stall board.
- [x] 4.2 Refusal cases: solved board, rule-violating board, and a wrong-but-legal
      board each refuse with the right banner.
- [x] 4.3 `hintKeepTrack`: following the hinted move returns `"completed"`; a
      different move returns `"off"`.
- [x] 4.4 Plan stability: a hint recomputed after following one step continues the
      deduction (no drift), and the plan solves a fixture board to completion.
- [x] 4.5 A render-scenario hint frame: the target draws `COL_HINT`, evidence draws
      `COL_HINT_CELL`, on an already-warm drawstate (§3.2); snapshot.

## 5. Close-out

- [x] 5.1 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [x] 5.2 `openspec validate add-bricks-hint --strict`.
- [x] 5.3 Dev-verify in the browser: Hint on a fresh board explains a forced move
      and highlights it; Auto-hint paces; refusal banners fire; 0 console errors.
- [x] 5.4 Update `docs/porting/hint-authoring.md` if anything here is new to the
      guide (the contradiction-reason-from-error-flags pattern).

## 6. On owner acceptance

- [x] 6.1 Archive; commit hint + archive together.
