# Tasks — add-slant-hint

## 1. Recording (solver)

- [x] 1.1 Rich `SlantFiring` recorder + `seedFrom` starting position on
      `slantSolve` (`opts.record` / `opts.seedFrom`), gated so the generator's
      call stays byte-identical (D1).
- [x] 1.2 `deduceHintPlan(state)` — seed the player's `soln`, run the recording
      Hard solver, return the ordered firings not yet on the board.
- [x] 1.3 Differential green with the recorder off + no seed (byte-match
      unchanged, `slant-differential.test.ts` 20 green); plan-completeness:
      following the plan solves every generated Easy/Hard board from empty and
      mid-solve (`slant-hint.test.ts`).

## 2. Hint hooks + narration (index.ts)

- [x] 2.1 `hint()` — refusal on solved/mistaken boards → overlay + banner;
      firings map to `HintStep` journeys; clue firings emit multi-leg journeys
      (`continuesPrevious`) (D4).
- [x] 2.2 `hintKeepTrack` (PRE-move state; the set must match the step's
      square/slash). `refreshHintStep` not needed (no note-clearing side
      effects — like Range).
- [x] 2.3 Narrations tuned to §2 (indication-first, necessity voice, terse;
      0-clue / 4-clue / singular branches; continuation legs keep the modal);
      equivalence in the honest locked-slant voice (D3).

## 3. Rendering (render.ts)

- [x] 3.1 Hint cache bits (target / evidence / anchor-ring / per-vertex clue
      recolour) folded into the packed tile word (bits 21+); `redraw` consumes
      the displayed `HintStep` (D5).
- [x] 3.2 Highlight builder per technique: clue neighbourhood, loop chain,
      trapped components + incident squares, locked class + anchor; target is
      highlight-only (no slash preview).
- [x] 3.3 Colours appended past the C enum (`COL_HINT`, `COL_HINT_CELL`,
      `COL_HINT_REF`); dark-mode overrides unaffected.

## 4. Tests

- [x] 4.1 `slant-hint.test.ts` tier-1: refusal (solved / mistaken),
      necessity-voice + visible-evidence per step, plan-completeness,
      technique-opener coverage, keep-track.
- [x] 4.2 Tier-2.5 `slant-render-scenario.test.ts`: opener clue frame
      (`COL_HINT` target + recoloured clue + `COL_GRID`), loop frame
      (`COL_HINT_CELL` chain), equivalence frame (`COL_HINT_REF` ring); snapshot.
- [x] 4.3 `hint-resume.test.ts` slant entry (green).

## 5. Verify + guides

- [x] 5.1 Full gate green (`tsc -b` → biome lint → vitest 2121 → vite build).
- [x] 5.2 Dev-verify in-browser (Playwright): manual clue-fill hint (grouped
      blue targets + recoloured clue + banner), continuation-leg with evidence
      shade, auto-hint solved to the "Nice work!" win dialog, refusal on a
      dirtied board lit the red mistake overlay + banner; 0 console errors.
- [x] 5.3 `docs/porting/hint-authoring.md` updated: §5.3 legend Slant row +
      new §5.6b (honest non-local tier for a no-mark game; recorder+seedFrom;
      connectivity-chain evidence needs incident squares).
- [x] 5.4 `openspec validate add-slant-hint --strict` passes.
- [x] 5.5 Committed + archived on owner acceptance (2026-07-04).
