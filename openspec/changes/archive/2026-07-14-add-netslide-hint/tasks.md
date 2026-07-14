# Tasks — add-netslide-hint

> Read [`docs/porting/hint-authoring.md`](../../../docs/porting/hint-authoring.md)
> first, and update it with whatever this change teaches (the live-wiki rule).
> The exemplars to hold in view: **Palisade** (the deduction bar), **Inertia** (the
> non-deductive bar — lead with what you can prove, hold a stable subgoal), and
> **Sixteen** (the planner this change generalises).

## 1. Extract the shared slide planner (D3)

- [x] 1.1 `src/native/engine/slide-planner.ts`: lift Sixteen's planner —
      bucket-queue A* with lazy node allocation, the **no-progress gate**, the
      exact bidirectional search, the partial-plan return, and the toroidal slide
      primitives. It came out *smaller* than the design expected (D2′): the
      planner works on the board as the player sees it and is parameterised on
      `goal`, `moves`, `heuristic(board)`, `isGoal`, `rejectFirstMove` and when to
      run the exact search — no labels, no home assignment, no piece classes.
- [x] 1.2 Refactor `sixteen/index.ts` onto it. **Behaviour-preserving**: its 72
      existing tests and its render snapshot pass **unchanged** (no `-u`), and
      `__lastHintEngagedFallback()` still reports the gate engaging only at a
      strict local minimum.
- [x] 1.3 Tier-1 tests for the planner itself (`slide-planner.test.ts`, 13 tests)
      against a synthetic sliding puzzle: optimal plan one move from solved; a
      partial plan when the budget runs out; the no-progress gate engaging the
      exact search only at a strict local minimum; the exact search returning a
      **shortest** plan; and the convergence property itself — re-plan after every
      single move and the remaining move count falls by exactly one each time.
      Seed-deterministic, explicit timeouts, no elapsed-time assertions.
- [x] 1.4 **Decision checkpoint (D3 escape hatch).** The extraction was **kept**;
      the escape hatch was not needed. Recorded in `design.md` D3.

## 2. Netslide's target and where a tile belongs (D2′, D5′)

- [x] 2.1 **The original plan (a home assignment frozen up front) was implemented,
      measured, and abandoned** — it is the direct cause of two defects, and both
      are recorded in `design.md` D2. What shipped:
      `travelToFinish(state, target)` — the min-cost matching *of the board in
      front of it*, recomputed per node, allocation-free. A pure function of the
      board, so it means the same thing on every recompute.
- [x] 2.2 Tier-1 tests: a tile is only ever said to belong where the finished
      board wants its wires; the slide that finishes a board is narrated as
      arriving, not as setting up (the exact bug the frozen assignment caused).

## 3. `hint()` + `hintKeepTrack()` (D1, D4, D6)

- [x] 3.1 `hint(state, aux)`: refuses with `"Solution not known for this puzzle"`
      when there is no `aux` (D1); otherwise plans and emits a narrated multi-step
      plan. Goal test is "every tile powered", **not** equality with `aux`.
- [x] 3.2 Narration (D6): leads with the provable fact (a tile on the frozen
      centre row has a single degree of freedom; the centre tile never moves, so
      the network is built around it); narrates each move by its actual
      consequence — arriving where it belongs vs setting up — reusing
      `HINT_SETTING_UP`. One subgoal = one multi-leg journey via
      `continuesPrevious`. Names each tile by the shape the player can see (corner
      / straight / T-piece / loose end), since Netslide's tiles have no numbers.
- [x] 3.3 `hintKeepTrack`: the slide the step asked for is `"completed"`; anything
      else is `"off"`. There is no partial progress within a ±1 slide, so
      `"onTrack"` cannot arise.
- [x] 3.4 Tier-1 tests: a one-move-from-finished board yields a one-step plan whose
      move finishes it; a board with no `aux` refuses with the same sentence
      `solve` uses; every explanation is non-empty, names a consequence, and stays
      in the imperative (never a modal of necessity — the move is not forced).

## 4. Convergence (D5′) — the Inertia guard

- [x] 4.1 `netslideGame` added to
      [`engine/hint-resume.test.ts`](../../../src/native/engine/hint-resume.test.ts).
- [x] 4.2 A netslide-specific convergence test: recompute the hint from scratch
      after **every** move, on the largest preset, and assert no board is ever
      revisited and a finished board is reached. This is the test that catches the
      real failure — which was **not** the two-move ping-pong Inertia suffered but
      a five-slide cycle of one row (5 slides of a 5-wide row = the identity), a
      shape the don't-undo-the-last-move guard cannot see.

## 5. Render (D7)

- [x] 5.1 `render.ts`: hint colour appended past the C enum; the tile being placed
      is backed in it, the arrow to press is drawn in it, and its destination is
      outlined — solid when the tile genuinely belongs there, dashed when the plan
      is only passing through.
- [x] 5.2 The hint overlay rides **in the per-tile cache word**, so it is part of
      the diff key by construction. Guarded by a test that paints, requests a hint,
      and redraws the *same* draw state — the highlight must appear on the second
      paint.
- [x] 5.3 Tier-2.5 `renderScenario({ …, showHint: true })`: targeted assertions (a
      `COL_HINT` fill on the tile, exactly one `COL_HINT` arrow) plus
      `toMatchSnapshot`.

## 6. Close out

- [x] 6.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` (2530) →
      `vite build`); `openspec validate --strict` passes. Only this change's files
      were formatted (playbook §7).
- [x] 6.2 Dev-verified in the browser. 3×3: the hint marks the tile, lights the
      arrow to press, dashes the cell this slide lands it on and outlines its home
      solid; Auto-Hint finished the board in 6 moves. 5×5 wrapping: same, and
      Auto-Hint drove it to COMPLETED (25/25 powered, 56 moves). **0 console
      errors** throughout. One number for the owner: a 5×5 hint takes ~1.1 s
      end-to-end (3×3 and 4×4 are instant).
- [x] 6.3 Updated [`docs/porting/hint-authoring.md`](../../../docs/porting/hint-authoring.md):
      new §6.5 "Sliding-permutation games" (the shared planner + the two lessons
      that cost the most — a distance measure must be recomputed against the board
      it is measuring, and a recomputed plan converges only if the endgame plan is
      a *shortest* one), a Netslide row in the §5.3 colour-legend table, and a
      pointer from §6.4 to the "(setting up)" lie that reading a plan out loud
      caught when every test was green.
- [x] 6.4 Owner acceptance.

## 7. Owner-reported follow-up: *solve from any position* (no `aux`)

The owner hit `?id=3x3:52h9hbd4h4v34` — a **descriptive id**, which carries no
`aux` — and both Hint and Solve gave up with "Solution not known for this puzzle".
D1 had scoped that out; the owner rejected the scoping, rightly: a shared link or
a bookmark is an ordinary way to play a puzzle.

- [x] 7.1 `netslide/reconstruct.ts` — recover the finished grid from the board.
      The board pins it: same tile multiset, centre tile immovable, wires must
      meet and may not cross a barrier, network is a tree with no slack for a
      loop. Fill most-hemmed-in cell first (reading order is far worse on a
      wrapping board — the wrap constraints are not felt until the end). Under a
      millisecond typically. **Slide-invariant**, so it is the same grid for the
      whole game — the hint's stability comes free.
- [x] 7.2 **Reachability.** Not every valid finished grid can be slid into: a
      slide of a line of length `k` is a `k`-cycle, even exactly when `k` is odd,
      so on a 3x3 every move is even and only half the arrangements exist (its
      whole reachable set is 20 160 = 8!/2 — the alternating group). A repeated
      **movable** tile buys a parity flip for free; a duplicate matching only the
      centre tile buys nothing (the bug brute force caught). `isReachable` is
      asserted against the brute-forced reachable set, not against theory.
- [x] 7.3 `solve` uses it too — Solve now works on any board a player can be
      looking at.
- [x] 7.4 The exact search reworked, four bugs deep (all recorded in
      `hint-authoring.md` 6.5): it must return a genuinely shortest path; the
      budget must be enforced *inside* a level (a nominal cap was blown through to
      13.7 s); commuting moves must be pruned; and it must fire **only when the
      heuristic is helpless**, with a big budget — running it on every board costs
      its whole budget on every board it cannot reach, and took 5x5 hints from
      ~1 s to 4-5 s. A small search plus a bigger one in reserve is *worse than
      either*: the big one opens a descent, the small one cannot sustain it, and
      the heuristic walks the board round a loop.
- [x] 7.5 Verified: **0 failures** on all 54 preset x seed boards, with *and*
      without `aux`, followed the way the midend follows a hint. Worst single hint
      1.24 s (unchanged from the 1.1 s already accepted); 3x3/4x4 instant. The
      reported board hints, and Auto-Hint finishes it in 4 moves, 0 console
      errors.

## 8. Close out

- [ ] 8.1 `openspec archive add-netslide-hint --yes`, commit, push.

## Follow-up this change deliberately does NOT do

- **Lifting Fifteen/Sixteen's narration** to the same home-vs-helper standard
  (the `AGENTS.md` aspirational note). This change makes that cheap by putting the
  vocabulary and the planner in shared code, but doing it is its own change.
- **Reconstructing the target without `aux`** (D1), which would let a loaded save
  be hinted. That is a new solver and its own change.
