# adopt-the-shared-refusal-opening

**Readiness: ready.** The population was read rather than grepped, the declines
have reasons, and nothing a player sees changes.

## Why

**`commonHintRefusal` has no callers, and fifteen games hand-write what it
returns.** `engine/hint-refusal.ts` exports the two-line opening every deductive
hint owes — a finished board first, then a wrong one — with the call-site idiom
written out in its own doc comment:

```ts
const refusal = commonHintRefusal(state.completed, findMistakes(state).length);
if (refusal) return refusal;
```

Measured 2026-09-08: **not one game calls it.** Its only caller is
`candidate-hint.ts`, and that call is a day old — added by
`refuse-honestly-at-every-tier`, which found that module spelling the refusal
constants out as literals. Every other game writes the six lines by hand.

That is the "who reads it, and what would they do differently without it?"
question from the other side. The repo has learned to hunt promises nothing
consumes; a *solution* nothing consumes is the same waste wearing the opposite
face, and the answer is not to delete this one — reading the fifteen call sites
shows they are the helper, verbatim — but to adopt it.

**Why it matters beyond tidiness, which is the bar.** Two of the hardest-won
rules in `docs/games/hints.md` live in this opening and are invisible at each
copy: the refusals must be asked **in that order** (a finished board is not a
wrong board), and `FIX_MISTAKES_FIRST` *promises a highlight*, so it may only be
emitted under a `findMistakes(...).length > 0` guard — never speculatively. A
game that writes the pair by hand can get either wrong silently, and fifteen
chances to do so is fifteen too many. In the helper both are structural.

It is also exactly the accidental complexity `AGENTS.md` § "Convention over
configuration" names: *can we say what a game would legitimately want to do
differently?* For the order and the guard, no. For **which** second refusal it
owes, yes — and that is the decline below.

## What Changes

**Adopt (15).** dominosa, boats, palisade, range, singles, filling, pattern,
galaxies, lightup, subsets, undead, sticks, slant, spokes, unruly — every game
whose opening is already the pair, byte for byte in behavior.

**Decline (2), with the reason.** **Bricks** and **Clusters** answer the second
refusal with `CONTRADICTION_UNLOCALIZED`, not `FIX_MISTAKES_FIRST`: their boards
can be inconsistent without any single entry being provably wrong, so promising
a highlight would promise one that never appears. That is a real per-game
answer — the exact distinction `hint-refusal.ts`'s header already records — and
it stays. **The helper is not widened to take the second message**; a parameter
that exists so two games can pass a different constant is a configuration
language growing out of a convention.

**Nothing to save (3).** Flood, Fifteen and Sixteen have no mistakes arm at all
(their completion test is not a `completed` field either — `outOfPlace === 0`,
`isCompletedTiles(...)`). Their opening is already one line, and routing it
through a helper by passing a constant `0` for the mistake count would be longer
and would lie about what the call means.

## Impact

- Affected specs: `ts-engine` (one requirement: the opening is the helper's,
  and what the two legitimate escapes are).
- Affected code: fifteen `index.ts` files. **Purely subtractive** — six lines and
  usually one import become two lines.
- **No behavior changes at all**, and that is checkable rather than asserted:
  every adopted site is the helper's body verbatim, so the refusal a player sees
  is the same string in the same order on the same board. The seven cross-game
  hint guards and each game's own hint tests are the net.
- Owner acceptance: not required — an internal refactor with no player-visible
  effect. Deliberately **not** folded into `refuse-honestly-at-every-tier`, whose
  wording collapse *is* player-visible: mixing them would muddy the claim that
  this half changes nothing anyone sees.
