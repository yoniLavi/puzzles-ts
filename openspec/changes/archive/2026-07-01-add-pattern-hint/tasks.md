# Tasks — Pattern hint

## 1. Solver recording mode
- [x] 1.1 Thread a gated optional recorder through the line solver tagging each
      forced cell with its technique + premise (line, clue, constraining marks);
      `if (recorder)`-gate every allocation so the generator path is byte-identical.
      *Landed as a **parallel** recorder instead (hint-authoring §9.4 shape): the
      hint code (`packLeft`/`packRight`/`analyzeLine`/`fallbackFiring`/
      `deduceHintPlan` in `solver.ts`) is separate from the generator's
      `solvePuzzle`/`isSoluble`, so the byte-match differential is unaffected **by
      construction** — no gating flag needed. `doRow`/`doRecurse` (pure) are reused
      for the completeness fallback.*
- [x] 1.2 Decompose the line deduction into the named techniques (overlap,
      unreachable gap) so each firing has a teachable reason and a single-colour
      forced set; keep a single-cell/segment line-solver fallback (`forced`).
- [x] 1.3 Re-run `pattern-differential` (byte-match) — green (generator path
      untouched).

## 2. `hint()` / plan
- [x] 2.1 `deduceHintPlan(state)`: run the analysis from the player's marks on a
      working board, emit one contiguous-segment `HintStep` per firing (move is a
      `fillCells` over the forced cells), recompute and repeat until solved.
- [x] 2.2 `hint(state)`: refuse when solved or `findMistakes` non-empty (couples to
      overlay + banner); else the plan.
- [x] 2.3 `hintKeepTrack`: completed/onTrack(shrink)/off for a multi-cell step (§5.5).
      `refreshHintStep` not needed — Pattern has no note-clearing side effects
      (an unrelated move → `off` → recompute); confirmed by `hint-resume.test.ts`.

## 3. Narration
- [x] 3.1 Lead with the indication, necessity voice, terse; one technique → one
      glance-able step. Re-read clue phrasings at degenerate extremes (§2.7) — the
      zero-slack ("has nowhere to slide") wording avoids "slide only 0 cells".

## 4. Rendering
- [x] 4.1 Forced cells `COL_HINT` (highlight only, never pre-filled); clue + line of
      sight `COL_HINT_CELL`; cited black marks ringed `COL_HINT_BLACKREF` (overlap
      anchors). Hint bits folded into the per-cell `Int32Array` cache key.

## 5. Tests (tier 1 + 2.5)
- [x] 5.1 `pattern-hint.test.ts`: every generated board's plan solves it; each forced
      cell agrees with the unique solution; narration opens with an indication and
      concludes with a necessity modal; colour-legend roles disjoint; refusal +
      keep-track. `patternGame` added to `hint-resume.test.ts`.
- [x] 5.2 Tier-2.5 `pattern-render-scenario.test.ts` reaching a hint frame (op
      assertions + snapshot) and a ringed-premise frame.

## 6. Close out
- [x] 6.1 Update `docs/porting/hint-authoring.md` (Pattern §5.3 row + the
      leftmost/rightmost-packing named-technique lesson) in this change.
- [x] 6.2 Gate green (1910 tests); dev-verified the hint + stepper + auto-hint
      (solved a full board to "Perfect!", 0 console errors); owner-accepted
      2026-07-01; committed + `openspec archive add-pattern-hint`.
