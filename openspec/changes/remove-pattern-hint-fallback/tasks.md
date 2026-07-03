# Tasks — remove Pattern's generic "just because" hint fallback

## 1. Measure the residual first (decides how much enrichment is worth it)
- [x] 1.1 Instrument `deduceHintPlan` (dev-only / a throwaway test) to count, over
      N generated boards per shipped size, the fraction of hint steps that fall to
      the bottom rung (currently `fallbackFiring`). Record the per-size numbers —
      they set the enrichment budget and confirm the promote-over-reject call
      (design D4; parent measured ~0.3% @10×10 → ~28% @30×30 board-level).
      **Measured (40 boards/size, throwaway test, since deleted):**
      | size | % of steps hitting bottom rung | % of boards touching it |
      |------|-------------------------------:|------------------------:|
      | 10×10 | 0.0% | 0% |
      | 15×15 | 0.0% | 0% |
      | 20×20 | 0.0% (2 steps) | 2.5% |
      | 25×25 | 0.1% | 15% |
      | 30×30 | 0.3% | 32.5% |
      Confirms **promote** (rejecting discards ~⅓ of 30×30 boards) and that
      **enrichment (task 3) is not worth it** — named techniques already cover
      ≥99.7% of steps at every shipped size.

## 2. Reframe the bottom rung as a named technique (the core change)
- [x] 2.1 `pattern/solver.ts`: retire the `forced` `PatternHintReason` arm; add an
      **intersection** arm (the cells forced in every arrangement of one line's runs
      consistent with its marks). `fallbackFiring` (renamed `intersectionFiring`)
      returns it instead of `forced`.
- [x] 2.2 `pattern/index.ts` `narrate`: necessity-voice narration for the new reason
      — *"Whichever way this ${orient}'s runs fit, ${these} must be black / must stay
      white"* — no bare state-of-being verb (§2.1/§2.7 conclusion guard); dropped the
      misleading "only one arrangement fits" wording.
- [x] 2.3 Render: the intersection step's forced cells stay `COL_HINT` (same as the
      other black/white techniques) — no new legend colour. Unchanged from the old
      `forced` arm (same `value`/`cells` shape), so the cache key already folds the
      hint bit for these cells.

## 3. (Conditional on 1.1) Enrich the elegant technique set
- [x] 3.1 **Skipped by the 1.1 measurement** — the bottom rung is ≤0.3% of steps at
      every shipped size, so enrichment buys negligible teaching elegance. Recorded
      in the design (residual gates enrichment) and tasks 1.1; not implemented.

## 4. Spec + guide
- [x] 4.1 `pattern` spec: replaced the generic-fallback allowance in the explained-hint
      requirement with "every step names a technique; the general single-line
      intersection is the always-explained bottom rung" (this change's delta, applied
      on archive), and reconciled the illustrative wording to the necessity voice.
      Scenario "No hint step is a generic un-narrated fallback" already present.
- [x] 4.2 `hint-authoring.md` §5.6a: rewritten to describe the intersection bottom rung
      as the honest, named completion (not a "just because"), with the measured
      residual justifying promote-over-reject + skipping enrichment. §5's Pattern
      "outstanding case" note updated to "now compliant".

## 5. Verify + close out
- [x] 5.1 `pattern-hint.test.ts`: asserts every step of a full plan carries a *named*
      reason (no generic/unnamed arm remains) across 10/20/30 sizes, and that the
      intersection step is narrated in the necessity voice. `hint-resume` (bottom
      rung ⊆ `doRow` ⇒ plan completes) and the byte-match differential (generation
      untouched) stay green.
- [x] 5.2 In-app spot-check (Playwright, own dev server): Pattern hint renders an
      explained necessity-voice step ("...run of 4 has nowhere to slide, so this cell
      must be black"), auto-hint progresses the board with the `COL_HINT` overlay +
      line-of-sight shade + clue highlight, 0 console errors. The intersection bottom
      rung fires only rarely on 30×30 (impractical to reach by hand) — covered
      deterministically by the tier-1 narration test; its render is identical to the
      other black/white steps (same `COL_HINT`, same cell shape).
- [x] 5.3 `openspec validate remove-pattern-hint-fallback --strict` passes; full gate
      green (tsc -b --noEmit clean, biome lint 367 files clean, vitest 1957 passed,
      vite production build succeeds).
- [ ] 5.4 On owner acceptance, commit + archive.
