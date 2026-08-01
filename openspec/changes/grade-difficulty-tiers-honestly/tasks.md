# Tasks — grade-difficulty-tiers-honestly

## 1. Survey

- [ ] 1.1 For every game with two or more difficulty tiers, determine whether the
      generator rejects a board solvable one tier below. Confirm the eight
      believed good (Boats, Rome, Seismic, Towers, Galaxies, Undead, Keen,
      Tracks) rather than trusting the grep that found them.
- [ ] 1.2 Settle Ascent and Salad, which showed no lower-tier check.
- [ ] 1.3 Record the result as a table in `design.md`; it is the evidence for the
      `ts-migration` requirement.

## 2. Bricks

- [ ] 2.1 Gate on "solves at `diff`, and does **not** solve at `diff - 1`".
- [ ] 2.2 Keep upstream's original gate reachable for the differential only
      (Spokes' shape); fixtures stay byte-matched against it.
- [ ] 2.3 Measure generation cost at every preset — tail, not median — and bound
      or re-preset if a tier becomes slow.
- [ ] 2.4 Property test: a board generated at tier N is not solvable at N-1.
- [ ] 2.5 Delete the "preserved upstream quirk" note in `solver.ts`; replace with
      the divergence and its reason.

## 3. Mathrax

- [ ] 3.1–3.5 As Bricks. Note Mathrax already diverges on the Recursive tier
      (unique-only stripping), so its differential is already part byte-match and
      part verdict-agreement; extend the same split rather than inventing a third
      shape.

## 4. Anything the survey turns up

- [ ] 4.1 Fix, or record why the game legitimately cannot grade.

## 5. Close out

- [ ] 5.1 Spec deltas: `bricks`, `mathrax`, `ts-migration`.
- [ ] 5.2 Update each game's help page if its difficulty wording implied
      otherwise.
- [ ] 5.3 Full gate green; owner acceptance on the changed difficulty feel.
