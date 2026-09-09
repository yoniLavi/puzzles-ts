# Techniques — one deduction engine, five projections

> **⚠️ STATUS: design fiction, minus the part marked shipped below** —
> describes a system that does not exist. Authored by `rewrite-game-dev-docs`
> (2026-08-07). Current truth: [`docs/games/`](../games/README.md). See the
> [vision README](./README.md).

The center of the framework. Everything a logic game "does" — solving,
grading, generating, hinting, refusing — is a projection of one declared
ladder of techniques. This document is the contract; it is deliberately the
longest of the set because it is where the collection's hardest-won rules
concentrate.

> **📏 MEASURED 2026-09-09 (`explore-the-deduction-engine-reach`), and the
> answer is *reach*, not design.** With presentation withdrawn, this was the
> vision's last part with substance left, so all 30 off-engine solvers were
> read against the runner's own criterion — *name a promise it makes that your
> loop must break*.
>
> **16 of the 46 games with a `solver.ts` use a shared deduction organ; 30 do
> not, and 28 of those had never been asked.** Ten fit — **seven of them
> (tracks, rome, seismic, ascent, subsets, galaxies, bridges) need only
> rewiring**, their techniques already being separate functions. Tracks writes
> `if (diff >= TIER && technique(b)) { maxDiff = Math.max(maxDiff, TIER);
> continue; }` eight times, which is this runner's signature transcribed by
> hand, and ships no hint. Six more sweep every technique before restarting and
> would change deduction order on a solver-gated generator; four have one rung
> and nothing to share; three are earned hatches (Boats joins Loopy and
> Lightup); seven are not deduction ladders at all.
>
> **The line count is small and it is the wrong measure.** The driver a game
> would hand over has a median of **21 lines**. That would have withdrawn this
> the way it withdrew the tile renderer — except that lines were the
> *presentation* end's argument and never this one's. This document's own claim
> is that the framework "makes the wiring impossible to get wrong", and **two
> instances of exactly that wiring drift surfaced in four days**: Undead's
> `solveAtCap` disagreeing with its generator (`assert-that-tiers-bind`), and
> Solo's `solve` and `findMistakes` — two hand-wired consumers of one solver —
> where `solve` corrupted every generated board for sixteen presets with the
> whole suite green (`fix-solo-solve-from-aux`).
>
> **So the verdict is rescope: adopt the seven, one at a time, on
> `re-derive-the-fixpoint-no-gos`'s bar — no new option on the runner, every
> frozen fixture byte-unchanged — and judge it by what a hint then costs**, not
> by lines removed. Five of the seven are hintless, which makes them
> `characterize-the-hint-assessment-corpus`'s corpus and the honest test of
> whether this end's argument is true.

## The Technique contract

A technique is one named deduction a player could learn, with everything the
framework needs to run it, grade it, and *teach* it:

```
Technique<Board, Firing> {
  id: string          // stable, greppable: "hidden-single", "wall-parity"   [SHIPPED]
  tier: number        // difficulty rung this technique defines/contributes to [SHIPPED]
  find(board): Firing | null      // the single next firing, or null
  apply(board, firing): void      // idempotent; mutates the working board
  narrate(firing, board): Narration  // REQUIRED — see below
}
```

> **`id` and `tier` have shipped** (`declare-deduction-techniques`,
> 2026-09-03). `runDeductionFixpoint` takes `{ id, tier, run }` declarations,
> both fields required; the grade is the highest **tier** that fired and the
> cap excludes by tier rather than by array position — which is what let Unruly
> leave the no-go list. The live contract is
> [`docs/games/solver-and-generator.md`](../games/solver-and-generator.md)
> § "The deduction fixpoint"; read that, not this, for what exists.
>
> `run` is still a single closure that both detects and applies, so the
> `find` / `apply` / `narrate` split below — the half that would make a
> hintless technique inexpressible — remains fiction.
>
> **The open question the next person to propose the split has to answer:
> what does it buy beyond the widened hint walk?** (Recorded 2026-09-09, not
> answered.) The split's promise is *totality* — a technique that fires without
> narrating does not compile, so hint coverage is a property of the type system.
> That benefit is **already delivered behaviorally**: `hint-resume.test.ts`
> walks a game's own hints to a solved board, so a firing nothing can narrate
> fails the walk, and `refuse-honestly-at-every-tier` (2026-09-08) widened that
> walk from the single easiest preset to the tier and size axes each game
> actually varies — every preset in the slow tier. A compile-time guarantee is
> genuinely stronger than a test: it holds for the board nobody generated. The
> question is whether that margin is worth a change to the contract every
> technique in the collection implements.
>
> **Read row 3 before answering, because this is its exact shape.** Row 3 was
> withdrawn on the finding that *the parity bar it existed to make a resting
> state was already one, derived from behavior* — the benefit had shipped, and
> the declaration would have re-declared it. Rows 4 and 5 fell to variants of
> the same check. That is not a verdict on this split, which really does reach
> somewhere a test does not; it is the standard of evidence the argument now has
> to meet.

(The one illustrative type block in these docs; everything else is stated as
contract prose. `Narration` is `{ text, highlights, legs? }` — the text plus
the evidence/action highlight roles and optional `continuesPrevious` legs, the
same shapes today's `HintStep` carries.)

Three deliberate properties:

- **`find` returns one firing, not a list.** "Return after first firing" is
  what keeps one deduction = one hint step = one grade event, and it is the
  shape the shared fixpoint already enforces. A technique that forces several
  moves in one firing returns them as one firing with legs (the
  one-journey rule).
- **`narrate` is not optional and takes the *board*.** A narration may need to
  count evidence off the board ("Both edges border the same region…"), and the
  premise must single out the conclusion. The type makes hintless techniques
  inexpressible; the wording bar stays in the real guides
  ([`docs/games/hints.md`](../games/hints.md)) and applies unchanged.
- **`apply` is the only mutation site.** `find` is pure. This is what makes
  the recorder path and the silent path provably identical: there is no
  separate hint solver to drift.

**Narration wording is game property, never framework property.** The
framework owns loops, budgets and lifecycles; not one player-visible word. An
exemplar hint never loses a word to an abstraction — this survives from the
current doctrine verbatim, because it is the rule that kept the shared
machinery honest through eleven Latin games.

## The five projections

From `techniques: Technique[]` (ordered, easiest first), the framework
derives:

1. **Solve** — run the ladder to a fixpoint (restart from the top on any
   firing; stop on solved, exhausted, or contradiction). This is today's
   `runDeductionFixpoint`, kept essentially as-is.
2. **Grade** — the highest tier that fired, with a cap for tier-gated runs.
   Cap-monotonicity holds *by construction* (a capped ladder is a prefix), and
   the conformance suite asserts it anyway, because the Boats lesson is that
   the property must be measured, not believed.
3. **Generate** — the game supplies a candidate proposer and a clue strategy
   (derive-then-strip, greedy-assemble, or structural-partition — the three
   shapes the Latin family already exhibits, promoted to named strategies);
   the framework owns the strip/accept loop: accept only boards the ladder
   solves at exactly the target tier, bounded by the shared retry limit.
   **Guess-free generation is therefore not a policy to comply with but the
   only thing the driver can do.** Only an explicitly-named "Unreasonable"
   tier may introduce a search step, and it must narrate its bifurcations
   honestly (the Slant/Clusters honest-non-local patterns).

   > **⚠️ The corpus had already answered this, and the figure is the
   > argument's problem** (`assert-that-tiers-bind`, 2026-09-08). Asked how
   > often the hand-written generators actually miss their tier,
   > `difficulty-contract.test.ts` dealt a board from every preset whose tier
   > it can read and required its lowest solving cap to *be* that tier:
   > **282 of 285 preset cases bound exactly, by hand, across 39 hand-written
   > generators.** So "the only thing the driver can do" is offering a
   > correctness guarantee against a defect that occurs in roughly 1% of cases.
   > **This build must now argue economy — per-game lines removed — not
   > correctness**, which is a different and much harder case to make.
   >
   > **And the one real failure was on the side nobody was watching**, which is
   > a defect class this projection's framing does not name. Undead's generator
   > was honest; its *difficulty contract* was wide — `solveAtCap` ran
   > arc-consistency unbounded where the generator bounded it at three passes —
   > so every Normal board graded as Easy-solvable while every Undead test
   > passed. A rule with two spellings and nothing making them meet is not
   > fixed by owning the strip/accept loop; it is fixed by the two spellings
   > being made to meet.
4. **Hint** — the same fixpoint with the recorder on: each firing becomes a
   plan step via its own `narrate`. One firing, one step, legs flagged. The
   plan lifecycle (one hint per request, keep-track verdicts, refresh of
   stale steps, resume from any position, step budgets) is framework-owned
   and identical for every game.
5. **Refuse & check** — `findMistakes` for a unique-solution game is derived:
   solve from the clues once (memoized per game id), diff the player's
   entries. Games whose mistakes are rule-violations rather than
   solution-divergence declare **invariants** — `detect`/`highlight`/`narrate`
   triples — which feed live-error rendering, `findMistakes`, and the hint's
   refusal banner from one definition. A hint asked on a mistaken board
   refuses, banners, and lights the mistakes — the existing coupling, now
   universal.

## Non-deductive games declare a planner

A movement/permutation game has no forced firings; it declares a **Planner**:
`plan(state, aux?): Step[]`, each step narrated by the consequence it actually
has, holding a stable subgoal the game marks when it cannot name it (the
Inertia bar). The framework owns the same plan lifecycle as projection 4, plus
the two guards such plans have already needed:

- **Recompute-stability is a contract, not advice.** A recomputed plan from a
  one-step-advanced state must pursue the same subgoal (monotone potential,
  never plan-caching). The conformance suite drives every planner one step
  forward and asserts subgoal stability — the oscillation Inertia shipped
  becomes a red test, not a review catch.
- **Claim only what you checked.** A planner's narration is a set of claims;
  each must be code-verified. The suite cannot check truthfulness generically,
  but it does check that every step's named subgoal exists on the board it
  narrates.

Sliding-permutation games get the existing shared planner as a framework
organ; a game with no solver at all recovers its answer from the board where
possible (the Netslide pattern) before being allowed the weaker fallbacks.

## Substrates: candidate boards and the Latin family

Between "raw board" and "your game" the framework offers substrates — board
families with their techniques, moves and UX pre-built:

- **CandidateBoard** — cells with a candidate set (pencil marks). Brings: the
  full note-taking UX, populate/cleanup steps, the naked-single-first
  ordering rule, the "re-derive a placement's why" rule (a recorded `single`
  reason lies about *why*), mark-all semantics, and the shared
  strike/place plan readers. Undead-style games (own deduction set, candidate
  cells) sit directly on this.
- **LatinBoard** (on CandidateBoard) — row/column uniqueness, the generic
  Latin technique set with shared narrations where wording is genuinely
  identical (today's `narrateLatinReason` rule: share verbatim-identical
  arms, keep divergent voices local), the three generator shapes, holes for
  pseudo-Latin games, and seeded constraints for clue classes that restrict
  without placing.

A substrate is a library, not a cage: a game takes the substrate and adds its
own techniques above/below/between the shared rungs; ordering is the game's
single ladder declaration.

## A game may have two move sets, and the projections split across them

*(Substrate note from `add-galaxies-hint`, 2026-08-11.)* The contract above
assumes the technique's conclusion and the move that records it are the same
thing. Galaxies is the counter-example: its deductions are about **which dot
owns a cell**, its win condition reads **walls only**, and the association it
deduces is consequence-free notation the completion check never sees. A hint
projection built from the technique alone is sound, teaches well, and never
finishes a board — the resume guarantee is what catches it.

What a framework would have to carry for this shape:

- **A technique declares which move set records it**, and a game declares how
  a *notation* move set discharges into a *goal* one. In Galaxies that bridge
  is itself a technique ("two neighbors settled on different dots ⇒ a wall
  between them"), which suggests the framework needs nothing new here beyond
  *knowing* that the plan is not complete until the goal move set is.
- **The completion driver must judge the goal move set**, not the number of
  techniques fired. Today's `hint-resume.test.ts` already does exactly this,
  which is why the gap was visible in minutes rather than at acceptance.
- **A move that claims more than the cell it is aimed at** (Galaxies commits a
  cell's 180° partner in the same move) makes the "one firing, several legs"
  journey shape *illegal* rather than merely unnecessary: the extra leg is a
  no-op, and the no-op-free-plan guarantee rejects it. A framework emitting
  journeys automatically would have to ask the move set what a move already
  covers before splitting a firing into legs.

## Escape hatches carry obligations

The shared fixpoint's recorded no-gos are real, and the framework's answer is
not "fit anyway" — it is a bespoke-loop hatch with three non-negotiable
obligations, enforced by the conformance suite.

*But there were six of them and there are now two, and the shrinkage is
evidence for this document's own claim that some are artifacts of the contract
rather than facts about the games.* `declare-deduction-techniques` shipped
`tier`, and **Unruly** stopped being a no-go. `re-derive-the-fixpoint-no-gos`
then read the five remaining solvers instead of their recorded reasons, and
**Singles, Clusters and Spokes adopted with no new option on the runner at all**
— their reasons had described C-shaped loops ("drains a queue", "three-valued
early-out", "an accumulated action count") rather than naming any promise the
runner makes. What survives is **Loopy** (each firing narrows which techniques
the next pass may attempt — it breaks *a pass attempts every technique at or
below the cap*) and **Lightup** (two techniques interleaved per cell inside one
load-bearing scan — it breaks *return after first firing*).

The lesson for this design: **a hatch is earned by naming the promise the game
breaks, never by describing how its loop looks.** The three obligations below
still bind, and one of them is currently unmet rather than satisfied — Loopy
ships no `hint()`, so its narratability obligation is *vacuous*, which is a live
gap against "nothing may ship hintless" and exactly the kind the conformance
suite is meant to make loud:

1. **Narratability survives.** However bespoke the loop, every accepted board
   must be walkable to completion by the hint projection: the suite generates
   N boards per preset and runs the hint to the end. A bespoke solver whose
   firings can't be narrated fails generation, not review.
2. **Grading stays honest.** Tiers must bind to real technique differences
   (the tiers-mean-something bar); a bespoke grader declares what each tier
   *means* and the suite checks capped generation produces boards the lower
   cap rejects.
3. **Budgets apply.** Step budgets and retry limits are framework-injected
   even into bespoke loops; non-termination fails loud.

**Tell** that you need the hatch (and not a redesign): you can name a promise
the runner makes that your loop must break. Two qualify — *a pass attempts every
technique at or below the cap* (threshold and skip protocols) and *return after
first firing* (scan-order-sensitive fusion, where the pass must sweep everything
before restarting).

**Tell** that you don't: your loop merely *looks* different. This half of the
Tell was written listing "accumulated-cost tiers" as a hatch case, and Spokes
falsified it — its accumulator turned out to be an early-out, not a grade, and it
adopted. A cost accumulated across firings, a flag standing in for a `-1`
return, a pre-pass at the top of each iteration, a verdict richer than a boolean:
all of these read as structural and all of them fit, because a technique can hold
state and guard itself. **Read the loop, not the reason somebody recorded for
it** — three of six no-gos were dissolved by exactly that.

## What this buys, measured against today

Today the five projections exist in most games as five wirings of one logic —
and the wiring is where the historical defects live: the hint that drifted
from the solver, the grader that ignored its cap, the findMistakes that
checked one of two mistake classes, the plan that oscillated on recompute.
The framework does not make the *logic* easier (a nonogram overlap is still a
nonogram overlap); it makes the wiring impossible to get wrong, and it makes
"this game has a full explained hint" a property of the type system plus the
generation driver rather than a per-game achievement. That is the trade this
whole directory exists to argue for.
