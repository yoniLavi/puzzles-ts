# assert-that-tiers-bind

Realizes: `docs/framework-rdd/guarantees.md` § "What every game gets asserted,
per capability" — the Technique-ladder row's *"tiers bind (a board graded T is
rejected by cap T−1)"*, which is the one entry in that table with no
implementation anywhere in the tree.

**Readiness: ready.** The property was measured before this was written, the
population is already derived by an existing guard, and the one game that fails
fails against *its own spec*.

## Why

**The rule exists, the helper exists, the guard does not.** `ts-migration`
§ "A difficulty tier binds the board it generates" already requires it in as many
words — *"A game offering more than one difficulty SHALL NOT generate, at any tier
above the easiest, a board that its own solver can complete at the tier below"* —
with the scenario spelled out; `engine/difficulty.ts` already exports
`solvableAtExactlyTier` as its single expression, and
`docs/games/solver-and-generator.md` § "A tier means exactly its rung" already
tells a porter to use it. **So this change adds no rule.** It adds the one thing
missing: something that checks.

That is the whole of the gap, and it is worth being precise about, because the
first draft of this proposal was about to add a requirement the spec already
carried.

`difficulty-contract.test.ts` asserts a great deal about tiers — that
the set is derived, that the names come from the collection's scale, that a
capped solve is monotone, that every declared tier either generates or refuses
with a reason — but **it never compares the tier a board was generated at with
the tier the board actually needs.** It computes `lowestSolvingCap` and uses it
only as the *floor* of a monotonicity sweep.

So a game whose generator quietly downgrades — deals an Easy board when the
player asked for Normal — passes every guard in the collection. That is the
"a guard must measure the thing it claims to guard" shape from `AGENTS.md`
§ "Method": the file is *about* difficulty and the assertion next to the
computed value is about something else.

**Measured 2026-09-08, and it found one.** Across every leaf preset of every
tiered game whose tier is readable from its own params (`contract.tierOf`), four
seeds each: **285 preset cases, 282 bind exactly.** The three that do not are
all Undead:

```
undead "4x4 Normal" claims tier 1 (Normal) → boards needed caps [1,1,0,0]
undead "5x5 Normal" claims tier 1 (Normal) → boards needed caps [0,0,0,0]
undead "7x7 Normal" claims tier 1 (Normal) → boards needed caps [0,0,0,0]
```

**And the cause is not the generator.** Read rather than assumed, which is what
the first version of task 2.1 demanded and what turned out to matter:

- `undead/generator.ts`'s `gradeMatchesTier` is **honest**. Easy requires
  `rung === RUNG_ARC && arcPasses <= EASY_MAX_ARC_PASSES` (3); Normal requires
  arc-consistency *beyond* that pass cap, or the counting rung. That is exactly
  what the `undead` spec says — *"Easy = arc-consistency within the pass cap,
  Normal = arc beyond the cap or counting"* — and exactly what the boards are.
- **The difficulty contract's `solveAtCap` drops the pass cap.** At
  `cap === DIFF_EASY` it runs `solveDeductive(common, start, RUNG_ARC)` with no
  bound on passes, so a board needing eight arc passes — a Normal board by the
  game's own definition — is reported *solved at Easy*.

So Undead deals correct boards and **the instrument that grades them is broader
than the game.** No board moves; the fix is four lines in the contract. What was
actually broken is every consumer of `cappedSolveFor` for Undead — including the
collection's own monotonicity guard, which has been reading an Easy that is not
Undead's Easy.

**That inversion is the reusable half of this change.** The tier-binding property
can be broken from either side — the generator accepting a board that does not
need its tier, or the contract's capped solve being wider than the tier it names
— and only the first is visible to a game's own tests. The second is invisible
*by construction*, because a game grades with its generator's spelling and every
cross-game guard grades with the contract's, and nothing had ever compared the
two. This is the `AGENTS.md` § "Method" shape at one remove: not a guard
measuring a neighbor of the thing, but two spellings of one rule that no test
made meet.

**The 282 are the other half of the finding, and they change what this change
is.** `docs/framework-rdd/deduction.md` argues the framework should own the
generator's strip/accept loop so that *"guess-free generation is not a policy to
comply with but the only thing the driver can do."* The measurement says the
collection already complies, in 39 hand-written generators, at 99%. **The
correctness case for taking over the accept loop is therefore near-zero**; what
is missing is not a driver but a *guard*, and the guard is one derived sweep
rather than a framework organ and 39 migrations. This is the fifth time in this
vision's history that checking the tree first replaced a build with a
measurement (rows 1–5 of the README's table), and it is worth recording as the
sixth.

**Why it matters ahead of new games, which is the point of doing it now.** A new
game's generator is written by copying the nearest existing one, and the honest
"solvable at exactly this tier, not below" acceptance test is the part of that
copy easiest to get subtly wrong — it is a `!==` in one place with no visible
consequence when it is a `>`. A derived guard means a new game is told on its
first commit, with no enrollment, that its Normal deals Normal boards.

## What Changes

- **A cross-game assertion that a board needs the tier its preset claims**, in
  `difficulty-contract.test.ts`, over the population that file already derives.
  Keyed on **the presets a player can pick** and their own `contract.tierOf`,
  not on `withTier` applied to the cheapest preset — see the instrument note
  below, which is load-bearing.
- **Undead's `solveAtCap` learns the pass cap its generator has always used**, so
  the contract grades Undead's tiers the way Undead does. No board moves.
- **Exceptions are derived from a declaration the game already makes**
  (`nonUniqueTiers`, `nonMonotone`), never from a new roster. Dominosa's
  "Ambiguous" is already exempt by its own declaration; nothing else needs to
  be.
- **Cost is tiered**, not paid per commit: the full 285-case sweep is ~150 s.
  The gate slice samples; `PUZZLES_SLOW_TESTS` runs the matrix, exactly as
  `seedBudget` already does one file over.

## The instrument, and why it is stated in the proposal

**The first version of this measurement was wrong, and its wrongness is the
reason this section exists.** It reused `paramsForTier` — the existing helper
that finds *the cheapest preset valid at a tier* — and reported ten loose cases
across Solo, Group, Undead and Unequal. Every one was an artifact: a 4×4 Solo
board cannot be Hard however its params are labeled, so `withTier(smallest,
Hard)` asks a question no generator can answer, and `validateParams` accepting
it is not the same as the board being able to carry it.

Re-keyed on the presets a player actually picks, the count went from ten to
three and the games from four to one. **The helper that was already in the file
is the wrong key for this property**, which is `AGENTS.md` § "Method" twice over
— check the instrument before the finding, and a scan keyed on the wrong thing
convicts games of a defect they do not have. The new assertion must therefore
**not** be written in terms of `paramsForTier`, and the reason belongs in its
doc comment so the next reader does not simplify it back.

## Impact

- Affected specs: `ts-engine` — the **guard's** contract only. The behavioral
  rule is `ts-migration` § "A difficulty tier binds the board it generates" and
  is not restated; the `undead` spec already requires what Undead's generator
  already does, so neither gets a delta.
- Affected code: `src/engine/difficulty-contract.test.ts`,
  `src/games/undead/index.ts` (the contract's `solveAtCap`), and the guides named
  in tasks 3.
- **No board moves.** The fix is to the grading instrument, not to generation, so
  every desc, differential fixture and shared game ID is untouched — and a
  fixture that *did* move would mean the fix reached generation, which is the
  check rather than an afterthought.
- Owner acceptance: **not required.** Nothing a player sees changes; Undead's
  Normal boards were always Normal. This is an internal contract and a guard —
  archive it with the same self-driven initiative it was created with.
