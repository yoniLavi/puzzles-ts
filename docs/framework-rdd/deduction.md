# Techniques — one deduction engine, five projections

> **⚠️ STATUS: design fiction** — describes a system that does not exist.
> Authored by `rewrite-game-dev-docs` (2026-08-07). Current truth:
> [`docs/games/`](../games/README.md). See the [vision README](./README.md).

The centre of the framework. Everything a logic game "does" — solving,
grading, generating, hinting, refusing — is a projection of one declared
ladder of techniques. This document is the contract; it is deliberately the
longest of the set because it is where the collection's hardest-won rules
concentrate.

## The Technique contract

A technique is one named deduction a player could learn, with everything the
framework needs to run it, grade it, and *teach* it:

```
Technique<Board, Firing> {
  id: string          // stable, greppable: "hidden-single", "wall-parity"
  tier: number        // difficulty rung this technique defines/contributes to
  find(board): Firing | null      // the single next firing, or null
  apply(board, firing): void      // idempotent; mutates the working board
  narrate(firing, board): Narration  // REQUIRED — see below
}
```

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
4. **Hint** — the same fixpoint with the recorder on: each firing becomes a
   plan step via its own `narrate`. One firing, one step, legs flagged. The
   plan lifecycle (one hint per request, keep-track verdicts, refresh of
   stale steps, resume from any position, step budgets) is framework-owned
   and identical for every game.
5. **Refuse & check** — `findMistakes` for a unique-solution game is derived:
   solve from the clues once (memoised per game id), diff the player's
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
  is itself a technique ("two neighbours settled on different dots ⇒ a wall
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

The shared fixpoint's recorded no-gos (Loopy's threshold bookkeeping, Unruly's
constant-based grading, Singles' op-queue, Spokes' action-count tiers,
Clusters' three-valued early-out, Lightup's fused scan order) are real, and
the framework's answer is not "fit anyway" — it is a bespoke-loop hatch with
three non-negotiable obligations, enforced by the conformance suite:

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

**Tell** that you need the hatch (and not a redesign): your loop's bookkeeping
decides *which boards exist* — threshold protocols, scan-order-sensitive
fusion, accumulated-cost tiers. **Tell** that you don't: your loop merely
*looks* different but reads out only firings and a grade.

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
