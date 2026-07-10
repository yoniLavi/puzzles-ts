# Design — add-dominosa-hint

## Context

Dominosa's solver (`dominosa/solver.ts`) is a faithful port of the upstream
graded engine: nine `deduce_*` techniques whose fundamental operation is
`ruleOutPlacement`. A domino is *determined* when exactly one of its placements
stays active; the player realises that by placing the domino (a `domino` move).
The game also has a first-class **barrier edge** (`edge` move) — a "no domino
here" annotation — which is exactly the vocabulary for externalising a rule-out
deduction onto the board (hint-authoring §1B). So Dominosa is a natural fit for
a two-kinds-of-step hint: **placements** (the payoff) and **teaching barriers**.

Closest exemplar: **Slant** (`add-slant-hint`) — a graded solver + `findloop` +
`findMistakes` game whose hint recorder + `seedFrom` runs over the real solver.

## Decisions

### D1 — Persistent-scratch, one-firing-at-a-time recorder

`hint()` builds the whole plan up front over a **single** `DominosaSolver`
scratch, seeded once from the player's *placed dominoes* (`seedFromDominoes` —
for each placed domino force its placement: rule out its other placements and
the placements overlapping it, exactly as playing it would). It does **not**
seed the player's barrier annotations (they carry no validity — a wrong one must
never break the hint); the recorder re-derives every rule-out itself.

`firstFiring()` then runs the deductions in the upstream `run_solver` order but
**returns after the first firing** (the first deduction that rules out ≥1
placement, or a determined-but-unplaced domino), capturing the technique and its
evidence. The driver applies nothing extra — the firing already mutated the
scratch — so the *next* `firstFiring()` call naturally continues from there.
This is the restart-on-first-firing shape (hint-authoring §1A), specialised.

The recorder is **gated**: `runSolver` (the generator's path) never sets it, so
the generation hot path and the byte-match differential are unchanged.

### D2 — Firing → step mapping

- **Placement step.** `firstFiring` first looks for a domino with exactly one
  active placement not yet on the working board (a "naked single" — determined
  by seeding or a prior firing) → emit `{ type: "domino", d1, d2 }`,
  technique `onlySpot`. `deduce_square_single_placement` (a square with one
  placement pins its domino there) also yields a placement (`squareOnly`), and
  additionally rules out that domino's other spots.
- **Barrier step.** The seven rule-out techniques
  (`squareSingleDomino`, `mustOverlap`, `localDuplicate`, `localDuplicate2`,
  `parity`, `set`, `forcingChain`) each rule out placement(s); emit a
  `{ type: "edge", d1, d2 }` per ruled-out placement, grouped as one
  `continuesPrevious` journey. A ruled-out placement whose edge the player has
  **already drawn** is skipped for display (still advanced in the scratch).

`upstream`'s `deduce_domino_single_placement` is subsumed by the `onlySpot`
placement check, so it is dropped from the *hint* driver (not from `runSolver`).

### D3 — Narration (Palisade bar, hint-authoring §2)

Necessity voice (the move is forced). Lead with the indication, name dominoes by
their numbers. Per technique:

- `onlySpot`: "The N–M domino has only one spot left — every other pairing is
  blocked — so it must go here." (place)
- `squareOnly`: "This square can pair with only the N–M domino, so it must go
  here." (place)
- `squareSingleDomino`: "Every remaining spot for this square is the N–M domino,
  so N–M can't sit anywhere it would leave the square empty." (barrier)
- `mustOverlap`: "Every remaining spot for the N–M domino covers this square, so
  no other domino can go here." (barrier)
- `localDuplicate` / `localDuplicate2`: "Putting the N–M domino here would force
  a second N–M at the shaded square — but each domino is used once — so it
  can't." (barrier)
- `parity`: "A domino here would split the empty squares into two odd-sized
  regions, and an odd region can't be tiled by dominoes — so it can't." (barrier)
- `set`: "These N squares can only hold these N dominoes between them, so those
  dominoes are used up here and can't sit elsewhere." (barrier)
- `forcingChain`: "Following the forced pairings from here loops back to repeat a
  domino, so this pairing can't start the chain." (barrier)

Each narration is one glance-able step; the evidence squares are shaded so the
premise is visible (hint-authoring §5.2).

### D4 — Rendering

`redraw` takes the displayed `HintStep`'s highlights: `targets` (the forced
domino's / barrier's two cells → `COL_HINT`), `evidence` (the technique's
reasoning squares → `COL_HINT_CELL`). New palette entries `COL_HINT` /
`COL_HINT_CELL` are appended **past** the upstream enum (index 9/10), and the
hint bits join the packed `Int32Array` diff key so they paint and clear
correctly (playbook §3.2). A barrier hint additionally recolours the suggested
edge `COL_HINT`.

### D5 — Resume + budget

`dominosaGame` joins `hint-resume.test.ts`: a plan recomputed one step at a time
from any reachable no-mistake board reaches solved. Because the recorder mirrors
the real (unique-solving) solver, the walk terminates; a defensive step budget
caps the plan-build loop.

## Guess-free precondition (hint-authoring §1A)

Every Dominosa preset below Ambiguous is generated to be **uniquely solvable by
the deductive solver** (the generator's `run_solver(diff)` gate), with no
recursion — the solver has no backtracking rung. So every non-Ambiguous board
is fully narratable by the technique set above. **Ambiguous** boards are not
uniquely solvable, so `hint()` refuses on them the same way it refuses a
mistaken board (there is no forced deduction to teach).
</content>
