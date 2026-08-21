# Tasks — reject-unrecognised-moves

## 1. The helper

- [ ] 1.1 `src/engine/assert-never.ts` — `assertNever(value: never, context: string): never`,
      throwing with the context and the JSON of the value. Required `context`,
      not derived: the message is read in a player's console (design D1).
- [ ] 1.2 Its own test, including the **type-level** one — a deliberately
      unhandled union member is an `@ts-expect-error` at the `assertNever` call.
      A runtime-only test would not cover the guarantee D1 is about.

## 2. The survey (do this before editing, and record it)

- [ ] 2.1 Classify all 53 `executeMove` implementations into the three shapes
      (exhaustive `switch` / `if-else` chain / not-a-union). The proposal's table
      has counts from a coarse grep; the real classification is what tells you
      how many games need converting rather than extending.
- [ ] 2.2 Note any game whose "unrecognised move" behaviour is **load-bearing**
      — i.e. relied on by its own tests or by a hint/solve path replaying
      synthetic moves. Expected: none. If any turns up, it is a design decision,
      not a mechanical edit.

## 3. Apply, by shape (design D2)

- [ ] 3.1 Exhaustive `switch` games: add `default: return assertNever(move, "<game>: executeMove")`.
- [ ] 3.2 `if/else` games: convert to a `switch` on the discriminant plus the
      same catch-all. Behaviour-preserving for every real move — confirm each
      game's own suite stays green with **no snapshot re-baselining**.
- [ ] 3.3 Non-union games: validate the dispatched-on fields and throw in the
      same message shape.
- [ ] 3.4 Salad already has a `default` that is a *working arm*, not a guard —
      restructure it so the guard is distinguishable from the behaviour.

## 4. Tighten the cross-game guard

- [ ] 4.1 `save-round-trip.test.ts` currently accepts either camp (`if (err !== undefined)`),
      because both were safe. Once every game rejects, require the refusal and
      delete the two-camp allowance **and its comment** — a stale comment
      describing a tolerated state that no longer exists is worse than none.
- [ ] 4.2 Re-run the "prove it fails" check: with the change reverted, the sweep
      must go red for **all 57**, not the 37 it caught before.

## 5. Verify

- [ ] 5.1 Full gate green; every per-game suite green with no snapshot changes.
- [ ] 5.2 `npm run probe -- --verify`, and a full `npm run probe` if any probed
      engine module moved (none expected — this change is game-side).
- [ ] 5.3 Spot-check in the browser that ordinary play is unaffected in one game
      of each shape (design D2's three rows).

## 6. Close out

- [ ] 6.1 Spec delta into `ts-engine`.
- [ ] 6.2 `docs/games/mechanics.md` — the `executeMove` section gains the rule
      and points at the helper, since this is now part of what a new port must do.
- [ ] 6.3 Owner acceptance. **Flag explicitly at acceptance**: in the ~20
      formerly-tolerant games a save with an unplayable move now gets *refused*
      where it previously loaded a subtly different board. That is the intended
      behaviour and the owner has endorsed the principle, but it is the one
      player-visible consequence.
