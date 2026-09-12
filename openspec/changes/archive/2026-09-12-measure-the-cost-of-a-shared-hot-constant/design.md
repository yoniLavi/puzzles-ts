# Design

## The import-cost measurement

The claim is specific, so the measurement can be too: one game, one hot loop, one
table, moved and moved back.

- **Arms**: the table as a module-local `const`, and the identical table imported
  from a sibling module. Nothing else differs.
- **Environment matters and is the whole question.** Measure under vitest, which
  is where the claim came from, **and** in a production build, which is what a
  player runs. A cost that exists only under the test transform is a fact about
  the suite, not about the game, and the two lead to opposite conclusions about
  whether to extract.
- **Paired and interleaved**, with the A/A control from the second measurement
  below, because this is exactly the kind of small ratio that a bad control turns
  into a phantom.

If the cost is real only under vitest, the honest recording is a note in the
testing guide, not a ban on shared constants. If it is real in the build, that is
a genuine constraint on the engine's shape and belongs in the solver guide.

## The A/A control measurement

The claim is that a control which times one loaded instance against itself is
optimistic. Testing it needs three arms, not two:

1. HEAD, loaded once, timed twice — the suspect control.
2. HEAD, loaded twice as two separate module instances, each timed once — the
   proposed control.
3. The same code again after an equivalence fuzz has run in the same file — the
   pollution case Guess reported.

If arm 1's spread is materially tighter than arm 2's, the recipe is wrong and
every ratio judged against it was judged against a band that was too narrow.

## What this change must not do

It must not quietly re-time the tidy pass's conclusions and restate them. If arm
1 proves optimistic, the correct output is the corrected recipe plus a statement
of which conclusions rested on it, not a silent re-run. The tidy pass's own
timing verdicts were all at or below parity, so a wider band does not reverse
them, and saying that plainly is part of the deliverable.
