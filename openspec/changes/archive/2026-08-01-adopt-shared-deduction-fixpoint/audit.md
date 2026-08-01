# adopt-shared-deduction-fixpoint — audit

## Result in one line

**One clean adoption (Magnets), and the module's claim to be "the one loop every
logic game hand-rolled" is false and now corrected.** The ladder *shape* is
near-universal; the *bookkeeping wrapped around it* is per-game, and that
bookkeeping is what decides which puzzles exist.

## The candidate list, and why the grep heuristic was wrong

The proposal carried "~29 logic games still hand-rolling an ordered-rung loop",
from a grep for `while`/`for(;;)` plus a progress marker. Task 1.2 required
verifying it rather than carrying it forward, and it does not survive: the
figure counts movement games whose "solver" is a search, not a ladder — `flood`,
`fifteen`, `inertia`, `net`, `signpost`, `slide`, and `map` — and it counts
games whose loop is a single technique iterated, which the runner does not
simplify.

## Adopted

| Game | Why it fit |
|---|---|
| **Magnets** | An exact match. Eight ordered rungs, `>0 continue` / `<0 return -1` / break-when-none-fire, and — the decisive part — its `if (diff < DIFF_TRICKY) break;` sat **in the middle of the ladder** and is precisely the runner's `maxRung`. `solveUnnumbered` is the same ladder with two rungs. Converted; its differential fixture is **unchanged**, so no board moved. |

The conversion also improved the code beyond deduplication, which is the test a
refactor should pass: the difficulty cap used to be an early `break` positioned
between rungs five and six, so understanding which techniques Easy may use meant
reading the rung order and counting. It is now `maxRung: diff < DIFF_TRICKY ? 3 : 7`.

## Not adopted, with reasons

Each was read, not inferred. The pattern is that every one carries state the
runner does not express, and adding a hook for each would turn the runner into a
configuration language — the failure mode `unify-hint-framework` and the
scene-graph postmortem both warn about.

| Game | The bookkeeping the runner does not express |
|---|---|
| **Loopy** | *(Already recorded, re-confirmed.)* `(thresholdDiff, thresholdIndex)` is not the runner's grade bookkeeping and decides which puzzles exist. Two separate handoffs asserted it fits before anyone checked. |
| **Unruly** | A rung's grade is a **difficulty constant** (`bump(DIFF_TRIVIAL)`), not its index — two rungs at Trivial, two at Easy. The runner grades by rung index, so adoption needs an index→difficulty map *and* a cap computed from it. Net loss in clarity. |
| **Singles** | Drains an **op queue** (`solverOpsDo`) once per iteration before any rung, and signals contradiction by setting `state.impossible` rather than returning `< 0`. The runner has `beforeRung` (per rung) but no per-iteration pre-step. |
| **Spokes** | Accumulates an **action count** against `ACTION_LIMIT` to define its `DIFF_LIMITED` tier, and one rung is a recursive re-entry into the solver at a lower tier. The tier is defined by work done, not by which rung fired. |
| **Clusters** | Closest of the four. Its early-out returns a **three-valued status** (`clustersValidate` → solved / contradiction / unfinished) that the caller returns directly; the runner's `solved` is a boolean, so the status would have to be recovered afterwards. |
| **Lightup** | The rungs are fused into one pass over the grid in **upstream's scan order (x outer)**, with the comment "the critical timing loops" — the order is load-bearing for which boards generate, and splitting it into rungs would change it. |
| Movement games (`flood`, `fifteen`, `inertia`, `net`, `signpost`, `slide`, `map`) | Not deduction ladders at all — searches. Out of scope by the runner's own doc. |

**Not individually read**, and therefore not claimed either way: the remaining
~25 solvers. They are recorded as unaudited rather than silently counted as
no-gos. A future round wanting them should start from the four "closest" cases
above, because they show what a runner extension would have to support.

## The Boats defect class: hunted, one game covered

Design D5 required each converted solver to gain a **cap-monotonicity** property
test — for every difficulty cap `d`, a board solvable at `d` is solvable at every
cap above `d`. Magnets has one and **passes**.

Boats remains the known violation, and it is a *recorded, worked-around* property
rather than an open bug: its second-tier disjoint-set check can report a
contradiction a board does not have, so every consumer solving a board of unknown
difficulty tries each tier and takes the first that succeeds (`boats` spec).

**The property is not yet asserted for the other ~40 tiered games**, because
there is no uniform way to call their solvers — each has its own signature, and
a cross-game version needs a per-game `(generate, solveAtCap)` registry that does
not exist. That is the honest state: one game covered, the pattern established in
`magnets.test.ts`, and the infrastructure for the rest is a piece of work this
change did not do.

## What this changes about the module

`engine/deduction-fixpoint.ts` opened by calling itself *"the one ordered-rung
loop every logic game's solver/hint hand-rolled before this"*. That is not true
and the header now says what is: the loop is common, the bookkeeping around it is
not, and a solver whose loop *looks* like the shared one is not evidence that it
is. The call-site list was also stale.

**The transferable finding:** an abstraction that fits five callers out of forty
is a fine abstraction — what does damage is the module *documenting* itself as
universal, because that is what turns "does this fit?" into "why hasn't this been
adopted yet?" and produced two wrong handoffs about Loopy.
