# derive-hint-enrollment — tasks

Scaffolded 2026-09-04. Not started.

## 1. Derive

- [ ] 1.1 Compute the enrolled set from `registeredGameIds()` + each game's
      `hint` declaration, replacing the authored `HINT_GAMES` array.
- [ ] 1.2 Keep the exported shape (`[id, game][]`) so the six consumers do not
      change.

## 2. Guard the instrument, not just the games

- [ ] 2.1 Assert the registry was fully enumerated (a floor below the true
      count, not a ratchet — the `difficulty-contract.test.ts` pattern).
- [ ] 2.2 Assert the derived set is non-empty and at least as large as today's
      thirty, so a derivation that silently finds nothing fails loud.
- [ ] 2.3 Assert both directions: every registered game declaring `hint` is
      enrolled, and every enrolled game declares `hint`.

## 3. Prove it fires

- [ ] 3.1 Break it deliberately — make the derivation miss a game — and watch
      the vacuity guard go red, not just the sweep pass over less.
- [ ] 3.2 Confirm the six consuming guards still run the same number of games
      before and after (this change is meant to add none today).

## 4. Close out

- [ ] 4.1 `docs/games/testing.md` § enrollment duties — the duty is gone; say so
      and point at the derivation.
- [ ] 4.2 `docs/framework-rdd/guarantees.md` — mark the retired hand-list.
- [ ] 4.3 Full gate, commit, archive.

## Findings

_(none yet — not started)_
