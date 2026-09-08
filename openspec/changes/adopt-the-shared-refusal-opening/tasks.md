# adopt-the-shared-refusal-opening — tasks

## 1. Adopt

- [x] 1.1 Fifteen games call `commonHintRefusal(<completed>, <mistakeCount>)`:
      dominosa, boats, palisade, range, singles, filling, pattern, galaxies,
      lightup, subsets, undead, sticks, slant, spokes, unruly.
- [x] 1.2 Dropped the `ALREADY_SOLVED` / `FIX_MISTAKES_FIRST` imports the
      adoption orphaned. **Kept where something else in the file uses them** —
      Subsets keeps `CONTRADICTION_UNLOCALIZED` for its re-solve arm and Spokes
      keeps `PUZZLE_NOT_REASONABLE`, both checked rather than assumed.
- [x] 1.3 **Verified by shape.** Every changed line in the fifteen files is the
      two-line call, an import shrinking, or a comment — and the diff contains
      **exactly fifteen** `if (refusal) return refusal;` lines, one per adopter,
      no more and no fewer. The single exception read and accounted for: Boats'
      comment about `findMistakes` being a re-solve, reworded to sit above the
      call rather than between the two arms it used to separate.
      Net: **49 insertions, 142 deletions** across 15 files.

## 2. Record the declines

- [x] 2.1 Bricks and Clusters keep their own opening, with the reason **at each
      site**: their `findMistakes` cannot see a mark that is wrong but breaks no
      local rule, so a re-solve answers that case with
      `CONTRADICTION_UNLOCALIZED` — a message asking the player to undo rather
      than promising a highlight that never comes. Their wrong-board arm is a
      *choice between two messages*, which the pair cannot express.
- [x] 2.2 **The helper grew no parameter for the second message.** Recorded in
      the spec delta and at both sites: a knob added so two games can pass a
      different constant turns a convention into a configuration language, which
      is what a first-class override exists instead of.
- [x] 2.3 Flood, Fifteen and Sixteen have no mistakes arm, and their completion
      test is not a `completed` field either (`outOfPlace === 0`,
      `isCompletedTiles(...)`). One line is already the whole opening; changed
      nothing, and they sit in the guard's ledger with that reason.

## 3. Make it stick

- [x] 3.1 Guard in `hint-refusal.test.ts`, in the `NO_KEYBOARD` shape. **The
      derivation is neat because adoption erases the evidence**: an adopter names
      neither constant any more, so "games whose `index.ts` still names
      `ALREADY_SOLVED` or `FIX_MISTAKES_FIRST`" *is* the set of non-adopters. It
      is asserted equal to a five-entry ledger, each with its reason. A game that
      regresses fails until it is added; a decline that adopts fails until it is
      removed.
- [x] 3.2 **Proved it fails**: hand-wrote Slant's opening back and the guard went
      red naming `+ "slant"`. Restored.
- [x] 3.3 `docs/games/hints.md` § "Refusal wording comes from one module" gains
      *"never write the opening either"* — the call-site idiom, the two rules it
      makes structural, the two things a game may still answer for itself, and
      the standing refusal to add a parameter.
- [x] 3.4 Vacuity: the guard counts adopters (`> 10`, against fifteen) so the
      ledger assertion cannot pass over a scan that stopped seeing game sources.

## 4. Close

- [ ] 4.1 `npm run gate`.
- [ ] 4.2 Archive under self-driven initiative. No owner acceptance: no player
      sees a different string on any board.

## Findings

**`commonHintRefusal` had no callers.** The helper, its doc comment showing the
exact call-site idiom, had been in `hint-refusal.ts` unused while fifteen games
hand-wrote the two lines it returns. Its only caller before this change was one
`refuse-honestly-at-every-tier` added a day earlier. That is the "who reads it,
and what would they do differently without it?" question from the other side —
not a promise nothing consumes, but a *solution* nothing consumes, and reading
the fifteen call sites showed it was unadopted rather than wrong.

**The population split cleanly and the declines are real.** Fifteen were the pair
verbatim; two owe a conditional second refusal; three have no mistake concept at
all. Nothing had to be contorted to fit, and nothing was left per-game that
somebody could not defend as belonging to the puzzle.

**Adoption makes the guard's derivation exact rather than approximate**, which
was not designed and is worth noticing: because an adopter stops naming the
constants, the set that still names them is precisely the set that declined. The
ledger has nothing to drift against.
