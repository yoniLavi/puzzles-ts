## 1. Plan

- [ ] 1.1 `hint.ts`: build the plan from `solveRoute` (no new solver). Split the
      route into **legs** — each the run of moves ending in the first move that
      collects a gem — and carry each leg's **subgoal gem** across its steps
      (design D2: a per-step re-derivation makes the banner flip-flop, which is
      the bug Fifteen already reported and fixed).
- [ ] 1.2 Classify each move: **forced** (every other legal direction is fatal),
      **collecting** (sweeps ≥1 gem), or **positioning** (collects nothing).
- [ ] 1.3 Narrate each case without overclaiming (design D3). In particular the
      positioning case says only what is true by construction — the ball cannot
      reach the marked gem from here, and this move puts it somewhere it can —
      and never "the only way".
- [ ] 1.4 `hintKeepTrack: "off"`; refuse honestly when solved, unsolvable, or dead
      (and when dead, say that the move is to undo).
- [ ] 1.5 The hint must **not** set `cheated` and must **not** install a route
      (design D1). Assert it: a test that hints and then checks the status bar
      still does not say "Auto-solver used."

## 2. Render

- [ ] 2.1 Ring the subgoal gem in a new colour (the narration says "the marked
      gem" — Inertia's gems have no name to call them by). Pair colour with a
      non-colour cue per hint-authoring §5.3. Do not reuse `COL_AIM`.
- [ ] 2.2 Draw the direction arrow on the ball in `COL_HINT` (the route arrow's
      existing shape and colour).
- [ ] 2.3 Decide by looking at it whether the swept gems and/or the travelled path
      want their own treatment (design's open questions).

## 3. Tests

- [ ] 3.1 Tier 1: the three narration cases fire on hand-built boards; the subgoal
      is stable across a leg; the plan's moves are legal and finish the board.
- [ ] 3.2 Tier 1: hint does not set `cheated`, does not install a route, and is
      cleared on undo/restart (the ephemeral-hint contract).
- [ ] 3.3 `hint-resume.test.ts`: Inertia joins the cross-game guard — a hint must
      resume from any mid-game position (hint-authoring §7.1).
- [ ] 3.4 Tier 2.5: a render scenario showing the arrow + the marked subgoal gem.

## 4. Docs + close-out

- [x] 4.0 Delete `hint-authoring.md` §6.1 ("when a game should ship no hint at
      all"), whose exemplar was Inertia and whose conclusion the owner overruled.
- [ ] 4.1 Generalise the **stable-subgoal narration** pattern in
      `hint-authoring.md` §6 once implemented — it is the shape the owner wants for
      the Fifteen/Sixteen *why* upgrade too, and Inertia is its second implementer.
- [ ] 4.2 Dev-verify in a real browser (auto-hint walks a board to solved; the
      banner never flip-flops its subgoal; a dead ball refuses honestly).
- [ ] 4.3 Full gate green.
- [ ] 4.4 **Owner acceptance** → archive.
