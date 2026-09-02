# add-latin-repeats-support

## Why

**Salad's author names its worst fault as a missing piece of shared
infrastructure**, in `docs/salad.md`:

> *"The system for pseudo-latin squares is currently fairly messy, and doesn't
> allow for more complex solver techniques. This puzzle would greatly benefit from
> upstream support for latin squares where a symbol (specifically, the empty
> square) can appear more than once per row. This would allow for more puzzle
> types in the future to reuse a great deal of code."*

and his second as its consequence:

> *"The Number Ball generator currently doesn't create puzzles that make good use
> of the concept, in my opinion."*

`add-salad-ts-port` recorded both and declined both, for one reason that is now
void: it "would change every Salad board and throw away the byte-match oracle
that made this port verifiable". **The owner released the oracle on 2026-08-01**,
so what remains is the honest part of that decline — this is framework work in
`latin.ts`, not a port — and the payoff the author names.

The mess is real and localised. Salad's board is a Latin square in which the
*hole* is a symbol that may repeat, and the shared `latin.ts` cube cannot express
that, so `salad/solver.ts` carries a hole↔candidate translation documented at its
head as the compromise. Techniques that would be natural on a proper
repeats-aware cube — counting, pairing, forcing on the hole itself — cannot be
written against a translation layer, which is exactly why the solver is weak and
why the Number Ball generator has little to gate against.

## Sequencing (owner decision, 2026-08-01)

**Waits for `retire-c-engine`**, and possibly for a round or two of refactoring
after it, so this lands on a TypeScript-only codebase rather than alongside the
C teardown. Nothing here needs the C build: this game's differential imports a
frozen JSON fixture and keeps working with no C present.

Note the one-way consequence of that order — with no C build there is no
re-baselining a fixture against upstream. Where this change diverges, the fixture
is retired or re-founded on properties, not re-recorded. That is the intended
effect of the released oracle, not an accident of the sequencing.


**And after `grade-difficulty-tiers-honestly`**, which settles whether Salad's existing tiers bind at all — re-grading a solver against tiers that were never honest would confuse two changes in one.

## What Changes

- **Teach `engine/latin.ts` a symbol that may repeat**, with a declared
  per-row/column multiplicity, so a pseudo-Latin puzzle is expressed directly in
  the cube rather than translated into and out of one.
- **Rewrite Salad's solver against it**, retiring the translation layer, and add
  the techniques the shape then makes expressible. Salad's difficulty tiers are
  re-graded against the stronger solver.
- **Let the Number Ball generator gate on it.** The author's second complaint is
  downstream of the first: a generator can only make interesting use of a concept
  its solver can reason about.
- **Re-found Salad's assurance.** The byte-match differential does not survive a
  solver this different; replace it with the property that every generated board
  is uniquely solvable at exactly its stated difficulty, and keep the C fixtures
  as *solver-verdict* checks where they still mean something (the shape
  `add-mathrax-ts-port` used for its Recursive tier).

Explicitly **not** in this change: other games adopting the repeats-aware cube.
The author's "more puzzle types in the future to reuse a great deal of code" is
the motivation, not the scope; a second consumer justifies generalising further,
and there is none today.

## Impact

- Affected specs: `latin-solver` (the cube gains a repeatable symbol, an added
  requirement) and `salad` (solver strength, tier grading, differential basis —
  an added requirement plus one **edit to an existing requirement**. Write it as
  a `## MODIFIED Requirements` delta **when you implement**, copying the live text
  at that moment — `openspec validate` then checks you dropped nothing, which a
  hand-edit at archive time bypasses. The edit is in
  `openspec/specs/salad/spec.md` when this change is archived, reading the live
  text at that moment):

  > In **"Salad ports the solver as a shared Latin-square consumer"**, the
  > sentence realising the "some squares empty" rule *"by treating symbols above
  > `nums` in a full order-`order` Latin square as empty squares, so the shared
  > Latin generator and solver cube are reused unchanged"* describes the
  > translation layer this change retires, and is replaced by the direct
  > representation. The rest of that requirement — the game's own deductions, the
  > two difficulties, pure deduction without guessing, the clue-removal loop,
  > seed reproducibility — is unaffected and stays as written.
- Affected code: `src/engine/latin.ts`, `src/games/salad/`.
- **Every Salad board changes.** Existing IDs carrying a description still load.
- Risk: `latin.ts` is shared by the whole Latin family (Solo, Keen, Towers,
  Unequal, Undead, Mathrax, ABCD). The repeatable symbol must be *opt-in* and
  provably inert when unused — those games' differentials are the regression test
  that it is.
