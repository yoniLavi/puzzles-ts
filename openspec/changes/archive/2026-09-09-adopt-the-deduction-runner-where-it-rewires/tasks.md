# adopt-the-deduction-runner-where-it-rewires — tasks

## 1. Tracks — the exemplar

- [x] 1.1 Eight rungs declared as `{ id, tier, run }` in `tracksLadder`.
- [x] 1.2 Grade confirmed to mean the same number.
- [x] 1.3 Differential byte-unchanged, whole suite green.
- [x] 1.4 Proved the wiring is live — and found the fixtures cannot certify it.
- [x] 1.5 `tracks-ladder.test.ts`, the equivalence oracle.

## 2. The remaining six

- [x] 2.1 **Seismic** (3 rungs). Grade coincidence shown, not assumed.
- [x] 2.2 **Subsets** (5 rungs). Prologue in `settled`; cap stays an argument.
- [x] 2.3 **Rome** (7 rungs). Iteration guard kept in `settled`, not folded into
      the shared step budget — that budget is documented as the *recording*
      path's, and this is the byte-match-critical solve path whose throw is part
      of its behavior. Moving it is a separate decision.
- [x] 2.4 **Ascent** (10 rungs). Two rungs guard themselves.
- [x] 2.5 **Galaxies** (4 rungs). The recorder survives untouched, so the hint
      keeps every word; `galaxies-hint.test.ts` is unchanged and green.
- [x] 2.6 **Bridges** (3 stages). Sweep-then-report confirmed legal.

## 3. Report

- [x] 3.1 `docs/games/solver-and-generator.md`: four new exemplar rows and a new
      section, "Proving an adoption: the fixtures are not enough".
- [x] 3.2 `deduction-fixpoint.ts`'s header: sixteen call sites, and the standing
      instruction to re-derive the list by a **comment-stripped** scan.
- [x] 3.3 The hint result is **handed to
      `characterize-the-hint-assessment-corpus`, not answered here**, and that is
      the honest split: "what does a hint cost now?" is measured by writing one,
      which is a change of its own. Five of the seven adopters ship no hint
      (tracks, rome, seismic, ascent, bridges) and are now on the runner that
      carries the recorder — so they are the corpus that answers it, and if the
      answer is "the same as before", that closes `docs/framework-rdd/` for good.

## Findings

### The reach

**16 → 23 of the 46 games with a solver**, counted comment-stripped. The seven
are Tracks, Seismic, Subsets, Rome, Ascent, Galaxies and Bridges.

### The bar held, and no rung needed a new runner option

Rule 1 was *no new option on the runner*, and nothing came close to breaking it
— including the two cases that looked most like they would:

- **Ascent's `single-number-simple` runs at Tricky and *not* at Hard.** That is
  availability **non-monotone in the cap**, which no `tier` can express, because
  `maxTier` includes every rung at or below it by construction. It guards itself
  and returns `0`. This is the sharpest evidence yet for the runner's refusal to
  grow a `when` predicate: a predicate here would have to encode "at this tier
  but not that one", and would be indistinguishable from the `0`.
- **Subsets' per-iteration prologue** went into `settled`, which runs in exactly
  the position the prologue did. The Singles precedent — a rung at position 0
  that always returns `0` — also works, but would put a never-firing entry in
  the firing census.

Two smaller notes worth carrying: **a mid-ladder tier `break` and a `maxTier`
skip agree only when the ladder is tier-sorted** (Rome and Bridges both are; a
game with a cheap rung after an expensive one would diverge, and the runner
deliberately still runs it). And **a rung may sweep a whole population before
reporting** — Bridges' stages walk every island first — because "return after
first firing" is a statement about the *ladder*, not about a rung's internals.
The shape that genuinely breaks it is a pass that must sweep the whole ladder
before restarting, which is Lightup's.

### What adoption bought, honestly, per game

Not the same thing everywhere, and worth recording so the next reader does not
assume uniformity:

| game | grade used? | cap used? | what it got |
| --- | --- | --- | --- |
| tracks | yes | yes | the whole contract |
| seismic | yes | yes | the whole contract |
| rome | no (returns a status) | yes | loop, cap, named rungs |
| ascent | no (returns void) | yes | loop, cap, named rungs |
| bridges | no (returns a verdict) | yes | loop, cap, named rungs |
| galaxies | trivially (one tier) | no | loop, named rungs |
| subsets | no | no (a boolean into one rung) | loop, named rungs |

**So the line saving was the wrong measure in both directions.** Four of the
seven use neither graded feature; what they gain is the loop, the restart
discipline, the step budget's non-termination attribution by rung name, and the
firing census. Subsets is the thinnest case and says so at the site.

### The census earned its place twice

It exists so an equivalence test cannot pass over boards that need only the
easiest rung. It found two rungs that fire **nowhere**:

- **Tracks `check-single`** — 324 solves, every other rung firing, that one
  zero. Checked against `tracks.c`: reproduced line for line, both guards
  included. Upstream's narrowest rule, and this generator's boards never reach
  it.
- **Rome `naked-pairs`** — and this one is worse: instrumented *inside the rung*
  and run through generation, **2,896 calls across 36 board generations, zero
  firings**, so it is dead on the clue-stripping path that decides which puzzles
  exist. `rome.c` is puzzles-unreleased and not in the sibling clone, so the C
  could not be read — but Rome's differential is a byte-match against recorded C
  descs and passes, and a rung wrongly dead here while live in C would diverge
  those descs.

  **One live consequence, filed rather than fixed**: that rung's own comment says
  its faithfully-reproduced scan-order quirk (`k < c`, the union-by-size root
  rather than the minimum) "changes which puzzles exist". On this evidence it
  changes nothing, because the rung never reaches the loop the quirk is in.
  Either a board exists that fires it, or the comment is wrong — and either way
  that is a Rome question, not an adoption question.

### The thing I would do differently next

Each adopted solver gained an optional `onFiring` callback purely as a test
seam. Seven of them now. `runDeductionFixpoint` already counts firings
internally for its budget attribution, so **returning the tally from the runner
would delete all seven seams** — and with seven instances the pattern is no
longer speculative. Not done here because rule 1 of this change is that the
runner's contract does not move; it is the obvious first change *after* it.
