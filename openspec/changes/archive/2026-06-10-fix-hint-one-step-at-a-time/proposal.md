# Change: Manual hints show one step at a time

## Why
Owner-reported regression from `add-hint-plans` (2026-06-10): after the user
follows a hint manually, the midend advances the stored plan **and displays
the next step unasked** — a continuous stream of hints from a single Hint
press. For manual play the user wants exactly one hint per request; only
auto-play (executeHint) should chain step displays.

## What Changes
- A player move that completes the displayed step still advances the stored
  plan (tracking and recompute-only-on-invalidation are unchanged) but now
  **hides the hint display** instead of presenting the next step.
- `midend.hint()` while a hidden plan is stored re-displays the current
  (already-advanced) step instantly — still no recompute.
- `executeHint()` behaviour is unchanged: the executed step displays through
  its slow-motion animation and the next step is previewed at settle, which
  is what back-to-back auto-play needs.
- `onTrack` moves keep the current step displayed (partial progress on the
  hinted line still shows the adjusted remainder).

## Impact
- Affected specs: `ts-engine` (MODIFIED: ephemeral Hint System requirement)
- Affected code: `src/native/engine/midend.ts` (display-visibility flag),
  `src/native/engine/midend.test.ts`
