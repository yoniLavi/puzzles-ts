# Catch the two test shapes that cannot fail

## Why

The tidy pass gave every agent one instruction that turned out to matter more
than the tidying: plant a defect and check that a test goes red. Doing that found
**a test that could not fail in roughly thirteen games**, and in every case the
test had been passing for months while asserting nothing.

The shapes repeat:

- Solo asserted `dupCount(off) >= dupCount(on)` where the second is always 0.
- Crossing's arrow test landed its cursor on a cell with no down run, so the only
  assertion that ran was already true.
- Net's win test built a solved board, discarded it, and never checked
  `completed`.
- Fifteen counted steps labeled "closer" and asserted nothing when there were
  none.
- Flood's victory test decoded a one-color board, so the rainbow it checked never
  ran.
- Mosaic's undo/redo test marked a cell that satisfied no clue, so every status
  line read the same.
- Tracks, Subsets, Pearl, Pegs, Guess, Samegame and Twiddle each had one.

`docs/test-strength.md` § 3 already names these shapes. What is missing is
anything that finds them, and the agents found them only by planting defects by
hand, which does not run in the gate.

## What changes

**The measurement came first, and it cut the proposal down to one shape.** Each
candidate was run over every test file of the thirteen games as it stood at the
tidy commit's *parent* and again at the commit; a finding present before and gone
after is a catch.

| shape | caught of 13 | sites at HEAD |
| --- | --- | --- |
| both sides of an assertion are one expression | 0 | 5, all sound |
| a bound the type guarantees | 0 | 11, already reviewed |
| every assertion conditional | **5** | 53 |

So `scripts/checks/vacuous-assertions.mjs` implements the third shape only:
a test whose every `expect` sits behind an `if` must also say how many cases it
examined. `if (…) continue;` and `if (…) return;` count as the same guard, which
is what took the catch rate from 4 to 5 — reading only the `if` spelling sees
four of Sticks' five reason scans and misses the fifth.

The first two shapes are **not built**, and the numbers are the reason rather
than taste:

- `expect(roots("same")).toBe(roots("same"))` is not a tautology. It is the
  assertion that a seed determines a result, and `divvy.test.ts` writes
  `.not.toBe(roots("different"))` on the very next line. All five hits are that.
- The single-character `toContain` was already measured and settled by
  `close-bulk-edit-blind-spots`'s follow-up, which found four of eighteen sites
  were not the trap at all — vitest's `toContain` is *exact element* on an array
  — fixed the two real ones and recorded the twelve it left. A guard there would
  re-litigate a settled decision and need a sixteen-entry ledger on day one,
  which is how a guard gets switched off.

Fifty-one of the 53 sites are fixed rather than excused; the ledger is two
entries, both in `difficulty-contract.test.ts`, both with the reason.

## What this does not claim

This proposal estimated "perhaps half of the thirteen". **It is five**, and the
confidence ordering its design gave the three shapes is exactly inverted: the one
called "lowest confidence as a defect" is the only one that catches anything.
Planting a defect by hand remains the way to find the other eight, which is what
§ 2 of the test-strength doc already recommends.
