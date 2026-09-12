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

## What the measurements said

**Claim 1 is true, larger than reported, and confined to the suite.** On Range's
real generator, three arms in one process, rotated and interleaved, 21 reps, four
runs: imported / local = **1.62, 1.69, 1.71, 1.73**, against an A/A control of
**0.98–1.01**. The mechanism was confirmed structurally before any timing — vite's
module-runner transform rewrites `DR[i]` to `__vite_ssr_import_0__.DR[i]` and
defines every export as a getter, so the loop pays an accessor call per access.

**And `vite build` flattens it away.** A two-module fixture built unminified
compiles the loop to a direct `var` read in one scope, byte-identical to the
module-local form. So the hoist a refactorer wants costs the *suite* 1.7× and
costs a player nothing. That is where it is recorded — `docs/games/testing.md`,
not the solver guide — and the comment on `range/solver.ts` that carried the
unverified 1.5× now carries the range, the control, and that last sentence.

**Claim 2 is false.** One instance timed twice reads 0.98–1.02, indistinguishable
from two separately loaded instances at 0.98–1.01; a fuzz-polluted instance reads
0.94–1.05, not the reported ~40%. What separates a tight control from a loose one
is **warm-up, not instance count** — this harness exercises every arm once before
the clock starts, and the effect disappears. The original reading was most likely
a cold first arm against a warm second.

So no past conclusion needs revisiting: the concern was that a share of this
repository's timing verdicts rested on a control that was too generous, and the
control is not too generous.

`docs/test-strength.md` § 7 gains two rows, one of them for this change's own
first instrument — a micro-benchmark that stubbed the module namespace as plain
data properties, where vite uses getters, and so measured the imported arm as
*faster* than the local one. It was measuring the stub.

## Why it is worth the measurement

`AGENTS.md` § "Method" says to check an instrument against something outside the
tool before trusting a finding, and § "before designing against a headline
number, take it". These two numbers would each steer a framework decision: one
discourages an extraction that looks obviously right, the other calls a batch of
timing verdicts into question. Both are cheap to measure and expensive to be
wrong about.
