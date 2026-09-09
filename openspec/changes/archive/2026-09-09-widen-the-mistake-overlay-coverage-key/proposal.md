# widen-the-mistake-overlay-coverage-key

**Readiness: ready.** The finding is measured, the false entries are named, four
of the six are proven by mutation rather than by reading, and there is no design
decision left in it.

Found 2026-09-09 by `explore-the-tile-loop-inversion`, which was withdrawn
(`openspec/postmortems/2026-09-09-tile-loop-inversion-withdrawal.md`). This is
what that exploration found instead of the thing it went looking for.

## The finding

**`src/mistake-overlay-coverage.test.ts`'s shortfall ledger names at least six
games that already have the test it says they lack.**

The guard derives its population honestly — from the capability set, not from a
grep for `findMistakes`, and its header says so at length. Then it keys
*coverage* on the string `showMistakes`, `renderScenario`'s flag, on the
reasoning that this "is not a name a game chose: it is *the* mechanism for
driving a mistake frame."

It is not the mechanism; it is the newest of three, and four of the games it
convicts wrote theirs before `renderScenario` existed. The other two spellings:

| Spelling | Games on the ledger that use it |
| --- | --- |
| `midend.findMistakes()` between two `midend.redraw()`s — the shape `docs/games/rendering.md` § "Prove the overlay repaints" names, via Towers' exemplar | **abcd, keen, lightup, rome** |
| `game.findMistakes?.(state)` passed straight into a direct `redraw(...)` call | **galaxies, map** |

**Galaxies' is the strongest mistake-overlay test in the collection** — three
frames, the third asserting that the overlay *clears* when it is dropped — and
`docs/games/rendering.md` cites it by name as an exemplar of exactly this
discipline, in the same tree where the ledger lists it as uncovered.

**Verified by mutation, not by reading.** Planting the defect the guard exists
to catch — dropping the overlay's stale clause from the game's cache-miss test —
turns a test red in **keen, abcd, rome and galaxies**. Lightup's and map's were
read and are unambiguous (both warm a drawstate, turn the overlay on, and assert
the second frame paints).

So the real shortfall is **11, not 17**, and the ledger is a ratchet that "may
only shrink" — it is currently asking six games for work that is already done,
and pointing the next person at the wrong six of the seventeen.

## Why this matters more than six list entries

**A guard whose population is derived and whose coverage is keyed on a name is
half a guard, and it is the half nobody checks.** The header spends four
paragraphs on getting the population right — capability sets rather than a
grep, because four games spelled the member differently — and then hands the
coverage side to a single string. `AGENTS.md` § "A scan that keys on a name
finds only the games that were named that way" applies to both sides of a
guard, and this is the first instance in the tree where one side was carefully
derived and the other was not.

The failure mode is the worse direction, too. An over-reported shortfall does
not fail a commit; it sits in the tree looking like diligence, and its cost is
paid by whoever eventually tries to close it and finds the test already there.

## What this change is

1. **Key coverage on the property, not on one harness's flag.** A game is
   covered when a test drives the mistake overlay onto a frame and asserts the
   paint — whichever of the three ways it does it.
2. **Re-derive the ledger** and let it shrink by six.
3. **Prove the widened key** by planting the defect in a game on each side of
   the line, watching it go red, and restoring — the rule the exploration
   followed and this guard's original did not record having followed.

**The honest scope question, answered:** textual keys are what made this wrong,
so a third textual key is not the fix. But the alternative — a behavioral probe
that plants the defect per game — is a mutation harness, and this repo has one
already scoped (`npm run probe`) with a standing rule that it is a diagnostic
and never a gate. So the widened key stays textual and *classifies* the
superset (any test that pairs a mistake source with a redraw and an op
assertion), which is this repo's standing instrument rule, and the ledger keeps
its per-entry reasons. Design notes go in `design.md` at implementation.

## Impact

- Affected specs: none. This changes which games a coverage guard believes are
  covered; it asserts nothing new about behavior.
- Affected code: `src/mistake-overlay-coverage.test.ts` only.
- **Not in scope:** writing the missing eleven. The ledger's own reasoning
  stands — reaching a mistaken board takes a game-specific move and the mark is
  a game-specific shape — so those remain per-game work. This change makes the
  eleven the right eleven.
