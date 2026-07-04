# Tasks — add-lightup-hint

## 1. Hard-tier policy debt (do FIRST — it shapes the hint's scope)

- [x] 1.1 Measure the recursion-depth distribution over seeded Hard boards
      (depth-1-only vs deeper) across the three Hard presets.
      **Result (2026-07-04):** 7×7 (100 boards): depth-1 31%, ≥2 69%;
      10×10 (50): depth-1 24%, ≥2 76%; 14×14 (25): depth-1 20%, ≥2 80%
      (many at the depth-5 cap). Nested guessing dominates — the
      what-if-walk alternative cannot rescue the tier.
- [x] 1.2 Owner decision with the numbers: rename Hard → Unreasonable
      (default lean, D4) applied — the measurement forecloses the
      alternative (D4 §3 required "nearly all depth-1-only"; the opposite
      holds). Presets (`DIFF_NAMES`), paramConfig choices, augmentation
      template, and a help divergence note (`help/differences.md`)
      renamed; params encoding `d2` and generation untouched; byte-match
      differential green.

## 2. Recording

- [x] 2.1 Recorder threaded (gated on presence) through `trySolveLight`,
      `trySolveNumber` (both branches), and the discount mark site with
      unlit/clue source payloads (D1); firings carry technique, target
      cells, evidence cells, and the working-board snapshot. Step budget
      on the recording path only (§7.2).
- [x] 2.2 `deduceHintPlan(state)` runs from the player's marks, one
      firing = one (possibly multi-cell) step; plan completes every
      Easy/Tricky board (`lightup-hint.test.ts` "plan completeness" +
      `hint-resume.test.ts` lightup entry).
- [x] 2.3 Differential green with the recorder off (byte-match
      unchanged); bleed test asserts every firing's marks stay inside its
      narrated evidence (`lightup-hint.test.ts`).

## 3. Hint hooks + narration

- [x] 3.1 `hint()` (refusal on solved/mistaken boards → overlay + banner),
      `hintKeepTrack` (subset-onTrack shrink, PRE-move state semantics),
      `refreshHintStep`, grouped multi-cell steps for clue firings.
- [x] 3.2 Narrations per D3 tuned to §2 (indication-first, necessity
      voice, terse; degenerate 0-clue and singular branches);
      conclusion-voice guard test.
- [x] 3.3 `lightupGame` joined `hint-resume.test.ts`.

## 4. Rendering

- [x] 4.1 Hint colours appended 7–10 past the C enum (`COL_HINT`,
      `COL_HINT_CELL`, `COL_HINT_LITREF` teal, `COL_HINT_DARKREF` amber);
      targets `COL_HINT` highlight-only; evidence shade-or-teal-ring by
      the cell's own lit state (§5.4); driving clue digit recolours
      `COL_HINT` (the light `COL_HINT_CELL` was unreadable on black —
      caught live); all bits in the packed cache diff key.
- [x] 4.2 Tier-2.5 render scenarios (`lightup-render-scenario.test.ts`):
      opener (grouped saturated clue), forcedLight corridor frame,
      clueSatisfied grouped-marks frame, discountUnlit frame; snapshot +
      targeted op assertions.

## 5. Verify + close

- [x] 5.1 Full gate green (tsc, biome lint, 2046 vitest, vite build);
      dev-server Playwright: manual stepper show → apply, auto-hint
      solved an Easy ("Splendid!") and a Tricky ("Perfect!") board to
      completion with coherent narration, wrong-board refusal highlights
      the mistake red, Unreasonable board plays its deductive prefix then
      refuses honestly at the guess point; 0 console errors. (A transient
      grey frame investigated → upstream's own 0.3 s completion blink.)
- [x] 5.2 hint-authoring.md updated (§5.3 legend row, §5.4 Light Up
      example, clue-digit-contrast lesson). Owner acceptance + archive
      pending.
