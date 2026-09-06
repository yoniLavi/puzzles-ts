# Postmortem: the game-definition adapter, withdrawn without being started

**Date:** 2026-09-06
**Status:** Withdrawn. `adopt-the-game-definition-adapter` is deleted; the
definition object is dropped from the migration plan.
**Consequence for row 6:** `re-express-the-collection` **survives**, with its
object changed. See the last section — there is an owner question in it.

## TL;DR

This change proposed the adapter that compiles a framework *definition* into a
`Game` object, on the grounds that it "is the whole trick that makes this
migration abortable". It was blocked on the declarations having produced
something to adapt, and it carried its own settling criterion:

> **The criterion that settles it** — did a declaration need to know about any
> *other* declaration to do its job? If each keeps standing alone, this change
> is a manifest reader and not an adapter.

**Four declarations have now reported, and the answer is no, four times.**

| Row | Outcome |
| --- | --- |
| 1 `derive-difficulty-from-the-technique-ladder` | Shipped as a function games call |
| 2 `declare-params-and-presets` | Shipped as a segment list passed to a helper |
| 3 `declare-the-gesture-table` | Withdrawn; what it wanted was a *mechanic* module |
| 4 `declare-the-board-model` | Withdrawn; the board is `grid/`, `geometry.ts` and a typed array |

No declaration reached for another. There is no fifth coming, and the last
surviving argument for a definition object — the capability-manifest diff — has
been checked and does not need one.

**This postmortem required no new exploration.** It is the consequence of two
that already ran, plus three checks made against the tree today. That is worth
stating plainly, because a withdrawal reached by momentum rather than evidence
would look exactly like this one, and the difference is whether the checks were
made.

## The checks that were actually made

1. **`audit-declared-versus-derived-capabilities` did not settle this change; it
   fed it.** Its C5 says so in as many words — *"`adopt-the-game-definition-adapter`
   is fed, not pre-empted … the criterion it holds is untouched by this
   change."* So the criterion had to be applied here rather than assumed
   discharged.
2. **The derived capability surface exists and ships.**
   `src/contract-surface.test.ts` reads every optional member of the `Game`
   interface off the TypeScript AST, derives implementers from the live registry
   by `Object.hasOwn` on the real game object, and derives consumers from
   property-access nodes in every non-game module. Both halves carry a vacuity
   floor.
3. **A per-game capability set is a few lines off machinery that already ships.**
   `testing/enrollment.ts`'s `builtGames()` hands back, for all 57 games, the
   live game object *and* the `Ui` its `newUi` actually returned — memoized, so
   the 57 boards are generated once. A snapshot of "which optional members does
   this game have, and which `Ui` fields does it carry" is derivable from that,
   diffable across a re-expression, and **cannot be forgotten by a game that
   drops a capability**, which is exactly what a declared manifest can be.
4. **Nothing in the tree is an adapter today.** `registerGame` takes a plain
   `Game` object; there is no `defineGame`, no `GameDefinition`, no compile step.

## Why the premise had already failed

The proposal's load-bearing sentence is that without the adapter, "adopting the
framework is a 57-game commitment taken on faith". That was true of the
architecture it imagined and is not true of the one that shipped.

**There is nothing to make abortable, because nothing was ever at risk.** Rows 1
and 2 shipped as helpers a game calls, adopted one game at a time, with the
other 38+ games untouched and playing. A helper nobody calls is already
abortable, at zero cost. The property the adapter existed to buy arrived for
free the moment the declarations stopped being declarations.

And the shape it would have imposed runs against the repo's own dictum: **a game
joins a shared mechanic by *having* it, never by declaring that it has it**
(`AGENTS.md`). A definition object is precisely a statement that a game has
things, read by machinery rather than by the game. This project has now reversed
that shape four times — eighteen `needsRightButton` booleans deleted, the
gesture table withdrawn, the hint list derived, and the board model withdrawn —
and each reversal was recorded as a strengthening.

## What was steelmanned, and why it did not hold

**"Even if each declaration stands alone, a definition object gives the
scaffolder one place to fill in, and gives a reader one place to look."** The
scaffolder can generate a directory whose files call five helpers, which is the
same discoverability with none of the indirection — and it is what a reader of
the corpus already sees, since the corpus is the documentation here.

**"The adapter keeps the midend, worker, app shell and save formats
untouched."** They are untouched. Four rows have landed or been withdrawn and
not one of them proposed to touch them. The guarantee is real and it costs
nothing to keep, because nothing threatens it.

## What survives — and the owner question in it

**`re-express-the-collection` is not withdrawn, and it never needed the
adapter.** Its central argument stands untouched by any of this:

> in this repo the corpus *is* the documentation. A new game gets written by
> reading the nearest existing one, so a tree where half the games declare and
> half hand-roll manufactures a fork in the road at every reading, and the wrong
> turn gets copied.

So does its acceptance test, which is `AGENTS.md`'s dictum stated as a
procedure: *pick any two games that mean the same thing and ask what still
differs between them; every remaining difference must be one somebody can defend
as belonging to the puzzle.* Neither sentence mentions a definition object, and
neither needs one.

**What changed is the sweep's object.** Row 6 was written as "port 57 games into
the framework". There is no framework definition to port them into — there are
helpers, and a game adopts one by calling it. Which means the sweep is not a
future event: it is **already running, per concern**, and has been for a month —
`adopt-conventional-tier-names` (29 games), `unify-cross-game-vocabulary`,
`unify-the-note-taking-cell` (11), `unify-the-note-taking-vocabulary`, and
`unify-the-board-origin` (8) are each one pass of exactly the convergence row 6
describes, each independently valuable, each archivable alone.

**The owner question, which is not mine to answer.** The full sweep was an owner
decision (2026-08-07): *every game is re-expressed*, in family batches, rather
than letting games adopt at their leisure. That decision was made about a
framework that has since dissolved into helpers. Per-concern convergence reaches
the same end state — 57 games that agree — by a different route: it batches by
*concern* rather than by *family*, it lands continuously instead of in one
committed sweep, and it never has a mixed tree for longer than one change.

Whether that is what was wanted is the owner's call, and
`re-express-the-collection` now carries the question rather than assuming an
answer.
