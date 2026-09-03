# declare-deduction-techniques

## Why

**The shared deduction runner grades a board by an array index.**
`runDeductionFixpoint` types a technique as an anonymous `() => number` and
derives the difficulty grade from the technique's *position* in the ladder
(`grade = Math.max(grade, r)`), capping with `maxRung` — also a position. A
difficulty tier is thereby defined as "how far down the array we got".

That coupling is not a detail; it is the reason the runner fits five call sites
out of forty. The first line of the audited no-go table
(`adopt-shared-deduction-fixpoint`, carried into `docs/games/solver-and-generator.md`
§ "Where the fixpoint does not fit") reads:

> | Unruly | grades by difficulty constant, not rung index |

Read rather than inferred: Unruly's ladder is **five techniques across three
tiers** — `checkAllThrees` and `checkAllSingleGap` are both `Trivial`,
`checkAllCompleteNums` and `checkAllUniques` are both `Easy`,
`checkAllNearComplete` is `Normal`. Index ≠ tier, so the runner cannot express
it, and Unruly hand-rolls a `while (true)` with a `bump(d)` running-maximum and
**two `if (diff < X) break;` statements sitting in the middle of the ladder** —
the exact shape Magnets' conversion was praised for removing ("upstream's
difficulty cap sat in the MIDDLE of the ladder; it is exactly the runner's
`maxRung`", `adopt-shared-deduction-fixpoint` Finding 3).

**And the fix already exists in the corpus, spelled differently.** Loopy — a
genuine no-go for other reasons — declares `RUNGS: { fn, diff }[]` and caps with
`rung.diff <= ss.diff`. So the collection has invented "a technique carries its
own tier" twice, in two vocabularies, and the shared runner speaks neither. That
is precisely the "same concern implemented five ways" that the framework vision
([`docs/framework-rdd/deduction.md`](../../../docs/framework-rdd/deduction.md))
says to stop tolerating: its `Technique` contract opens `{ id, tier, … }`, and
its README is explicit that *"it is a clean idiom, and unifying it would be
churn" is not a reason to leave the same concern implemented five ways*.

**Separately, `step-budget.ts` asks a question it cannot answer.** Its failure
message is *"deduction did not terminate within N steps (a hint rule is
reporting progress without changing the board?)"* — and then leaves you to
bisect the ladder by hand to find which rule. The techniques are anonymous, so
the runner has no name to give.

## What Changes

- **A technique becomes a declaration, not a closure.** `DeductionRung =
  () => number` becomes `Technique = { id, tier, run }`, and `rungs` becomes
  `techniques`. Both fields are **required**: a ladder states its own tiers
  rather than encoding them in array positions, and states its own names rather
  than leaving them to be counted.
- **Grade and cap move from index to tier.** `grade = max(tier of every
  technique that fired)`; `maxRung` (an index) becomes `maxTier` (a tier), which
  skips every technique above the cap wherever it sits in the ladder. For a
  ladder whose tiers are non-decreasing — which is all five current call sites —
  this selects exactly the same prefix, so **no board moves**.
- **The step budget names the liar.** On the recording path only, the runner
  counts firings per technique id and, when the budget trips, rethrows with the
  histogram appended. Zero cost on the generator path (nothing is counted when
  no budget is passed), which is the path byte-parity depends on.
- **Unruly adopts the runner**, because this change is what makes it
  expressible. Its `bump()` accumulator and its two mid-ladder `break`s
  disappear; its tiers become five `tier:` fields the reader can see without
  counting. Its frozen byte-match differential is the net.
- **The no-go table is re-audited and rewritten** — in the module header, in
  `docs/games/solver-and-generator.md`, and in the `ts-engine` spec. Unruly
  leaves it; the five that remain are re-stated against the *new* contract, so
  the table says why each still does not fit a tier-declaring runner rather
  than why it did not fit an index-grading one.

Explicitly **not** in this change, and each for a stated reason:

- **Splitting `run` into the RDD's `find` / `apply` / `narrate` triple.** That
  is the larger half of the `Technique` contract and it changes every game's
  recorder plumbing; it needs its own change and its own exemplar. This
  installment is the half that is behavior-preserving.
- **Adopting Singles, Clusters, Spokes, Lightup or Loopy.** Each needs a *new
  runner hook* (an `impossible` flag, a three-valued early-out, an accumulated
  cost, a fused scan order, a threshold-skip protocol), and
  `adopt-shared-deduction-fixpoint` Finding 2 is that adding a hook per game
  "would turn the runner into a configuration language". Unruly is adopted
  because it needs **no new hook** — only the tier semantics this change
  introduces. That is the whole test of whether the change earned its place.
- **Any change to a technique, an order, or a tier's meaning.**

## Impact

- Affected specs: `ts-engine` (the shared deduction-fixpoint scaffold
  requirement).
- Affected code: `src/engine/deduction-fixpoint.ts` and its five call sites
  (`engine/latin.ts`, `games/{filling,magnets,pattern,undead}/solver.ts`), plus
  `games/unruly/solver.ts` adopting.
- **Behavior must not change.** Every affected game is solver-gated and carries
  a frozen differential: Unruly, Magnets and the eleven Latin games byte-match
  C descs, and Filling/Pattern/Undead gate generation on their solvers'
  verdicts. A differential that moves means the conversion is wrong, and is
  never resolved by re-recording a fixture.
- The Latin family reaches the runner through `latinSolverTop`, so eleven games
  are touched by one edit there; their tier is already their rung index
  (`diffSimple`/`diffSet0`/… *are* difficulty levels), which is why the
  translation is `tier: i` and not a re-grading.
