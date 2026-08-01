# Tasks — add-latin-repeats-support

## 0. Gate: the shared cube must stay inert for its existing consumers

- [ ] 0.1 Design the repeatable-symbol extension as opt-in; default behaviour
      byte-identical.
- [ ] 0.2 Prove it: every Latin-family differential (Solo, Keen, Towers, Unequal,
      Undead, Mathrax, ABCD) green **before** any Salad work. If one moves, the
      extension is wrong, not the fixture.

## 1. The cube

- [ ] 1.1 Represent a symbol with a declared per-line multiplicity (Salad's hole:
      `order - nums` per row and column).
- [ ] 1.2 Extend the existing elimination/forcing rungs to respect it.
- [ ] 1.3 Unit-test the cube directly, not only through a game.

## 2. Salad

- [ ] 2.1 Rewrite `salad/solver.ts` on the cube; delete the hole↔candidate
      translation and the note at its head.
- [ ] 2.2 Add the techniques the shape makes expressible; record each, since each
      changes which boards exist.
- [ ] 2.3 Re-grade the difficulty tiers against the new strength, and gate them
      honestly (see `grade-difficulty-tiers-honestly`).
- [ ] 2.4 Number Ball generation gated on the stronger solver; judge the result by
      playing it, which is the only test of the author's actual complaint.

## 3. Assurance

- [ ] 3.1 Retire the desc byte-match; replace with uniquely-solvable-at-exactly-
      its-tier over a wide seed sweep.
- [ ] 3.2 Keep the C fixtures as solver-verdict checks wherever they still mean
      something.
- [ ] 3.3 Hint still meets the bar — `add-salad-hint`'s explanations are written
      against the old technique set and must be re-checked, not assumed.

## 4. Close out

- [ ] 4.1 Spec deltas: `latin-solver`, `salad`.
- [ ] 4.2 Full gate green; owner acceptance on how Salad now plays.
