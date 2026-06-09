# Change Proposal: Plan-carrying hints

## Summary

`Game.hint()` currently returns a single next move; the midend stores it as the
active hint and every hint request (including each auto-play step) recomputes
from scratch. This change makes `hint()` return the **whole computed plan** — an
ordered sequence of moves, each narrated for the state it applies to — and makes
the midend store that plan in `activeHint`, display one step at a time, advance
as steps complete (manually or via `executeHint`), and recompute **only when a
player action invalidates the plan**.

## Motivation

Three forces, all observed during the 2026-06-09 hint-fix session (commits
`8d4007a`..`4c6cb7f`):

1. **Product**: a stuck player wants to *follow a sequence of hints* out of
   trouble. Today each completed hint move clears the display; the player must
   re-press Hint after every move. With a stored plan, completing a step
   automatically reveals the next one.
2. **Correctness**: recomputing per step allows *replan drift*. The solver's
   forward search is heuristic (inadmissible h), so successive solved-paths can
   disagree; a suboptimal first move at step k can be undone by the exact
   replan at step k+1 (observed as a 2-move wobble on the two-swap 5×5 endgame;
   an earlier, worse variant of the same class was the infinite auto-hint loop
   fixed in `7e3eddd`). Executing one stored plan verbatim eliminates the whole
   drift class.
3. **Performance**: the exact bidirectional endgame fallback (`4c6cb7f`) costs
   ~0.5–2s when it engages. Today that price is paid per step while crossing a
   local minimum; with a stored plan it is paid once.

## What changes

- **Engine contract** (`src/native/engine/game.ts`):
  - New `HintStep<Move, Highlights>` = `{ move, explanation, highlights? }`.
  - `HintResult` ok-variant becomes `{ ok: true; steps: HintStep[] }`
    (non-empty), replacing the single `move`/`explanation`/`highlights` fields.
  - `ActiveHint` becomes the stored plan: `{ steps: HintStep[]; index: number }`.
  - `hintKeepTrack(move, step, state)` returns a verdict
    `"completed" | "onTrack" | "off"` instead of a boolean, receives the
    *current step* (and may adjust `step.move` in place — e.g. shrink a slide's
    remaining distance after partial manual progress).
  - `Game.redraw` receives the current `HintStep` (same field shape as the old
    `ActiveHint`) rather than the whole plan.
- **Midend** (`src/native/engine/midend.ts`):
  - `hint()` is a no-op refresh while a valid plan is active; otherwise it
    computes and stores a fresh plan at `index: 0`.
  - `executeHint()` executes the current step of the stored plan (computing one
    only if absent), keeps the step displayed through the slow-motion
    animation, and advances to the next step when the animation settles
    (replacing `clearHintOnAnimationEnd`); the plan clears when the last step
    completes or the game is solved.
  - Manual moves consult `hintKeepTrack`: `"completed"` advances the plan,
    `"onTrack"` keeps the current step, `"off"` drops the plan. Undo / redo /
    restart / new game / solve still clear it unconditionally.
- **Sixteen** (`src/native/games/sixteen/index.ts`):
  - The A* search and the bidirectional fallback both reconstruct the **full
    move path** (parent pointers) instead of retaining only the first two
    moves.
  - Narration is computed **per step at plan time** by simulating the path
    (landing-cell narration, in-grid delta normalization, two-leg preview via
    the next step). `SixteenHintHighlights.secondMove` is superseded by the
    plan and removed.
  - `hintKeepTrack` returns the new verdicts; the old in-place 2D transition
    mutation is superseded by the midend's plan advance.

## Out of scope

- No change to the worker/Comlink transport: `hint()`/`executeHint()` keep
  their `string | undefined` error signatures, and the status bar still carries
  one explanation string.
- No change to the auto-play loop in `src/puzzle/puzzle.ts` (pacing and
  slow-motion animation are unchanged).
- No persistence of plans into saves; the plan stays midend-ephemeral.

## Impact

- Specs: `ts-engine` (two MODIFIED requirements).
- Code: `src/native/engine/{game,midend}.ts`, `src/native/games/sixteen/index.ts`,
  engine + sixteen test suites (hint-shape updates throughout).
- Only Sixteen implements `hint` today, so the contract migration is contained.
