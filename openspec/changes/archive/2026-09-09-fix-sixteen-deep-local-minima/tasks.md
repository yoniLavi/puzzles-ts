# fix-sixteen-deep-local-minima — tasks

## 0. What was already established — not re-derived

- [x] 0.1 **A reproduction, checked directly rather than read off a browser.**
      5×5, tiles
      `1,2,3,4,5,6,8,7,9,10,15,12,13,14,11,16,17,19,18,20,22,21,23,24,25` — four
      swapped pairs. `sixteenGame.hint()` refused in 3.2 s, re-confirmed at the
      start of this session, having run the deep search and failed.
- [x] 0.2 **Reach and cost** are in `fix-sixteen-endgame-stranding`'s tasks: the
      state-bounded search reaches 8 at this size, the deep search 9, each
      further ply about 40×. Thirteen is not reachable by any arrangement of the
      same machinery. **Still true, and no longer the relevant question.**
- [x] 0.3 **A constructive solver cannot be the answer**: the walk applies a
      plan's first move and recomputes, so a maneuver whose potential falls only
      at its end is abandoned mid-way. Still true.
- [x] 0.4 **The refusal was false.** `NO_MOVE_WORTH_MAKING` claims something
      about the board that no search here establishes.
- [x] 0.5 **Rarity**: the previous change took 5×5 stranding from 5-in-40 to 0,
      and this board came from play outside that sample. Not re-measured by
      walking seeds (about an hour, killed for memory three times in four); the
      named board is the instrument instead.

## 1. The shape

- [x] 1.1 **Complete *and* honest, and completeness turned out to be cheap.**
      The fork assumed reaching further was the only route to completeness. It
      was not: the search is steered by a measure blind to permutation cycles,
      and counting them escapes the minimum with the budget already there. So
      there was no scope decision to put to the owner — the measurement removed
      it.
- [x] 1.2 The honest refusal shipped as well, because the reach is real and a
      board past it must still say something true.

## 1b. The framework question

- [x] 1b.1 **What the cross-game guarantee means for a game that searches**: it
      has a *reach*, not a deduction, and past it may refuse. Recorded in the
      `ts-engine` delta.
- [x] 1b.2 **One wording, and a derived population.** `SEARCH_OUT_OF_REACH`; the
      walk derives its members by reading which games call `planSlides(` in
      their own comment-stripped source, and carries a one-line-per-member
      ledger the derivation asserts exactly. Verified failing: with the marker
      broken the ledger test reports `expected [] to deeply equal [netslide,
      sixteen]`; with a wrong wording planted in Sixteen the walk reports the
      new message rather than the old "hint gave up".

## 2. Honest refusal

- [x] 2.1 Wording — names `Show solution…`, **not** `Auto-solve for me`, which
      is continuous hinting and refuses wherever a single hint does. Pointing at
      it would have been advice that cannot work, on the one screen a player has
      just been let down on.
- [x] 2.2 `NO_MOVE_WORTH_MAKING` does **not** split; it narrows. Its remaining
      callers (Fifteen, Flood, Inertia) are constructions that cannot return
      empty on an unsolved board, so there the sentence is a backstop that
      states the truth. A bounded search is the opposite case, and that is the
      new constant. Both doc comments say which is which.
- [x] 2.3 The reach is stated where a player meets it: `help/features.md`
      § Hints now teaches three refusals rather than two, and names the two
      puzzles it applies to.

## 3. Completeness

- [x] 3.1 The measure counts **tangles** — non-trivial cycles of the tile
      permutation — priced at `TANGLE_COST` (4) each, only past the
      `TANGLES_IN_REACH` (2) the exact searches unwind on their own.
      Weights 2 to 8 all escape the named board; 4 is the one whose plan reaches
      the finished board rather than merely a better one.
- [x] 3.2 Guarded against the board in 0.1 and against three- and five-tangle
      boards, by **walking recomputed hints to solved** rather than by asserting
      a plan length — the first arrangement of this fix returned plans and never
      solved. `fix-sixteen-endgame-stranding`'s two boards still get their
      complete nine-move plans, asserted by its own guard, unchanged.

## 4. Close

- [x] 4.1 `npm run gate`.
- [x] 4.2 Run the app: 5×5 played through to a finish following hints.
- [ ] 4.3 Owner acceptance — the refusal wording and the help paragraph.
