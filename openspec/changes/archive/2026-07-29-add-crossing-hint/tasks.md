# Tasks — add-crossing-hint

## 1. Read first

- [x] 1.1 [`docs/porting/hint-authoring.md`](../../docs/porting/hint-authoring.md)
      §2 (narration), §5 (rendering), §9 (candidate-elimination games), and the
      new §3 shared-plan-loop / §5.5a / §5.5b / §5.6a′ sections added by
      `add-boats-hint`.
- [x] 1.2 Read `engine/candidate-hint.ts` end to end — it already owns most of
      the mechanics this port needs, and knowing what it *doesn't* own (the
      `buildSteps` walk, the narration, the reason union) is what keeps the
      per-game code honest.
- [x] 1.3 Read `crossing/solver.ts` and `validateBoard`'s `done[]` — "which
      numbers are still unplaced" is the premise both techniques rest on.

## 2. Shared-code extractions (design D6, D7) — land these first

- [x] 2.1 Move `DeductionRecord` / `DeductionRecorder` out of `latin.ts` into the
      shared module, re-exporting from `latin.ts` so Latin games' imports are
      untouched. Type-only, no behaviour.
- [x] 2.2 Give `refreshCandidateHintStep` / `keepCandidateHintTrack` a per-game
      adapter instead of the hard-coded `type` discriminator (design D7 option
      (b)). **Do not rename Crossing's move discriminator** — the save format
      replays the move log, so that breaks existing saves.
- [x] 2.3 Re-run Towers / Unequal / Keen / Solo hint tests. They MUST pass
      **unedited**; a test that needs changing means the extraction changed
      behaviour — stop and re-evaluate.
- [x] 2.4 Follow-on, droppable: delegate **Group**'s hand-rolled
      `refreshHintStep` to the shared helper (its `pencilStrike` branch is
      byte-identical today). Same unedited-tests rule.
- [x] 2.5 Evaluate **Undead** for the same adapter (`{cell, monster}` marks over
      an index-addressed board). **Declined and recorded** (design "Open
      questions … resolved" #2 + guide §9): `MON_NONE = 7` is its empty
      sentinel, its marks are the monster *bit* over a 1-D border-ringed board,
      and its highlight shrink re-projects cell → x/y — fitting it needs a third
      adapter method that rebuilds the highlights, at which point the helper
      stops owning the logic. Group *did* migrate (task 2.4).

## 3. The recording deduction pass (design D1)

- [x] 3.1 `crossing/hint-solver.ts` — a new module beside the **untouched**
      `solveCrossing` (the `add-boats-hint` precedent: the C is gone, so a
      separate file makes "the solver didn't move" checkable from the file list).
- [x] 3.2 `CrossingFiring` / `CrossingTechnique` types: `onlyNumberFits`,
      `sharedDigit`, `noteStrike`, each carrying the run, the still-fitting
      numbers, and the position it acts on.
- [x] 3.3 `nextCrossingFiring`, re-deriving the *named* technique rather than
      reporting the candidate deaths `solverMarks` produces. Refined in
      implementation to **derivation-depth-first, then goal-first within a
      depth**: the three placement techniques run over the directly-checkable
      "fits the digits entered" reading before the fixpoint one, so a premise
      the player can check by eye is always preferred and a non-local one says
      so in its own words. A third technique (`crossRuns`) fell out of the
      lattice — see design.
- [x] 3.4 `deduceCrossingPlan` over `engine/hint-plan.ts` with a `stepBudget`.
- [x] 3.5 **Technique-coverage sweep before any prose polish**: 48 boards over
      all eight presets, 1597 firings, **0 stalls** — `onlyNumber` 86.6%,
      `sharedDigit` 7.3%, `crossRuns` 5.8%, deep tier 0.4%, `noteStrike` **0**.
      The deep tier is rare but load-bearing; the rule-out rung is unreachable on
      a generated board by construction and is kept for the exhausted-deduction
      case. Full reasoning in design.
- [x] 3.6 Tier-1 tests: **every square/note a plan forces agrees with the unique
      solution** (the load-bearing guard — the pass re-derives conditions rather
      than calling the solver), plus per-technique reachability.

## 4. Narration (hint-authoring §2)

- [x] 4.1 `narrate(firing)` — necessity voice, indication first, premise singles
      out the conclusion, conclusion matches the move's own type (a strike says
      "rule out", a placement says "must be").
- [x] 4.2 Degenerate extremes (§2.7): a run of length 2, a one-number-left
      endgame, a cell whose notes are empty.
- [x] 4.3 **Read the whole plan out loud on three boards before polishing** and
      fix what reads badly rather than what tests badly.

## 5. `hint()` / `hintKeepTrack()` / `refreshHintStep()` (design D3, D4, D5)

- [x] 5.1 `hint()` — one firing = one journey; a whole-run placement is one step,
      not one per cell.
- [x] 5.2 The three refusals, coupling to the existing `findCrossingMistakes`
      overlay (which already catches a wrong *note*, not just a wrong digit).
- [x] 5.3 `hintKeepTrack` — **judge the displayed leg, not the journey**
      (hint-authoring §5.5a); remember the midend passes the **pre-move** state.
- [x] 5.4 `refreshHintStep` via the shared helper (design D5).
- [x] 5.5 Enrol crossing in `src/native/engine/testing/hint-games.ts`.

## 6. Rendering (hint-authoring §5)

- [x] 6.1 `COL_HINT` / `COL_HINT_CELL` — check `augmentation.ts` for any
      index-keyed palette override before appending past the upstream enum.
- [x] 6.2 Echo all three move shapes (§5.1a): run placement, digit placement,
      note strike — the strike marks the **candidate glyph**, not the whole cell.
- [x] 6.3 **Highlight the still-fitting numbers in the panel** (design D2) — the
      evidence is half off-board, and a grid-only highlight makes the narration
      point at something invisible.
- [x] 6.4 Resolve D2's open question: **in the clue list, no fight** — the aid
      owns the clue's ink, the hint draws its patch behind it. **On the board,
      yes**: the collection's hint blue is indistinguishable from Crossing's
      "across" wash, fixed by taking green and suppressing the wash while a hint
      is up — and that suppression then made a click do nothing visible, so
      `uiUpdateClearsHint` **is** implemented after all (owner-reported; Subsets'
      hook, Subsets' exact reason), widened from a boolean to a per-step method
      so a click **inside** the hint keeps it up (owner-directed) and one
      outside puts it away. Its corollary shipped with it: the cursor cue falls
      back to dark corner marks wherever the hint owns the background.
- [x] 6.5 Fold the hint bits into the per-tile cache key **and** the panel's
      cache so the overlay paints and clears (playbook §3.2).
- [x] 6.6 Tier-2.5 render scenario + snapshot; assert the evidence names at least
      one listed number.

## 7. Close out

- [x] 7.1 Re-run `crossing-differential.test.ts` — `solveCrossing` untouched.
- [x] 7.2 Full gate green.
- [x] 7.3 `openspec validate add-crossing-hint --strict`.
- [x] 7.4 Dev-verified in Chrome, **0 console errors**: `onlyNumber` (both the
      `length` opener and the mid-solve `digits` premise) and `sharedDigit`
      frames, the panel patch alongside the aid's ink, the wash going away and
      coming back, Hint-applied then overlay-clears, auto-hint pacing to a solved
      board, and the mistake refusal with the offending square boxed red. The
      rule-out step and the "no further move" refusal are **not reachable in-app**
      on a generated board (task 3.5) — both are covered by tier-1 tests on a
      hand-authored ambiguous id.
- [x] 7.5 Update `docs/porting/hint-authoring.md` — the generalised candidate
      adapter, "evidence that lives off the board" (§5.2's panel case), and
      whatever the port taught that the guide didn't say.
- [x] 7.6 On owner acceptance: archive + commit hint and archive together.

## 8. Folded in at acceptance (owner-reported)

- [x] 8.1 **A displayed hint is dismissed by any UI change except one that moves
      the selection into the squares it marks**, and the cursor cue falls back to
      dark corner marks wherever the hint owns the background. See task 6.4 and
      design "Open questions … resolved" #1.
- [x] 8.2 **Clicking a clue placed it on the wrong axis.** With `4_1` written
      across and the crossing down run blank, clicking `421` wrote it *downwards*
      — both runs admit it, and the sticky fill direction got to decide.
      `runForNumber` now prefers the run the board already constrains and lets
      the direction settle only a genuine tie; `render.ts`'s clue-list colouring
      goes through that same function, so the colour a clue is written in can
      never name a different run from the one a click sends it to. **Not a
      regression from the hint** — it dates from the number-list aid — but it is
      ours, and it is the same class as the panel-layout rule the port already
      shares between render and input (playbook §3.13). Guarded by
      `crossing-hint.test.ts` "prefers the run the board already constrains".
