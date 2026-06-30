# Tasks — Pattern hint

## 1. Solver recording mode
- [ ] 1.1 Thread a gated optional recorder through the line solver tagging each
      forced cell with its technique + premise (line, clue, constraining marks);
      `if (recorder)`-gate every allocation so the generator path is byte-identical.
- [ ] 1.2 Decompose the line deduction into the named techniques (overlap,
      completion, unreachable gap, edge/anchor) so each firing has a teachable
      reason and a single-colour forced set; keep a single-cell line-solver fallback.
- [ ] 1.3 Re-run `pattern-differential` (byte-match) — the recorder must not perturb
      generation.

## 2. `hint()` / plan
- [ ] 2.1 `deduceHintPlan(state)`: run the recording solver from the player's marks
      on a working board, emit one multi-cell `HintStep` per firing (move fills the
      forced cells), recompute and repeat until solved.
- [ ] 2.2 `hint(state)`: refuse when solved or `findMistakes` non-empty (couples to
      overlay + banner); else the plan.
- [ ] 2.3 `hintKeepTrack`: completed/onTrack(shrink)/off for a multi-cell step (§5.5).
      Assess whether `refreshHintStep` is needed (likely not — §7.3 / D4).

## 3. Narration
- [ ] 3.1 Lead with the indication, necessity voice, terse; one technique → one
      glance-able step. Re-read clue phrasings at degenerate extremes (§2.7).

## 4. Rendering
- [ ] 4.1 Forced cells `COL_HINT` (highlight only, never pre-filled); clue + line of
      sight `COL_HINT_CELL`; constraining black/white marks ringed
      `COL_HINT_BLACKREF`/`COL_HINT_WHITEREF`. Fold hint bits into the per-cell cache.

## 5. Tests (tier 1 + 2.5)
- [ ] 5.1 Every generated board's plan solves it; each step carries visible evidence;
      narration opens with an indication and concludes with a necessity modal (not a
      bare "is/stays"); colour-legend roles are disjoint; a strike/`COL_HINT` frame
      assertion per §5.3.
- [ ] 5.2 Tier-2.5 `renderScenario` reaching a hint frame (op assertions + snapshot).

## 6. Close out
- [ ] 6.1 Update `docs/porting/hint-authoring.md` (add the Pattern row to the §5.3
      table + any new lesson) in this change.
- [ ] 6.2 Gate green; dev-verify the hint + auto-hint + stepper in the browser; on
      owner acceptance, commit + `openspec archive add-pattern-hint`.
