# fix-sixteen-deep-local-minima — tasks

## 0. What is already established — do not re-derive it

- [x] 0.1 **A reproduction, checked directly rather than read off a browser.**
      5×5, tiles
      `1,2,3,4,5,6,8,7,9,10,15,12,13,14,11,16,17,19,18,20,22,21,23,24,25` — four
      swapped pairs, eight tiles out of place. `sixteenGame.hint()` refuses in
      3.2 s, having run the deep search and failed.
- [x] 0.2 **Reach and cost** are in `fix-sixteen-endgame-stranding`'s tasks: the
      state-bounded search reaches 8 at this size, the deep search 9, and each
      further ply costs about 40×. Thirteen is not reachable by any arrangement
      of the same machinery.
- [x] 0.3 **A constructive solver cannot be the answer**, and this is the finding
      worth carrying: `hint-resume.test.ts` applies a plan's *first* move and
      recomputes, so a maneuver whose potential falls only at its end is walked
      into the middle and abandoned. Only per-move-monotone mechanisms survive
      that walk; a commutator is not one.
- [x] 0.4 **The refusal is false.** `NO_MOVE_WORTH_MAKING` — "No move here would
      get you closer." — is untrue on a board where plenty of moves get you
      closer and the hint merely cannot find one.

## 1. Decide the shape

- [ ] 1.1 **Complete or bounded-and-honest?** This is a scope decision, not an
      implementation one, and it belongs to the owner. Completeness needs a
      per-move-monotone potential computable at distance 13+ with a branching
      factor of 40 — research-shaped, no guarantee.
- [ ] 1.2 Whichever way it goes, **do the honest refusal anyway**: a
      search-driven hint that has run out of reach should say so, and point at
      Auto-solve. It is cheap and it is true, which the current sentence is not.

## 1b. The framework question it opens

- [ ] 1b.1 **Decide what the cross-game guarantee means for a game that
      searches.** `hint-resume.test.ts` says a hint never gives up on a solvable
      board; a deductive game can meet that, a search-driven one has a *reach*
      instead. Sixteen passes today because the sampled seeds miss the deep
      minima — a new seed could turn the guard red truthfully.
- [ ] 1b.2 If an honest out-of-reach refusal is to be allowed, it needs the
      treatment the tiered exemption got: **one wording**, and a way for the
      guard to tell it from a broken hint — **derived from what the game is**,
      not from a roster (`AGENTS.md` § "A game joins a shared mechanic by
      *having* it").

## 2. If bounded

- [ ] 2.1 Wording. Player-facing, so the owner's.
- [ ] 2.2 Decide whether `NO_MOVE_WORTH_MAKING` splits. It currently serves two
      different claims — "nothing here is worth doing" and "I could not find
      anything" — and only the first is a statement about the board. Its doc
      comment reasons carefully about what a game may legitimately differ on;
      this is a case that reasoning did not anticipate, so read it before
      changing it.
- [ ] 2.3 Say what the reach *is*, somewhere a player can find it, or decide
      deliberately not to.

## 3. If complete

- [ ] 3.1 A potential that falls on every move. A pattern database driving IDA\*
      is the candidate; measure the reach it buys before designing around it, the
      way `fix-sixteen-endgame-stranding` priced its own candidates.
- [ ] 3.2 Guard it against the board in 0.1 and against the shapes
      `fix-sixteen-endgame-stranding` pinned.

## 4. Close

- [ ] 4.1 `npm run gate`.
- [ ] 4.2 Run the app: play 5×5 through to a finish, or to an honest refusal.
- [ ] 4.3 Owner acceptance.
