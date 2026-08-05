# add-subsets-difficulty-tiers — design

## D1: What was actually wrong with upstream's disabled block — nothing

Task 1.1 said to work out what was wrong with it and *not* to assume it was
merely unfinished. Recovered from `788d0cc^:puzzles/unreleased/subsets.c`, the
commented-out block is:

```c
/* Remove options that don't fit the larger set */
// for (sub = 0; sub < n2; sub++) {
//     if (!(cube[i2 * n2 + sub])) continue;
//     found = false;
//     for (super = sub + 1; super < n2 && !found; super++) {
//         if ((super & sub) != sub || !(cube[i1 * n2 + super])) continue;
//         found = true;
//     }
//     if (!found) { cube[i2 * n2 + sub] = false; ret++; }
// }
```

It is the exact mirror of the live block above it, and it is **sound as
written**. Both halves rest on the arrow forcing a *proper* subset — which the
arrow rule alone does not give (`subsets_validate` accepts equality) but the
separate "each set is placed at most once" rule does, since two cells cannot
hold the same value. That is why the live half scans `sub < super` and the dead
half scans `super = sub + 1`: each looks for a *strictly* smaller or larger
partner, and both are entitled to.

Ported verbatim and measured, it eliminates no candidate belonging to a board's
solution over hundreds of boards, terminates (the cube only shrinks, so no rule
can re-fire on the same elimination), and costs no measurable time. **So the
`TODO` records an intention, not a diagnosis** — whatever went wrong for the
author is not visible in the code and is not reproducible from it.

That is worth stating plainly rather than inventing a repair narrative. What
the task was really protecting against — shipping an unsound rule because a
comment said it was nearly right — is handled by the soundness property below,
which does not depend on knowing the history.

**How soundness is checked, and why not against the other cap.** The obvious
test — "the strong solver agrees with the weak one" — only covers boards the
weak one already solves, which is exactly the population where the new rule
matters least. `generateCandidate` returns the full assignment it blanked
(the desc hides the givens; `known` still holds them), so the test compares the
capped solve against the board's *own truth* instead. That covers every board,
including the ones only the strong rule can finish.

## D2: The tiers

Two: **Easy** (upstream's compiled strength exactly) and **Tricky** (adds the
head half). Names and the `d`-char encoding `"et"` follow the collection's
two-tier convention — clusters, magnets, pearl, singles and tents all name
exactly this pair, and in each the harder tier is likewise "one more argument
deep".

The rungs **nest**: Tricky runs every Easy rule and one more, in the same order,
so cap-monotonicity holds by construction and the shared
`difficulty-contract.test.ts` guard confirms it rather than discovering it.

Measured on 400 candidates and 200 generations:

| | givens | per board | gate yield |
|---|---|---|---|
| Easy | 5.17 | 1.0 ms | — (no gate) |
| Tricky | 4.72 | 3.6 ms | 26.0% |

Tricky boards carry roughly half a given fewer, and **74% of raw Tricky-gated
candidates are already Easy-solvable** and get thrown away. Generation tail at
Tricky: median 3 ms, p95 12 ms, max 28 ms — a bare retry loop is affordable
several times over.

## D3: The byte-match oracle was kept in full, and needed no flag

Task 3.1 said to try the Spokes/`upstreamLooseGate` shape first and, failing
that, to retire the differential. **Neither was necessary.** The new rung was
added *above* upstream's strength rather than in place of it, and tier 0 has no
tier below it to be graded against — so at `DIFF_EASY` the rule set, the
acceptance test and the RNG draw order are all untouched, and the twelve
C-recorded fixtures still reproduce byte-for-byte. They bind on the **live
default path**, not behind a flag reachable only from the differential, which is
strictly better than what Clusters and Spokes could manage.

The general shape worth carrying: *a tier added at the top of the ladder keeps
the oracle for free; a tier that redefines the existing gate does not.* Reach
for `upstreamLooseGate` only in the second case.

## D4: Why the retry loop is a bare loop

`add-clusters-difficulty-tiers` warned that a solver-gated generator carrying
state between attempts is a hill-climb, so a rejection landing on a *completed*
candidate must perturb rather than refuse — a plain refusal re-derives the same
board, draws no randomness and spins for ever.

That hazard does not exist here, and the reason is structural rather than lucky:
Subsets' generator carries **nothing** between attempts. Every candidate begins
with a fresh `shuffle` of all sixteen set-values and a fresh `shuffle` of the
blanking order, so each retry is independent sampling and cannot reproduce the
board it just rejected. A bare `for(;;)` under `retryLimit` is correct.

Reading the loop first was still the right move — it is what established that,
and the answer was not guessable from the Clusters write-up.

## D5: The hint recorder, and a precedent mis-transferred

The recorder needs the head half or a Tricky board's plan stalls mid-board. The
first cut simply ran it unconditionally, on the Clusters precedent (its
`deduceHintPlan` runs both rungs whatever the board was generated at).

**That precedent does not transfer, and a render snapshot caught it.** Clusters'
harder rung is a *fallback* — reached only when the direct rung stalls, which on
an Easy board it never does, so full strength there is unreachable and free.
Subsets' head half is a cube-shrinking rule that runs before *every* collapse,
so its extra strength always applies: an existing Easy hint frame moved.

The elimination was still sound and the narration still true (a shorter survivor
list is a tighter premise, not a different claim), but re-planning boards at a
tier that does not need the rung is a change nobody asked for. So the head half
was made a genuine fallback — engaged only once every cheaper rung is exhausted
— which restores the Easy plan exactly and gives Tricky the rung where it is
needed. The snapshot went back to unchanged, which is the proof.

**Generalisable**: whether a stronger rung is free to enable unconditionally is
a fact about *where in the control flow it sits*, not about the rung. A fallback
is free; a rule in the fixpoint is not.

`deduceHintPlan` therefore takes the same `maxdiff` cap the solver does. It is
not phantom API: production always passes the top of the ladder, and the cap is
what lets the test *assert* the equivalence above instead of asserting a
proxy for it. The first version of that test checked
`deductions.length > 0` under a comment claiming plan equality — the vacuous
shape this repo keeps re-finding — and comparing against the capped recorder is
what made it real. The Tricky test then asserts the capped recorder **stalls**,
so the comparison cannot be between two things that could never have differed.

## D6: What is not here

**Alternate grid sizes.** The 4×4 / four-letter bijection is the puzzle; other
sizes are a different game (`audit-author-known-issues`), and the Custom dialog
this change adds offers the tier alone for exactly that reason.

**A third tier.** There is nothing left in reserve — with both halves of the
advanced rule restored, upstream's vocabulary is fully spent. A third tier would
have to invent a deduction, which is `add-sticks-difficulty-tiers`'s problem,
not this one's.
