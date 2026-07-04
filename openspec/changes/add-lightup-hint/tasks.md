# Tasks — add-lightup-hint

## 1. Hard-tier policy debt (do FIRST — it shapes the hint's scope)

- [ ] 1.1 Measure the recursion-depth distribution over seeded Hard boards
      (depth-1-only vs deeper) across the three Hard presets.
- [ ] 1.2 Owner decision with the numbers: rename Hard → Unreasonable
      (default lean, D4) vs promote depth-1 forcing to a narrated
      what-if walk. Apply it (presets, paramConfig choices, augmentation
      template `{difficulty:easy|tricky|hard}`, help divergence note if
      renamed); byte-match differential must stay green either way.

## 2. Recording

- [ ] 2.1 Thread a gated recorder through `trySolveLight`,
      `trySolveNumber` (both branches), and the discount callback (D1);
      firings carry technique, target cells, evidence cells, and the
      working-board snapshot for stale-proof highlights.
- [ ] 2.2 `deduceHintPlan(state)`: run from the player's current marks,
      one firing = one (possibly multi-cell) step; verify the plan
      completes every Easy/Tricky generated board.
- [ ] 2.3 Differential still green with the recorder off (byte-match
      unchanged); a bleed test asserting a step's marks stay inside its
      narrated evidence.

## 3. Hint hooks + narration

- [ ] 3.1 `hint()` (refusal on solved/mistaken boards → overlay + banner),
      `hintKeepTrack` (subset-onTrack shrink, PRE-move state semantics),
      grouped multi-cell steps for clue firings.
- [ ] 3.2 Narrations per D3, tuned to §2 of hint-authoring.md (lead with
      the indication, necessity voice, value-aware, terse, degenerate
      extremes 0 and 4); conclusion-voice guard tests.
- [ ] 3.3 `lightupGame` joins `hint-resume.test.ts`.

## 4. Rendering

- [ ] 4.1 Hint colours appended past the C enum; targets `COL_HINT`
      highlight-only (no mark preview), evidence `COL_HINT_CELL` shade,
      per D5; all bits in the packed cache diff key.
- [ ] 4.2 Tier-2.5 render scenarios: a forcedLight frame (corridor
      shaded, target blue), a clueSatisfied frame (grouped mark targets),
      a discount frame; snapshots + targeted op assertions.

## 5. Verify + close

- [ ] 5.1 Full gate green; dev-server Playwright: manual hint stepper
      (show → apply), auto-hint solves an Easy and a Tricky board to
      completion with coherent narration, refusal on a wrong board
      highlights mistakes; 0 console errors.
- [ ] 5.2 Update hint-authoring.md (legend row, any new lessons) in the
      same change; owner acceptance; archive.
