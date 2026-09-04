# characterize-the-hint-assessment-corpus

Realizes: `docs/framework-rdd/README.md` § "The order of work: refactor first,
then build" — the corpus this scopes is how the refactor gets judged.

## Why

**The hintless games are the framework's test corpus, not a backlog.** The owner
set the bar on 2026-09-04: *a new game implementation ships with a hint*, and
separately *some games are being kept hintless on purpose, so that implementing
those hints is the process by which the framework work is assessed.* That is a
sharper instrument than "close the gap" — a target contract is tested by writing
real hints against it, and a game with a working solver and no hint is exactly
the shape that tests it. Re-reading the thirty games that already have hints
tests nothing, because their hints were written against today's machinery.

**So the corpus needs characterizing before it can be used, and it currently is
not.** 27 of 57 games ship no `hint()`, and **19** of those hold a `solver.ts`:

```
abcd ascent bridges loopy magnets map mathrax mines mosaic net
pearl rect rome seismic separate signpost slide tents tracks
```

**That 19 is a grep heuristic and must not be carried into this change as a
finding.** It certainly over-counts: several of those solvers are searches or
movement planners rather than deduction ladders (`map`, `mines`, `net`,
`signpost`, `slide` at least), and the repo has been burned by exactly this
before — `adopt-shared-deduction-fixpoint` opened with "~29 candidates" and its
first task recorded that the figure "does not survive verification".
Establishing the real list is the **first task of this change, not an assumption
of it**.

**What makes a corpus useful is spread, not size.** A framework contract
assessed only against Latin-family games learns nothing about edge games; one
assessed only on deduction ladders learns nothing about planners. The point of
characterizing is to be able to *choose* — pick the game that will press hardest
on the part of the contract being tested, rather than the next one alphabetically.

## This corpus is how the dictum gets measured

AGENTS.md § "Convention over configuration" sets the goal — *one obvious way, no
unnecessary decisions* — and the honest problem with such a goal is that it is
easy to *believe* you have met it. A framework can move decisions around, dress
them in new vocabulary, and read as a great simplification to the person who just
built it.

**Writing a real hint for a game that has never had one is the measurement.**
The 27 hintless games are deliberately held for this. Every question the author
has to stop and answer that is *not about the puzzle's deductions* is accidental
complexity the framework still charges for — and the count of those questions,
recorded per game, is the only number here that means anything. A game that was
easy to hint because its neighbor had been hinted the same way is the dictum
working; a game whose author had to invent a convention is the dictum failing,
and the invention is the finding.

**This is why the corpus is characterized before the declarations harden, and
hinted after**: characterizing it now fixes the baseline, so the comparison is
against a measurement rather than a memory. It is also why "close the gap" is the
wrong framing — a hint written to tick a game off a list measures nothing.

## What Changes

- **Establish the real list.** For each game with a solver and no `hint()`,
  classify what its solver *is*: a deduction ladder (a hint is a projection of
  work that already exists), a search (a hint needs a narratable ladder built
  first — the `Unreasonable`-tier question), or a movement/objective planner
  (the Inertia bar, not the Palisade bar). Key on the **shape** of the solver,
  never on a name — AGENTS.md, "a scan that keys on a name finds only the games
  that were named that way".
- **Record, per game, what it would press on**: bespoke geometry, an edge/vertex
  board model, a planner's recompute-stability, a candidate substrate, a
  two-move-set game like Galaxies. That is the column that makes the corpus an
  instrument rather than a queue.
- **Note which are already pressed** by an adopted shipping change, so the
  corpus does not re-litigate settled ground.
- **Recommend an assessment order** — which two or three games to write hints
  for *first*, and what each would falsify about the framework contract if it
  went badly.

Explicitly not in this change: writing any `hint()`, changing any generator, or
proposing that a game stay hintless forever. The bar is forward-looking; this
change describes the corpus that exists behind it.

## Impact

- Affected specs: none. The deliverable is an `audit.md` plus a recommended
  order.
- Affected code: none.
- **Feeds directly into the `find`/`apply`/`narrate` exemplar choice**: that
  change needs one game to co-develop against, and picking it from a
  characterized corpus is the difference between an exemplar that tests the
  contract and one that merely satisfies it.
