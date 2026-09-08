# fix-sixteen-hint-recompute-stability — tasks

## 0. What was established before implementation — and what of it was wrong

- [x] 0.1 **Repro**: `sixteen-5×5-hr-a` (the seed `hint-resume.test.ts` builds
      from `${name}-${title}-${seed}`), 5×5 preset. Deterministic, reproduced in
      two independent slow-tier runs. **Confirmed.**
- [x] 0.2 ~~**Not a state cycle**: no board repeats in 900 moves.~~ **Wrong.**
      The boards repeat, with period 4 (`board repeat: move 163 == 159`, and so
      on every fourth move from move 155 to the 800-move cap). It is an ordinary
      state cycle and always was; whatever the original probe measured, it was
      not board identity. Recorded because the claim sent the diagnosis looking
      for something more exotic than what was there.
- [x] 0.3 **A potential cycle**: tiles-out-of-place locks into period 4 —
      `7 4 6 6` repeating — after descending normally from 24 to 4. **Confirmed**,
      and the same period as the board cycle, which is the tell.
- [x] 0.4 **Not the `outOfPlace <= 8` fallback threshold**: **confirmed, but not
      for the reason given.** The reasoning was "the trace reaches 4, so the
      fallback arms" — which does not follow, since the fallback also needed the
      forward search to be at a strict local minimum. It does arm, and the trace
      shows it: the two moves at `oop=4` cost 2.5–5 s and return an 8-move plan,
      against 0.2–0.7 s for the other two moves of the cycle.
- [x] 0.5 **Smaller presets are fine**: 3×3 in 7 moves, 4×3 in 11, 4×4 in 21,
      5×4 in 33. **Confirmed.**

## 1. Fix the instability, not the symptom

- [x] 1.1 Read `docs/games/hints.md` § "Recompute-stable plans". The lesson held:
      the fix is a monotone potential, not plan-caching and not a bigger budget.
- [x] 1.2 **The potential is the true distance to the goal, and the fix is to
      stop gating the search that measures it.** Sixteen ran its exact
      bidirectional search only at a strict local minimum on a board with at most
      eight tiles out of place. Removing the gate — `exactSearch` on every board,
      one budget — makes each fresh plan exactly one move shorter than the last.

      **A gate on any cheap board measure cannot work, and that is measured
      rather than argued.** Three were tried on the failing walk:
      `outOfPlace <= 8` (cycles), `outOfPlace <= 12` (cycles),
      total-travel `<= 20` (cycles). The reason is that a shortest plan climbs on
      its way home: on seed `hr-b` at 5×5 a plan starting at 9 tiles out of place
      and 9 total travel peaks at **17** and **30** before arriving. Ungated, the
      same seed solves in 36 moves with plan lengths 8, 7, 6, 5, 4, 3, 2, 1.
- [x] 1.3 **Netslide measured, not assumed.** Walked all nine presets × two seeds
      with a recompute after every move: no board repeats, every walk solves. So
      the symptom is absent — but the *signature* was there, plan lengths falling
      19, 18, 17, 16, 15, 14 and then rising to 16 as the heuristic took back
      over. It shared the gate, so it shares the fix. Converted and re-measured:
      every walk still solves, several are **shorter** (4×4 medium 20 → 12 moves,
      5×5 easy 28 → 22), worst single hint 0.88 s → 1.27 s.

      With both consumers wanting the same thing, `when` is not a decision a game
      legitimately makes differently, so it is deleted rather than re-defaulted
      (`AGENTS.md` § "Convention over configuration"). `SlidePlan.usedExactSearch`
      goes with it: it existed only so tests could assert the gate still gated.
- [x] 1.4 **The enabling work: the exact search had to get cheap enough to always
      run.** Gated, it cost 2.5–5 s on the boards that reached it; ungated at the
      same speed it cost 4–6 s on *every* hint, which is not shippable. Rewrote
      `bidirectionalPlan`'s storage: boards packed into 31-bit words in a flat
      pool, an open-addressed index, no per-node object or array. Same algorithm,
      same answers — **4.5–7× faster** (a crossing of Sixteen's endgame 2.5 s →
      0.45 s; a failed search 5 s → ~1 s). Sixteen 5×5 now hints in ~0.7 s mean,
      1.5 s worst.
- [x] 1.5 **Verified as a rewrite should be: differentially.** Compared the new
      search against the old implementation over 426 boards — both move-set
      shapes (Sixteen's any-delta, Netslide's unit-step), scrambles of 1–9 moves,
      three cap regimes including budget exhaustion — asserting the returned path
      is equal move for move. **275 identical paths, 151 both-refuse, 0
      mismatches.**

      The differential was itself checked before being trusted: planting the
      mid-level-answer bug the code's own comment warns about made it report 2
      mismatches. Three further plants aimed at the rewrite's new code — packing
      overflow, a backward edge not inverted, a frontier range running into the
      level it is appending — are each caught by the *existing* planner suite (3,
      3 and 1 failures). Which is why no new planner test is added: a BFS-shortest
      guard was written, measured against all four plants, caught none of them
      that the suite did not already catch, and cost 13.7 s.
- [x] 1.6 Sixteen-local guard at the failing shape: "recomputing after every move
      still lands on the same board, one move nearer" walks the two-swapped-pairs
      endgame and asserts each fresh plan is exactly one shorter than the last.

## 2. Close the slice's blind spot

- [x] 2.1 `walkedPresets` keyed on `tierOf(params) ?? "untiered"`, collapsing
      every preset of an untiered game to one key. Now: one preset per declared
      tier where there is a contract, **first and last** where there is not.
      `tierOf` returns `number`, never `undefined`, so the two cases are exact and
      there is no third.
- [x] 2.2 Landed with the fix, and **proved to catch it**: restoring the gate
      alone makes the gate slice fail with the proposal's own error,
      `sixteen-5×5-hr-a: did not converge within 800 moves (loop?)`.
- [x] 2.3 **Cost, measured.** 12 of the 30 hinting games are untiered; eleven gain
      a walk (Fifteen offers a single preset). Gate slice **65 → 76 walks**, and
      **35 s → 69 s** — but timed at load 4.7 on a shared box, so read it as an
      upper bound. The eleven added walks are each a game's *largest* board, which
      is why eleven walks in six cost about as much as the first 65.

## 3. Generalizing the guard

- [x] 3.1 **Not generalized, and the reason is that it is already derived.** The
      property that failed is subgoal stability under recompute, and
      `hint-resume.test.ts` walks it for every hinting game — the walk *is* the
      one-step-forward drive that `docs/framework-rdd/guarantees.md`'s planner row
      asks for, applied repeatedly. What was missing was never the property; it
      was the preset slice, which task 2 fixed. A separate "assert the subgoal is
      unchanged" guard would need every game to expose a subgoal, which is the
      manifest shape `AGENTS.md` refuses.
- [x] 3.2 Kept out of this change accordingly.

## 4. Close

- [ ] 4.1 `npm run gate`, plus `npm run test:slow` on `hint-resume.test.ts`.
- [ ] 4.2 Run the app: deal Sixteen 5×5 and follow the hint to a solved board.
- [ ] 4.3 Owner acceptance.

## Findings — a second defect, filed rather than fixed

**Sixteen 5×5 can strand the player at four tiles from finished, in about 19% of
games, and this change does not fix it.** It is pre-existing, it is not the
cycle, and it needs a different fix.

- **What it is.** Walking 16 seeds of 5×5 one recomputed hint at a time, 13 solve
  and **3 stop** — always at `outOfPlace = 4`, always the two-swapped-pairs
  shape, with the hint saying "No move here would get you closer." on a board
  that is perfectly solvable.
- **Why the exact search does not cross it.** Such a board is **exactly 9 moves**
  from finished (measured, not estimated). The search's practical reach at 5×5 is
  **8**: scrambles of 4–8 moves are solved every time in under 0.5 s, and 9 is
  where it stops. Crossing 9 needs between 18 M and 24 M states — about 10 s and
  the better part of a gigabyte — against 2.5 M and 0.5 s for 8. So it is not a
  budget away: brute force is out for a browser worker, and raising the budget
  would also make every *failed* search cost that much, on every hint.
- **The old code stranded identically** — same board, same refusal — it simply
  cycled before it ever got there.
- **What a fix would need**: structure rather than search. Two candidates, both
  their own project: a small pattern database (a 4-tile PDB over 5×5 is ~300 k
  entries and gives the forward search a real admissible heuristic), or a
  constructive endgame that places tiles by commutator, which would also be
  narratable and monotone by construction.

Filed as `fix-sixteen-endgame-stranding`.

## Findings — declined, with the reason

**Pruning same-line repeats in the exact search.** Two consecutive slides of the
same line compose into one, so a shortest path never contains a pair — tightening
the canonical ordering from non-decreasing to strictly increasing index would cut
the search by roughly a third. **Declined**: it is sound only when the move set is
closed under composition within a line, which is true of Sixteen (deltas 1…w−1)
and false of Netslide (deltas ±1 only, so two `+1` slides of one row are a
legitimate part of a shortest path and `+2` is not a legal move). The planner
suite already pins this — "may slide the same line several times running" — and
the saving is not worth a derived capability flag now that the rewrite has taken
the cost down by more.
