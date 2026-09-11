# Design

## Why the three travel together

Each is the same defect in a different place: **a check that runs and cannot
fail**. The citation guard reads files where change ids are rare, knip is
installed but unreachable, and the complexity rule's threshold is ten times the
largest function in the tree. One change, one reasoning, three small diffs.

They also share a failure mode if done carelessly. A guard whose first run
floods is switched off, which is worse than no guard. The citation guard's own
requirement records this: a resolver that was 92% false positives on its first
run would have been disabled. So each of the three lands **already green**.

## The citation guard: measure before widening

The requirement this extends does not permit widening on taste. It says the
specs were excluded because the measurement came back against it, 15 of 31
tokens unresolved and none of them a change id, and that a scan is widened only
where the same measurement comes back the other way.

So task 1.1 is the measurement, and it decides the shape:

- If `src/` comments cite change ids that resolve, plus a small unresolved set,
  widen and ledger the rest, as `docs/` does today.
- If `src/` turns out to be full of product vocabulary matching the kebab shape,
  do not widen. Record the measurement and drop this part.

The 23 tags already found are numeric section references and `design D<n>` tags,
which are a *different* shape from a change id. They may need their own pattern
rather than the change-id resolver.

## knip: assert the empty set

knip must fail the gate when an export loses its last importer. Two cautions:

- It loads `vite.config.ts`, which builds the preflight bundle, so it is not
  free. Measure its cost and place it in the gate's slow branch if it is not
  cheap enough for the fast prefix.
- It reports zero today. That is exactly the state a vacuity floor protects: the
  step must fail if it scans nothing, not pass over an empty tree.

## Complexity: pick the number from the distribution, not the default

Biome's default of 15 would report 467 sites, which is a wall. 50 reports 14
non-test sites. The threshold is a judgment about what a reviewer can hold in
their head, and the honest way to set it is from the tree's own distribution,
which is why the table is in the proposal rather than a rule of thumb.

Tests are excluded deliberately. A `describe` block full of table-driven cases
scores high and reads fine, and the rule would otherwise mostly police tests.

Rejected: fixing the 14 sites first and then setting the threshold low. Grid
geometry's branchiness is inherent, and a rule that forces it into helpers with
no reader would trade one kind of unreadability for another.
