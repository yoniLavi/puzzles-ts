# fix-sixteen-hint-recompute-stability — tasks

## 0. What is already established — do not re-derive it

- [x] 0.1 **Repro**: `sixteen-5×5-hr-a` (the seed `hint-resume.test.ts` builds
      from `${name}-${title}-${seed}`), 5×5 preset. Deterministic, reproduced in
      two independent slow-tier runs.
- [x] 0.2 **Not a state cycle**: no board repeats in 900 moves.
- [x] 0.3 **A potential cycle**: tiles-out-of-place locks into period 4 —
      `7 4 6 6` repeating — after descending normally from 24 to 4.
- [x] 0.4 **Not the `outOfPlace <= 8` fallback threshold**: the trace reaches 4,
      so the exact bidirectional search arms and participates in the oscillation.
- [x] 0.5 **Smaller presets are fine**: 3×3 in 7 moves, 4×3 in 11, 4×4 in 21,
      5×4 in 33. The discontinuity at 5×5 is sharp, not a scaling curve.

## 1. Fix the instability, not the symptom

- [ ] 1.1 Read `docs/games/hints.md` § "Recompute-stable plans" first. Inertia
      paid for this lesson: the fix is a **monotone potential** — pursue the
      nearest goal you can safely take — and **never** plan-caching, which hides
      the oscillation rather than removing it.
- [ ] 1.2 Give Sixteen a subgoal that survives recomputation. A plan computed one
      move after another must be going to the same place. Resist a bigger budget
      or a deeper search: both move the oscillation, because nothing in today's
      design makes two successive plans agree about the destination.
- [ ] 1.3 **Check Netslide before touching `slide-planner.ts`.** It is the other
      consumer. Its presets walk green today, which shows the symptom absent, not
      the property present — so measure it the same way (trace its potential
      across a recomputed walk) rather than assuming, and do not fix one game by
      destabilizing the other.
- [ ] 1.4 Re-run the trace: the potential must descend to zero without a period.
      Assert it in a Sixteen-local test at the failing seed, so the specific
      board is pinned even if the cross-game walk is later sampled.

## 2. Close the slice's blind spot — with the fix, not before

- [ ] 2.1 `walkedPresets` in `hint-resume.test.ts` collapses every preset of an
      **untiered** game to one key, so the gate slice walks only the first —
      reinstating exactly the blindness the widening removed. Cover the axis the
      game varies: tier where there is one, first **and last** preset where there
      is not (presets are conventionally smallest-first).
- [ ] 2.2 **This cannot land before task 1.** Widening the slice makes the gate
      red on this very defect; ordering it after the fix is what keeps the gate
      meaningful rather than expected-to-fail.
- [ ] 2.3 State the new gate-slice cost. It adds one walk per untiered game, and
      for Sixteen that walk is its most expensive board — measure rather than
      assume, on an **idle** machine (`AGENTS.md` § "Test discipline").

## 3. Consider generalizing the guard

- [ ] 3.1 `hint-resume.test.ts` proves *a* plan finishes; the property that
      actually failed here is **subgoal stability under recompute**, which
      `docs/framework-rdd/guarantees.md`'s planner row asks for directly: drive
      every planner one step forward and assert the subgoal is unchanged. Decide
      whether that generalizes across the planner games or stays Sixteen's.
- [ ] 3.2 If it generalizes, it is its own change — do not grow this one into a
      framework change while a shipped game's hint is broken.

## 4. Close

- [ ] 4.1 `npm run gate`, plus `npm run test:slow` on `hint-resume.test.ts`
      (776 s idle) to confirm the walk that found it now passes.
- [ ] 4.2 Run the app: deal Sixteen 5×5 and follow the hint to a solved board.
      A player following hints is exactly the path that was broken.
- [ ] 4.3 Owner acceptance — this changes which moves a hint suggests on a board
      size that ships.

## Findings

_(0.1–0.5 above are the findings; the rest follow the fix.)_
