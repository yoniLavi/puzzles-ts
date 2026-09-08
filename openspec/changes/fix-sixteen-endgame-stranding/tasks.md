# fix-sixteen-endgame-stranding — tasks

## 0. What is already measured — do not re-derive it

All of this is from `fix-sixteen-hint-recompute-stability` (2026-09-08), taken
with the exact search already running on every board.

- [x] 0.1 **Frequency**: 16 seeds of Sixteen 5×5, walked one recomputed hint at a
      time — 13 solve, **3 strand**, at moves 32, 35 and 35.
- [x] 0.2 **Shape**: every stranding is at `outOfPlace = 4` and is two swapped
      pairs. The refusal is `NO_MOVE_WORTH_MAKING` ("No move here would get you
      closer.") on a solvable board.
- [x] 0.3 **Distance**: such a board is **exactly 9 moves** from finished. Worked
      example, seed `hr-d` after 43 hint moves:
      `1,2,8,4,5,6,7,3,9,10,11,12,13,14,15,16,17,18,20,19,21,22,23,24,25`.
- [x] 0.4 **Reach**: the exact search solves scrambles of 4–8 every time in under
      0.5 s and never returns a plan longer than 8.
- [x] 0.5 **Cost of reaching 9**: fails at 6 M / 10 M / 14 M / 18 M states;
      succeeds at 24 M, in 10.0 s. Distance 8 costs 2.5 M and 0.5 s.
- [x] 0.6 **Not a regression**: the pre-fix code refuses on the same boards. It
      cycled before reaching them, which is why this was never seen.

## 1. Choose the mechanism

- [ ] 1.0 **Price candidate 3 first** — store the backward half of the exact
      search (four plies, ~1.25 M states, ~40 MB, identical for every hint at a
      given board size) and run the forward half as an iterative-deepening DFS to
      five plies, probing each leaf against it. Memory then scales with depth
      rather than breadth, which is the thing that rules distance 9 out today.
      Count the leaf probes before designing around it: the 5–8 s estimate is
      extrapolated from the stored forward frontier, not measured. If this works
      the other two candidates are unnecessary.
- [ ] 1.1 Build the 4-tile pattern database (25·24·23·22 ≈ 304 k entries; slides
      act on positions, so a pattern's transition is well defined) and **measure
      what reach it buys** the forward A\* before designing around it. The current
      forward heuristic is total toroidal travel, which is not admissible and is
      helpless at a local minimum; the question is whether an admissible PDB
      heuristic gets a distance-9 board solved inside a sane budget.
- [ ] 1.2 If it does not, or if the hint it produces is unreadable, design the
      constructive endgame instead: place tiles by commutator, with the potential
      being how far through the algorithm the board is. Longer plans, always
      available, monotone by construction, and it can *explain the maneuver* —
      which is what the hint quality bar actually wants here.
- [ ] 1.3 Decide where it lives. Shared through `slide-planner.ts` only if it
      generalizes; `src/games/sixteen/` otherwise.

## 2. Measure Netslide rather than assuming

- [ ] 2.1 Netslide shares the planner and was **not** measured for this. Its win
      condition is weaker (any arrangement that powers every tile finishes it) and
      its branch factor is far smaller, so it may not have the shape at all. Walk
      its presets over many seeds the way task 0.1 walked Sixteen's, and say what
      was found — including "nothing", which is a result.

## 3. The guard

- [ ] 3.1 **The existing guard would not have found this**, and that is the point
      to fix: `hint-resume.test.ts` walks one seed per preset, and 13 of 16 seeds
      pass. A defect on a fifth of boards needs a sweep over *seeds*, in the slow
      tier, asserting the walk arrives.
- [ ] 3.2 Prove it fails before trusting it: restore the stranding and watch it go
      red.

## 4. Close

- [ ] 4.1 `npm run gate`, plus the new seed sweep.
- [ ] 4.2 Run the app: deal Sixteen 5×5 repeatedly and follow the hint to a solved
      board on a seed that strands today.
- [ ] 4.3 Owner acceptance — this changes what a hint says, and candidate 2
      changes what it teaches.
