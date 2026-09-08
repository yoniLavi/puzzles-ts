# assert-that-tiers-bind

Realizes: `docs/framework-rdd/guarantees.md` § "What every game gets asserted,
per capability" — the Technique-ladder row's *"tiers bind (a board graded T is
rejected by cap T−1)"*, which is the one entry in that table with no
implementation anywhere in the tree.

**Readiness: ready.** The property was measured before this was written, the
population is already derived by an existing guard, and the one game that fails
fails against *its own spec*.

## Why

**`ts-migration` promised this property as the replacement for the byte-match
oracle, and then nobody wrote it.** When byte-parity was released, the spec named
what had to take its place — *"the differential SHALL be re-founded on the
property that every generated board is uniquely solvable at exactly its stated
difficulty"* — and `AGENTS.md` states the same thing as a product bar: *"the
difference between a difficulty tier that means something and one that
doesn't."* `difficulty-contract.test.ts` asserts a great deal about tiers — that
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

A player picking **Undead Normal gets an Easy board**, at every size the menu
offers, nearly always. And this is not a divergence somebody chose: the `undead`
spec already requires the opposite, in as many words —

> - **AND** the board's grade matches the highest rung the ladder needed (Easy =
>   arc-consistency within the pass cap, Normal = arc beyond the cap or counting,
>   `Unreasonable` = forcing)

— so the game has a live requirement that nothing checks and the code does not
meet.

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
- **Undead's Normal tier is made to mean Normal**, or its Normal presets are
  made to refuse honestly. Which of the two is task 2's finding, not a decision
  this proposal makes.
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

- Affected specs: `ts-engine` (the new cross-game requirement). **No delta for
  `undead`** — its spec already requires the behavior; this change makes the
  code obey a requirement that is already written.
- Affected code: `src/engine/difficulty-contract.test.ts`, and whichever of
  `src/games/undead/generator.ts` or its params validation task 2 settles on.
- **Boards may move.** If Undead's generator is corrected, every Undead Normal
  desc changes, and its differential fixtures are re-founded rather than
  re-recorded (`AGENTS.md` § "Upstream policy" — there is no oracle to
  re-baseline against). A fixture that survives a generator correction unchanged
  would mean the correction did not reach generation.
- Owner acceptance: **yes, for the Undead half** — it changes which boards a
  player is dealt at a named difficulty. The guard half is an internal contract
  and is not.
