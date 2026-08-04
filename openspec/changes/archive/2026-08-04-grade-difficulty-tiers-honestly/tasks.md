# Tasks — grade-difficulty-tiers-honestly

## 1. Survey

- [x] 1.1 For every game with two or more difficulty tiers, determine whether the
      generator rejects a board solvable one tier below. Confirmed all 23 honest
      games by **reading the acceptance gate**, not by the grep that shortlisted
      them — two distinct honest idioms exist and a grep finds only one.
- [x] 1.2 Settle Ascent and Salad, which showed no lower-tier check. **Both are
      defective**, and Salad is the worst in the collection (12 of 13 Extreme
      fixtures, 71 of 80 fresh boards, are Normal boards).
- [x] 1.3 Record the result as a table in `design.md` (D1).
- [x] 1.4 *(added)* Correct the enumeration: the `DIFF_*` grep missed **Bridges**,
      which grades honestly. 27 tiered games, not 26. Recorded in D1, including
      that `add-game-difficulty-contract` inherits the blind spot.

## 2. Bricks

- [x] 2.1 Gate on "solves at `diff`, and does **not** solve at `diff - 1`".
- [x] 2.2 Keep upstream's original gate reachable for the differential only
      (`upstreamLooseGate`); fixtures still byte-match.
- [x] 2.3 Measure generation cost at every preset — tail, not median. Normal is
      **bit-identical** to before (for Normal, `diff - 1` already was Easy).
- [x] 2.4 Property test: a board generated at tier N is not solvable at N-1.
- [x] 2.5 Delete the "preserved upstream quirk" note in `solver.ts`; replaced with
      the divergence, the measurement that retired the quirk, and why the
      `DIFF_TRICKY` rung survives in the solver.
- [x] 2.6 *(added)* **Tricky is empty at every size measured** — 999/999 generated
      boards, 4/4 fixtures, and 0 of 77 boards sampled where Normal fails. It is
      refused at generation and its two presets removed (owner-delegated
      decision; `design.md` D4).

## 3. Mathrax

- [x] 3.1 Gate on the tier below; wrap the (previously single-shot) generator in a
      bounded retry loop.
- [x] 3.2 `upstreamLooseGate` keeps the byte-match, and returns on the first pass
      so the RNG draw order is unchanged. Extends the existing part-byte-match /
      part-verdict-agreement split rather than inventing a third shape.
- [x] 3.3 Cost measured: 3–27 ms median, 125 ms worst at order 7.
- [x] 3.4 Property test over six size/tier combinations.
- [x] 3.5 **Order 3 Normal and Recursive are empty** (0 in 3,000 candidates each);
      refused in `validateParams`, generation only.

## 4. Anything the survey turns up

- [x] 4.1 **Salad** — gate added to both modes; retry bound raised to 50,000 after
      measuring 486 median / 4,419 worst candidates per Extreme board.
- [x] 4.2 **Ascent** — gate added; generation loop bounded.
- [x] 4.3 *(added)* Ascent's first gate reused the generator's solver scratch,
      whose retained state **weakens** the solver, so it under-rejected and left
      side effects behind. Caught by measurement, fixed with a per-probe scratch,
      and written up as a cross-game requirement (`design.md` D5).
- [x] 4.4 Record the games that silently downgrade a tier (Dominosa, Solo, Towers,
      Tracks by size; Map, Unequal, Boats on retry exhaustion) as known deviations
      with the rule they should converge on.

## 5. Close out

- [x] 5.1 Spec deltas: `bricks`, `mathrax`, `salad`, `ascent`, `ts-migration`.
- [x] 5.2 Update each game's help page difficulty wording.
- [x] 5.3 Full gate green (6748 tests, `vite build` included); owner-accepted
      2026-08-04, after a Chrome pass over the four games.

## 6. Follow-ups recorded, not done here

- [ ] 6.1 Sweep the "you get the difficulty you chose" sentence into the other 23
      tiered games' help pages (true for all of them now; written on four).
- [ ] 6.2 `add-game-difficulty-contract`: enumerate tiered games from the registry
      rather than from `DIFF_*` naming, and provide the shared `solveAtCap` whose
      absence produced the stale-scratch defect in 4.3.
