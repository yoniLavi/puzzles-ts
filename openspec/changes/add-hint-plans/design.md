# Design: Plan-carrying hints

Decisions derived during the 2026-06-09 hint session; recorded so the
implementing session doesn't re-derive them.

## D1: Per-step narration is computed at plan time, by simulation

Each `HintStep` carries its own `explanation`/`highlights`, produced by walking
the plan: narrate step k against the simulated state after steps 0..k-1, then
apply step k's move and continue. Sixteen already has the narration logic as a
single block (landing cell, lowest out-of-place tile on the moved line, two-leg
preview); it just needs extracting into a `narrateStep(tiles, move, nextMove)`
helper called in the loop.

Alternative rejected: a separate `Game.narrate(state, move)` hook called by the
midend when advancing. It splits one concern across two calls, and the midend
would need to re-enter the game mid-advance; computing everything up front is
simpler and the cost (a handful of `executeMove` clones) is trivial.

## D2: `hintKeepTrack` verdicts replace boolean + in-place transition

The old contract conflated three outcomes: `true` meant either "still working
on it" or (via mutation of the hint) "first leg done, transitioned to second";
`false` meant both "completed" and "went off plan". With a stored plan the
midend needs to distinguish them:

- `"completed"` — the move finishes the current step (for Sixteen: the tile
  lands on the step's `targetPos`). The midend advances `index`. Note for
  Sixteen this is safe *exactly* because a line slide is determined by its
  displacement: any move that lands the tile on the step target produces the
  same permutation as the planned move, so the post-move state matches the
  plan's expectation and the remaining steps stay valid.
- `"onTrack"` — same line, target not yet reached (partial progress). The
  midend keeps the step. The game SHOULD adjust `step.move`'s delta in place to
  the remaining in-grid distance, so a later `executeHint` doesn't overshoot.
  (This mirrors the old code's sanctioned mutation of `h.move`.)
- `"off"` — anything else. The midend drops the plan; the next hint request
  recomputes. Dropping (not recomputing eagerly) keeps `processInput` cheap.

## D3: Advance timing differs between manual and executed steps

- `executeHint`: the executed step stays displayed through the slow-motion
  animation (the banner/highlights describe the move in flight — established
  behaviour) and the plan advances **when the animation settles**
  (`advanceHintOnAnimationEnd`, replacing `clearHintOnAnimationEnd`). During
  the auto-play rest period the *next* step is therefore previewed, which is
  the desired "here's what's next" effect.
- Manual completion: advance immediately in `processInput`. The next step
  shows during the manual move's animation — same behaviour the old in-place
  2D transition had, and acceptable for the same reason.
- Exhausted plan (last step completed, either path) ⇒ `activeHint = null`.
  Solved board at settle ⇒ cleared regardless.

## D4: Full-path reconstruction in both searches

- Forward A*: replace the `firstMove`/`secondMove` fields on `SearchNode` with
  `parent: SearchNode | null` + `move`. Nodes are already retained by the
  bucket queue, so parent chains add two references per node, no new
  allocation pattern. The myopic fallback (search failed but improved h)
  yields a *partial* plan — the path to `bestNode` — which is fine: the plan
  runs out and the next request recomputes from the better position.
- Bidirectional fallback: store `parent` keys on both sides (`FwdInfo` gains
  `parent`/`move`; `BwdInfo` already effectively stores the outgoing forward
  move, add `parent` toward the goal). On meet, walk back to the start
  (reverse) and forward to the goal, concatenate. Memory within existing caps.
- The first-two-moves plumbing (`planFirst`/`planSecond`) disappears; the
  narration loop consumes the path and the "then to row R" preview for step k
  reads the move of step k+1.

## D5: Hint button semantics with an active plan

`midend.hint()` while a valid plan is displayed is a refresh no-op (re-emit +
repaint), NOT a recompute and NOT an advance. Advancing is driven only by
moves (manual or executed). This is what makes "recalculate only when
invalidated" true for the manual flow as well.

## D6: What stays exactly as is

- Worker/Comlink surface, status-bar transport (one explanation string), the
  auto-play loop and its 1100ms pacing, slow-motion via `HINT_ANIM_SCALE`,
  the anti-undo root filter inside the A* search, search budgets, and the
  bidirectional fallback's caps/thresholds.
- `Game.redraw`'s hint parameter keeps the `{move, explanation, highlights}`
  shape — it just becomes the current `HintStep` instead of the whole
  `ActiveHint`, so Sixteen's renderer needs only a type-name change.

## Risks / watch-fors

- The plan-validity invariant rests on D2's "completed ⇒ state matches plan"
  argument. It holds for Sixteen's slides; a future game adopting hints must
  satisfy it or return `"off"` more aggressively. Capture this in the
  `hintKeepTrack` doc comment.
- `executeHint` must verify a stored plan still has a current step (compute a
  fresh one when exhausted/absent) — the invariant makes staleness impossible
  via tracked paths, but newGame/undo/etc. clear the plan, and tests should
  cover the recompute-after-invalidation path.
- Tests asserting the old `HintResult` single-move shape exist throughout
  `sixteen.test.ts`, `sixteen-midend.test.ts`, and the engine's
  `midend.test.ts` fake game; the playthrough property tests should switch to
  following whole plans (asserting every step's landing matches its
  highlights) and re-hinting only when the plan is exhausted.
