# Design

## Why a guard rather than a lint rule

Biome has no rule for this, and the shapes are project-specific: what counts as
"the same expression on both sides" depends on the matchers in use. The tree
already has the right precedent in `scripts/checks/`: small node scripts that
parse source as text or via the transpiler, carry a ledger, and floor their own
input count. This is another of those, not a new tool.

## The three shapes, in order of confidence

1. **Same expression both sides.** Highest confidence, no false positives worth
   worrying about. `expect(EXPR).toBe(EXPR)` where the two texts are equal after
   normalization.
2. **A bound the type guarantees.** `toBeGreaterThanOrEqual(0)` applied to a
   `.length` or to a counter that is never negative. Needs a small allowlist,
   because asserting a non-negative on a *signed* quantity is meaningful.
3. **Assertions only inside a conditional.** Lowest confidence as a defect, and
   the most valuable when true. The guard's rule is not "this is wrong" but
   "count what you examined": a test whose assertions all sit under an `if` must
   also assert how many cases it reached.

Shape 3 is where the ledger earns its place. Some tests legitimately scan for a
case and assert on the first hit; those declare their count and pass.

## Prove the guard fails before trusting it

`AGENTS.md` is explicit that a guard nobody has seen fail is a guard nobody has
seen work, and this guard is *about* that property, so it would be absurd to
land it unproven. Each shape lands with a deliberately vacuous test in the
harness, seen red, then removed.

## The seed corpus is already known

The thirteen tests the pass strengthened are the regression corpus. Running the
guard against the commits *before* each of those fixes tells us its true catch
rate, which is the honest number to put in the proposal rather than an estimate.
That measurement is task 1.1 and it may well say the guard catches six of
thirteen, which is still worth having and is worth stating plainly.
