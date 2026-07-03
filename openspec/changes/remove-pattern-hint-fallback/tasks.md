# Tasks — remove Pattern's generic "just because" hint fallback

## 1. Measure the residual first (decides how much enrichment is worth it)
- [ ] 1.1 Instrument `deduceHintPlan` (dev-only / a throwaway test) to count, over
      N generated boards per shipped size, the fraction of hint steps that fall to
      the bottom rung (currently `fallbackFiring`). Record the per-size numbers —
      they set the enrichment budget and confirm the promote-over-reject call
      (design D4; parent measured ~0.3% @10×10 → ~28% @30×30 board-level).

## 2. Reframe the bottom rung as a named technique (the core change)
- [ ] 2.1 `pattern/solver.ts`: retire the `forced` `PatternHintReason` arm; add an
      **intersection** arm (the cells forced in every arrangement of one line's runs
      consistent with its marks). `fallbackFiring` returns it instead of `forced`.
- [ ] 2.2 `pattern/index.ts` `narrate`: necessity-voice narration for the new reason
      — *"whichever way this ${orient}'s runs fit, ${these} are always black / stay
      white"* — no bare state-of-being verb (§2.7 conclusion guard); drop the
      misleading "only one arrangement fits" wording.
- [ ] 2.3 Render: the intersection step's forced cells stay `COL_HINT` (same as the
      other black/white techniques) — no new legend colour. Confirm the cache key
      already folds the hint bit for these cells.

## 3. (Conditional on 1.1) Enrich the elegant technique set
- [ ] 3.1 Only if the measured bottom-rung fraction is materially high at a shipped
      size: add edge/anchor forcing, run-completion, and/or gluing to `analyzeLine`
      so common cases surface an elegant named step; stop once the residual is small.
      Each new technique keeps one-firing-one-step + the necessity-voice narration.

## 4. Spec + guide
- [ ] 4.1 `pattern` spec: replace the generic-fallback allowance in the explained-hint
      requirement with "every step names a technique; the general single-line
      intersection is the always-explained bottom rung" (this change's delta, applied
      on archive). Add a scenario asserting no un-narrated step.
- [ ] 4.2 `hint-authoring.md` §5.6a: update to describe the intersection bottom rung as
      the honest completion (not a "just because"), and the re-derive-the-technique rule.

## 5. Verify + close out
- [ ] 5.1 `pattern-hint.test.ts`: assert every step of a full plan carries a *named*
      reason (no generic/unnamed arm remains); the intersection step is narrated in
      the necessity voice. `hint-resume` (bottom rung ⊆ `doRow` ⇒ plan completes) and
      the byte-match differential (generation untouched) stay green.
- [ ] 5.2 In-app spot-check on a size where the bottom rung fires (per 1.1): the step
      reads as an explained technique, auto-hint completes the board, 0 console errors.
- [ ] 5.3 `openspec validate remove-pattern-hint-fallback --strict`; full gate green.
- [ ] 5.4 On owner acceptance, commit + archive.
