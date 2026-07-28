# Tasks — add-boats-hint

## 1. Read first

- [ ] 1.1 [`docs/porting/hint-authoring.md`](../../docs/porting/hint-authoring.md)
      end to end, then the two exemplars this change follows:
      **§5.6a′ Bricks** (a contradiction solver reads its reason off the
      validator's own rejection — Boats' Hard tier verbatim) and
      **Spokes** (`deduceSpokesPlan` — the hint as a second projection of the
      solver, `§5.1a` two move shapes, `§2.10` goal-first firing order).
- [ ] 1.2 Confirm the premise correction in `proposal.md`: **Crossing ships no
      `hint()`** (no hint code, no spec requirement, absent from
      `testing/hint-games.ts`). The reusable shape is in
      spokes/bricks/clusters/subsets, and Crossing's *inventory aid* is design D8's
      separate change. Do not spend time looking for Crossing hint code.
- [ ] 1.3 Re-read the `boats` spec's non-monotone-solver requirement and
      `solveAtAnyTier` — the hint must replay at the board's own tier (design D2),
      not at the maximum.

## 2. The shared plan loop (design D7)

- [ ] 2.1 `src/native/engine/hint-plan.ts` — `deduceHintPlan({ clone, status,
      next, apply, planCap?, budget? })` → `{ verdict, plan }`. Takes **both** a
      plan cap and an optional `stepBudget` so no existing consumer is silently
      retuned.
- [ ] 2.2 Refactor `spokes/solver.ts` `deduceSpokesPlan` onto it. Its existing
      `spokes-hint.test.ts` MUST pass **unedited** — a test that needs changing
      means the extraction changed behaviour; stop and re-evaluate.
- [ ] 2.3 Same for `bricks/solver.ts` `deduceBricksPlan`, `clusters/solver.ts`
      `deduceHintPlan`, `subsets/solver.ts` `deduceHintPlan`. A game that doesn't
      fit cleanly is **left alone** and recorded as a no-go with its reason — a
      partial extraction is a fine outcome (playbook: record declined candidates).
- [ ] 2.4 Unit-test the helper directly (`hint-plan.test.ts`): stops on a
      non-incomplete status, stops when `next` returns null, honours the cap,
      honours the budget, never mutates its argument.

## 3. The recording deduction pass (design D1, D3, D4)

- [ ] 3.1 `BoatsFiring` / `BoatsTechnique` / `BoatsEvidence` types in `solver.ts`
      (discriminated union, one member per technique in the D3 table).
- [ ] 3.2 `nextBoatsFiring(board, …)` — the single next firing, in **goal-first**
      order (placements before rule-outs, cheaper tier before dearer), returning
      the forced squares plus the evidence. `solveBoats` **untouched**.
- [ ] 3.3 The Easy rung's firings: `lineSatisfied`, `lineForced`, `allWaterPlaced`,
      `centreForced`, `isolated`, `mustExtend`.
- [ ] 3.4 The Normal rung's: `centreCount`, `growTooLong`, `mustGrow`,
      `runTooShort`, `onlyRunsLeft` (simple form).
- [ ] 3.5 The Tricky rung's: `sharedDiagonal`, `borderNumber`, `onlyRunsLeft`
      (full form).
- [ ] 3.6 The Hard rung's `refuted` — re-run the **rejected** trial with the
      validation family's `errs` arrays and classify by the fixed priority
      (collision → line count → fleet → given clue), per design D4. No separate
      recorder.
- [ ] 3.7 `deduceBoatsPlan(board)` over the shared loop from §2, replaying at the
      **lowest cap that solves the board** (design D2). Guard with a `stepBudget`.
- [ ] 3.8 Tier-1 tests: one board per technique reaches that firing with the
      expected squares and evidence; the plan is recompute-stable from a
      mid-game position.

## 4. Narration (design D3; hint-authoring §2)

- [ ] 4.1 `narrate(firing)` in `index.ts` — necessity voice for a deduction
      (§2.1), lead with the indication (§2.2), name a square by what it shows
      (§2.3), premise singles out the conclusion (§2.4), conclude with the action
      the move actually makes (§2.6), ≤120 chars.
- [ ] 4.2 Sanity-read each count narration at its degenerate extremes (§2.7) — a
      0-clue line, a full line, a 1-boat fleet.
- [ ] 4.3 **Read the whole plan out loud on three boards before polishing**
      (§6.4) — one per tier — and fix what reads badly rather than what tests
      badly.

## 5. `hint()` / `hintKeepTrack()` (design D5, D6)

- [ ] 5.1 `hint()` builds the `HintResult`: one journey per firing, multi-square
      firings emitted as `continuesPrevious` legs (design D6).
- [ ] 5.2 The three refusals (design D5), with the `findMistakes` banner on the
      mistake path — including the wrong-but-rule-legal placement the re-solve
      catches.
- [ ] 5.3 `hintKeepTrack` — classify a player move against the displayed step
      (`completed` only when the resulting state matches what the plan expects).
- [ ] 5.4 Enrol boats in `src/native/engine/testing/hint-games.ts` (brings the
      cross-game hint-overlay / hint-resume / hint-quality guards).

## 6. Rendering (hint-authoring §5)

- [ ] 6.1 `COL_HINT` + `COL_HINT_CELL` appended past the upstream enum — safe only
      after checking `augmentation.ts` (boats declares
      `paletteOverrides: { 4: 0.6 }`, so appending past index 14 is fine).
- [ ] 6.2 **Echo each move shape** (§5.1a): a forced *ship* draws a ship-shaped
      hint mark, forced *water* a water-shaped one — a single colour on two
      different actions reads as one action.
- [ ] 6.3 Evidence as an *area* (§5.2): shade the line / the run / the clue,
      don't ring a single cell. The diagonal waters that follow a ship placement
      are shaded, not narrated (open question 1).
- [ ] 6.4 Fold both into the per-tile cache key via the existing
      `OverlaySidecar` (playbook §3.2) so the overlay paints and clears.
- [ ] 6.5 Tier-2.5 render scenario per tier + snapshot; assert the forced squares
      carry `COL_HINT` and the evidence `COL_HINT_CELL`.

## 7. Close out

- [ ] 7.1 Re-run `boats-differential.test.ts` — 34/34 must still be green
      (`solveBoats` untouched; the C is gone, so this frozen fixture is the only
      guard left).
- [ ] 7.2 Full gate green (`tsc -b --noEmit` → biome → `vitest run` → `vite build`).
- [ ] 7.3 `openspec validate add-boats-hint --strict`.
- [ ] 7.4 Dev-verify in the browser: a hint per tier, following a hint advances
      the plan, auto-hint paces, each refusal, the overlay clears on the next
      move. 0 console errors.
- [ ] 7.5 Update `docs/porting/hint-authoring.md` — the shared plan loop (§3),
      Boats as a second `§5.6a′` (contradiction-reason-from-validator) exemplar,
      and whatever the port taught that the guide didn't say.
- [ ] 7.6 On owner acceptance: archive + commit hint and archive together.

## 8. Follow-up, not this change

- [ ] 8.1 Scaffold `add-boats-fleet-aid` (design D8) — the Crossing-style
      inventory aid over the fleet display. Timing is open question 2.
