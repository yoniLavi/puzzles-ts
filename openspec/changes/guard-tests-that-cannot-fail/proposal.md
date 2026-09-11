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

A guard over test files that fails on the two shapes a machine can see:

1. **An assertion whose two sides derive from the same expression.** `expect(f(x))
   .toBe(f(x))`, and comparisons of a value against itself.
2. **A bound that the type makes unconditional.** `expect(xs.length)
   .toBeGreaterThanOrEqual(0)`, `expect(n).toBeGreaterThanOrEqual(0)` on a count,
   and `toContain` of a single character, which § 3 already calls out.

Plus the shape that caught most of the thirteen: **an assertion reachable only
inside a conditional, with no vacuity counter**. That one cannot be judged
mechanically in general, so the guard asserts the cheaper half: a test whose
assertions all sit inside an `if` or a loop body SHALL count what it examined and
assert the count, which is the rule `AGENTS.md` already states for guards.

## What this does not claim

A guard for these shapes would have caught perhaps half of the thirteen. The
other half were vacuous for reasons only a reader or a planted defect can see, a
fixture whose data made a branch unreachable. The honest framing is that this
lowers the cost of the cheap half and leaves planting as the way to find the
rest, which is what § 2 of the test-strength doc already recommends.
