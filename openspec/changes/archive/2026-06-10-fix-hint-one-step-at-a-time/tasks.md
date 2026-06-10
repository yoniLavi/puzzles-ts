# Tasks: fix-hint-one-step-at-a-time

## 1. Implementation

- [x] 1.1 `midend.ts`: add a hint display-visibility flag; manual
      `"completed"` advances the plan and hides the display; `hint()`
      re-displays a hidden stored plan without recompute; `executeHint()`
      and `onTrack` display behaviour unchanged; redraw/status-bar narrate
      the *displayed* step only.
- [x] 1.2 Update/add behavioural tests in `midend.test.ts`: manual
      completion hides; next `hint()` shows the advanced step with no
      recompute; plan still tracks (off-plan drop, exhaustion) while hidden;
      auto-play preview unchanged.

## 2. Spec

- [x] 2.1 MODIFIED ts-engine hint requirement; `openspec validate
      fix-hint-one-step-at-a-time --strict` passes.

## 3. Gate

- [x] 3.1 Full gate green; dev-server spot-check on Sixteen (hint, follow
      it manually, confirm display clears and Hint shows the next step).
