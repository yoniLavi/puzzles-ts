# Find out what a shared constant costs before sharing one

## Why

Two agents in `tidy-the-code-after-the-port` reported the same surprising thing,
and neither has been verified:

**1. Importing a hot loop's constants across modules is expensive under the test
transform.** Range moved its `DR`/`DC` direction tables into `state.ts` and
measured its generator at **1.55×**, its solver at **1.61×** and its hint planner
at **1.60×** against an A/A control of 0.94 to 0.99. Moving the tables back to
module scope removed the gap. The reported cause is that vitest's SSR transform
turns an imported binding into a property lookup, so a table read inside a tight
loop pays an indirection per access.

**2. A paired-timing control can flatter itself.** Crossing and Guess
independently reported that an A/A control which loads HEAD once and times it
twice warms its own JIT, so the control looks tighter than it is. Guess reported
a phantom ~5% slowdown that disappeared when the control was a separately loaded
HEAD copy, and that a HEAD instance polluted by an equivalence fuzz ran about 40%
slower than an untouched one.

Both matter beyond the games that found them. The first would make the obvious
refactor — hoist the direction tables every game duplicates into the engine —
cost real time in the suite. The second would mean a share of this repository's
timing conclusions, including some taken during the tidy pass itself, rest on a
control that was too generous.

**Neither claim is repeated here as fact.** They were measured by agents, in
clones now deleted, and the reason this is a change rather than a docs edit is
that `docs/test-strength.md` § 7 exists precisely to stop unverified instrument
claims being written down as true.

## What changes

- Both claims are measured directly, in this tree, with the result recorded
  whichever way it comes out.
- If the import cost is real, it is stated where a refactorer will meet it, in
  the solver guide beside the existing advice about shared helpers, and the
  question of whether it also affects the production build is answered rather
  than assumed.
- If the A/A bias is real, § 7 gains a row, and the paired-timing recipe the
  game brief carried is corrected at its source.
- If either is false, that is recorded too, so the next reader does not
  re-litigate it.

## Why it is worth the measurement

`AGENTS.md` § "Method" says to check an instrument against something outside the
tool before trusting a finding, and § "before designing against a headline
number, take it". These two numbers would each steer a framework decision: one
discourages an extraction that looks obviously right, the other calls a batch of
timing verdicts into question. Both are cheap to measure and expensive to be
wrong about.
