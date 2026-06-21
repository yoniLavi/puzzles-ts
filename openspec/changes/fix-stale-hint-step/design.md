# Design / investigation notes (carry-over from the 2026-06-21 session)

This is a handoff. The bug was investigated extensively but **not reproduced in
an automated test**; the live app reproduces it. Below is everything ruled out,
the leading hypotheses, and the fastest path to the root cause.

## The defect

A displayed Towers candidate-elimination hint step (`pencilStrike`) names a
mark `(x,y)=n` whose candidate `n` is **not in that cell's current pencil
notes** — so the render draws no struck digit there (the cell shows fewer
candidates than the hint claims to strike), and the narration tells the player
to remove something already removed. Screenshots: a clue-2 "height 5" strike on
a cell with no 5, and a clue-3 "height 4" strike on a cell with no 4.

## Confirmed NOT the cause (already ruled out this session)

- **The multi-clue "bleed" bug** — fixed this session (`solver.ts`: `solverEasy`
  lower-bound now returns per-clue on the recording path, so one recorded
  `group` = one clue). Owner confirmed the cross-column stray mark is gone. The
  remaining defect is *different* (a dead mark on the narrated clue's own line).
- **Fresh `hint()` on the exact reported state** — reconstructed the board and
  ran `towersGame.hint()`: the plan it produces contains **no** dead-mark
  strike. `nextClueStrike` filters every mark against `wPen` (the pencil), so a
  fresh plan cannot contain a strike for an absent candidate. Verified.
- **Pure stepper walk** — drove a real `Midend` through show→`executeHint(true)`
  →show… across the exact game and 75 random boards, both auto-pencil modes,
  settling and not settling the timer; **zero** dead-mark strikes shown. Towers
  has `animLength: () => 0`, so there is no show-during-animation race.
- **Stale-across-restart** — `restartGame()` calls `clearHint()`. Not it.

## Leading hypothesis: a KEPT plan goes stale across exact-follow

The plan is computed once and **kept** while the player follows it (owner wants
this). The midend re-displays the stored step on the next `hint()` **without
re-validating** it against the current state (`midend.hint()` show path: `if
(this.activeHint) { hintDisplayed = true; … return; }`). If anything makes a
*later* stored step's mark stale while the plan is kept, that step is shown
stale.

Why this is subtle: `buildSteps` filters every step's marks against the
build-time walk's `wPen`, and exact-follow replays the same moves, so the real
state should track the walk and marks should stay live. The bug means that
invariant is broken somewhere. Prime suspects:

1. **Auto-pencil side effects vs. the walk.** A placement step carries
   `autoElim` (auto-pencil). `emitPlacement` updates `wPen` with the dup-strike;
   `executeMove` does the same. If the **auto-pencil preference differs between
   plan-build time and move time** (the player toggled it — this session also
   shipped sticky-pencil/auto-pencil features the owner is testing), the real
   side effects diverge from the walk, and a later strike/dup step can target an
   already-removed candidate. **Check this first** — toggling auto-pencil
   mid-solve is the most likely trigger given what the owner was exercising.
2. **The recording solver seeds its cube from the GRID only, not pencil.** After
   a kept placement, the cube re-derives clue eliminations the player's pencil
   already reflects; these are filtered at *build* time but the kept plan isn't
   re-filtered at *display* time.
3. **`hintKeepTrack` `"onTrack"` shrink** leaving a mark that a sibling move
   already cleared, or a `"completed"` placement whose `autoElim` removed a
   *later* step's mark that `buildSteps` didn't attribute to that placement.

## Fastest path to the root cause (do this first next session)

Add a **dev-only invariant check** that fires in the live app the moment a
displayed `pencilStrike` step contains a mark absent from the current pencil —
logging the full state (grid + pencil), the stored plan, the plan index, the
auto-pencil pref, and the move history. Then reproduce in the browser on the id
above and read off the exact trigger. This converts an un-reproducible report
into a precise repro in one play-through. (Towers `render.ts` already has access
to both the displayed step and `state.pencil`; the check can live there behind
`import.meta.env.DEV`, or in the midend's hint display path.)

Then write the failing automated test from the captured state+moves, fix, and
make the test green.

## Fix options (pick after root cause)

- **A — validate-at-display (engine, general):** in `midend.hint()` show path
  and in `settleHint`'s preview, drop any mark whose candidate is no longer
  present (and if a step becomes empty, advance/recompute). Robust across all
  games; preserves exact-follow. Likely the cleanest.
- **B — refresh-on-keep (engine):** after `hintKeepTrack` keeps the plan,
  re-filter remaining steps against the new state.
- **C — game-level (Towers):** ensure `buildSteps`/`hintKeepTrack` keep later
  marks live; narrower but doesn't help other candidate-elimination games
  (Singles/Range/Filling/Unruly are the same shape and likely share the latent
  bug).

Prefer an engine-level guarantee (A) since the "displayed step is never stale"
property should hold for every hint-bearing game.

## Reverted this session (do not re-apply blindly)

"Drop the plan on every manual move" — reverted. It removed exact-follow
(owner wants it kept) and did not fix the defect. `hintKeepTrack` and
`continuesPrevious` remain in use.
