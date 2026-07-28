# Tasks — add-crossing-hint

## 1. Read first

- [ ] 1.1 [`docs/porting/hint-authoring.md`](../../docs/porting/hint-authoring.md)
      §2 (narration), §5 (rendering), §9 (candidate-elimination games), and the
      new §3 shared-plan-loop / §5.5a / §5.5b / §5.6a′ sections added by
      `add-boats-hint`.
- [ ] 1.2 Read `engine/candidate-hint.ts` end to end — it already owns most of
      the mechanics this port needs, and knowing what it *doesn't* own (the
      `buildSteps` walk, the narration, the reason union) is what keeps the
      per-game code honest.
- [ ] 1.3 Read `crossing/solver.ts` and `validateBoard`'s `done[]` — "which
      numbers are still unplaced" is the premise both techniques rest on.

## 2. Shared-code extractions (design D6, D7) — land these first

- [ ] 2.1 Move `DeductionRecord` / `DeductionRecorder` out of `latin.ts` into the
      shared module, re-exporting from `latin.ts` so Latin games' imports are
      untouched. Type-only, no behaviour.
- [ ] 2.2 Give `refreshCandidateHintStep` / `keepCandidateHintTrack` a per-game
      adapter instead of the hard-coded `type` discriminator (design D7 option
      (b)). **Do not rename Crossing's move discriminator** — the save format
      replays the move log, so that breaks existing saves.
- [ ] 2.3 Re-run Towers / Unequal / Keen / Solo hint tests. They MUST pass
      **unedited**; a test that needs changing means the extraction changed
      behaviour — stop and re-evaluate.
- [ ] 2.4 Follow-on, droppable: delegate **Group**'s hand-rolled
      `refreshHintStep` to the shared helper (its `pencilStrike` branch is
      byte-identical today). Same unedited-tests rule.
- [ ] 2.5 Evaluate **Undead** for the same adapter (`{cell, monster}` marks over
      an index-addressed board). **Record the no-go with its reason** if the
      adapter has to contort — a partial extraction is a fine outcome.

## 3. The recording deduction pass (design D1)

- [ ] 3.1 `crossing/hint-solver.ts` — a new module beside the **untouched**
      `solveCrossing` (the `add-boats-hint` precedent: the C is gone, so a
      separate file makes "the solver didn't move" checkable from the file list).
- [ ] 3.2 `CrossingFiring` / `CrossingTechnique` types: `onlyNumberFits`,
      `sharedDigit`, `noteStrike`, each carrying the run, the still-fitting
      numbers, and the position it acts on.
- [ ] 3.3 `nextCrossingFiring` in **goal-first** order (whole run → one cell →
      rule-out), re-deriving the *named* technique rather than reporting the
      candidate deaths `solverMarks` produces.
- [ ] 3.4 `deduceCrossingPlan` over `engine/hint-plan.ts` with a `stepBudget`.
- [ ] 3.5 **Technique-coverage sweep before any prose polish**: plan N generated
      boards across the presets and count each technique. `add-boats-hint` found
      a technique that never fired at all; find that out now, not after writing
      its narration.
- [ ] 3.6 Tier-1 tests: **every square/note a plan forces agrees with the unique
      solution** (the load-bearing guard — the pass re-derives conditions rather
      than calling the solver), plus per-technique reachability.

## 4. Narration (hint-authoring §2)

- [ ] 4.1 `narrate(firing)` — necessity voice, indication first, premise singles
      out the conclusion, conclusion matches the move's own type (a strike says
      "rule out", a placement says "must be").
- [ ] 4.2 Degenerate extremes (§2.7): a run of length 2, a one-number-left
      endgame, a cell whose notes are empty.
- [ ] 4.3 **Read the whole plan out loud on three boards before polishing** and
      fix what reads badly rather than what tests badly.

## 5. `hint()` / `hintKeepTrack()` / `refreshHintStep()` (design D3, D4, D5)

- [ ] 5.1 `hint()` — one firing = one journey; a whole-run placement is one step,
      not one per cell.
- [ ] 5.2 The three refusals, coupling to the existing `findCrossingMistakes`
      overlay (which already catches a wrong *note*, not just a wrong digit).
- [ ] 5.3 `hintKeepTrack` — **judge the displayed leg, not the journey**
      (hint-authoring §5.5a); remember the midend passes the **pre-move** state.
- [ ] 5.4 `refreshHintStep` via the shared helper (design D5).
- [ ] 5.5 Enrol crossing in `src/native/engine/testing/hint-games.ts`.

## 6. Rendering (hint-authoring §5)

- [ ] 6.1 `COL_HINT` / `COL_HINT_CELL` — check `augmentation.ts` for any
      index-keyed palette override before appending past the upstream enum.
- [ ] 6.2 Echo all three move shapes (§5.1a): run placement, digit placement,
      note strike — the strike marks the **candidate glyph**, not the whole cell.
- [ ] 6.3 **Highlight the still-fitting numbers in the panel** (design D2) — the
      evidence is half off-board, and a grid-only highlight makes the narration
      point at something invisible.
- [ ] 6.4 Resolve D2's open question: does the panel highlight fight the existing
      click-a-clue aid? Fall back to `uiUpdateClearsHint` (Subsets' precedent) if
      so.
- [ ] 6.5 Fold the hint bits into the per-tile cache key **and** the panel's
      cache so the overlay paints and clears (playbook §3.2).
- [ ] 6.6 Tier-2.5 render scenario + snapshot; assert the evidence names at least
      one listed number.

## 7. Close out

- [ ] 7.1 Re-run `crossing-differential.test.ts` — `solveCrossing` untouched.
- [ ] 7.2 Full gate green.
- [ ] 7.3 `openspec validate add-crossing-hint --strict`.
- [ ] 7.4 Dev-verify in the browser: a hint of each technique, following one
      advances the plan, auto-hint paces, each refusal, the overlay clears on the
      next move, and the panel highlight behaves alongside the aid. 0 console
      errors.
- [ ] 7.5 Update `docs/porting/hint-authoring.md` — the generalised candidate
      adapter, "evidence that lives off the board" (§5.2's panel case), and
      whatever the port taught that the guide didn't say.
- [ ] 7.6 On owner acceptance: archive + commit hint and archive together.
