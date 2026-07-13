## 1. Plan

- [x] 1.1 `hint.ts`: build the plan in **legs**, each the shortest walk to a gem,
      carrying that gem as the leg's stable **subgoal** (design D2 — a per-step
      re-derivation makes the banner flip-flop, the bug Fifteen already fixed).
- [x] 1.2 **Plan for the nearest gem the ball can take without stranding itself**
      (`nextLeg`), *not* `solveRoute`'s tour — design D7. The tour is a heuristic:
      recomputed from an adjacent position it reaches for a different gem, and the
      hint ping-pongs the ball for ever. Caught by `hint-resume.test.ts` (3.3), which
      is why that task came first.
- [x] 1.3 Classify each move: **forced** (mines, or walls — say which), **collecting**
      (name the sweep and what stops the ball), **stranding** (the grab would lose the
      game — proved), or **positioning**.
- [x] 1.4 Narrate without overclaiming (design D3). The positioning premise ("no slide
      from here reaches it") is **checked**, not assumed — the design's "true by
      construction" was false. And "one more slide sweeps it up" is a promise about the
      *plan's own next move*, never about a slide merely existing.
- [x] 1.5 `hintKeepTrack` — *not* the default `"off"` the design called for (D5): without
      the hook the midend drops the plan on a move that **follows** the hint, and the
      replan can switch goals.
- [x] 1.6 Refuse honestly: solved; dead (say the move is undo); and — better than the
      route solver's shrug — a gem that can no longer be reached at all, which
      `unreachableGems` (new, `solver.ts`) *proves*.
- [x] 1.7 The hint sets no `cheated` and installs no route (design D1).

## 2. Render

- [x] 2.1 Ring the subgoal gem in `COL_HINT_GOAL` (violet, appended past the C enum).
      **In the tile cache key** (`HINT_GOAL` bit) — the ring is drawn on a *tile*, not on
      the ball sprite, so an overlay outside the diff key would never paint or erase.
- [x] 2.2 Draw the direction as an arrow on the ball in `COL_HINT` (the route arrow's
      shape and colour — both mean "the solver says go this way"). A swipe being aimed
      still wins: it is what the ball will actually do next.
- [x] 2.3 Swept-up gems get no mark of their own — the collecting narration counts them
      ("two gems and then the marked gem"), and a second ring would read as a second goal.

## 3. Tests

- [x] 3.1 Tier 1: every narration case fires on a hand-built board (including the
      stranding warning, on a board whose greedy grab is a trap); the subgoal is stable
      across a leg; the plan is legal and solves the board.
- [x] 3.2 Tier 1: the hint does not set `cheated`, installs no route, and is dropped when
      the player deviates — *kept*, with no recompute, when they follow it (a
      call-counting `Game` proves the difference).
- [x] 3.3 `hint-resume.test.ts`: Inertia joins the cross-game guard. **It failed**, and
      that failure is task 1.2.
- [x] 3.4 Tier 1: the overclaim guards — no step ever says the gem is out of reach when a
      slide would take it, and no step promises "one more slide" the plan doesn't then play.
- [x] 3.5 Tier 2.5: a render scenario asserting the ring + arrow, with a snapshot.

## 4. Docs + close-out

- [x] 4.0 Delete `hint-authoring.md` §6.1 ("when a game should ship no hint at all"),
      whose exemplar was Inertia and whose conclusion the owner overruled.
- [x] 4.1 `hint-authoring.md` §6.1–6.4: the non-deductive game that *does* have plenty to
      say; the stable subgoal + marking it when it has no name; **a heuristic plan must be
      recompute-stable** (the new cross-game lesson); read one plan out loud. Inertia added
      to the §7.1 roll of games that shipped this bug class.
- [x] 4.2 Dev-verified in the browser: the hint shows ring + arrow + narration and moves
      nothing; auto-hint plays a board to **COMPLETED!** (not "Auto-solved."); the
      stranding warning renders; disobeying it strands the ball exactly as warned and the
      hint then refuses honestly; the dead-ball refusal names undo. 0 console errors.
- [x] 4.3 Full gate green (2430 tests).
- [ ] 4.4 **Owner acceptance** → archive.
