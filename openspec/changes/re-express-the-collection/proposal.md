# re-express-the-collection

Realizes: `docs/framework-rdd/migration.md` § "Order of adoption", step 4 —
*"then the full sweep, in family batches: every game is re-expressed"*.

**Readiness: the argument stands; the object changed, and that is an owner
question.** This was written as the change that ports the existing games into
the framework, blocked until the exemplars hardened the contract.

> **There is no framework definition to port them into** (2026-09-06). All four
> declarations have reported: rows 1 and 2 shipped as **helpers a game calls**,
> rows 3 and 4 were withdrawn, and
> `adopt-the-game-definition-adapter` — which was to build the capability diff
> this change depends on — is withdrawn with them
> (`openspec/postmortems/2026-09-06-game-definition-adapter-withdrawal.md`).
>
> **Everything below that matters survives**, because none of it mentions a
> definition object: the corpus-is-the-documentation argument, the comparative
> acceptance test, the two guards, the two-lane acceptance, and the
> capability diff — which needs no manifest and is a few lines off
> `testing/enrollment.ts`'s `builtGames()`, already memoized across all 57.
>
> **What changed is the route.** A game now adopts a shared shape by *calling*
> it, so the sweep batches by **concern** rather than by **family** — and in
> that form it is not a future event. It has been running for a month:
> `adopt-conventional-tier-names` (29 games), `unify-cross-game-vocabulary`,
> `unify-the-note-taking-cell` (11), `unify-the-note-taking-vocabulary` and
> `unify-the-board-origin` (8) are each one pass of exactly the convergence this
> change describes, each independently valuable, each archived alone.
>
> **The question for the owner, who made this call on 2026-08-07.** The decision
> was *every game is re-expressed*, in family batches, rather than games
> adopting at their leisure — and the stated reason was that a mixed tree
> manufactures a fork in the road at every reading. Per-concern convergence
> reaches the same end state and honors that reason **better** on one axis: it
> never leaves a mixed tree standing for longer than a single change, whereas a
> family sweep leaves one for the length of the sweep. It is worse on another:
> there is no moment when someone can say the collection is done, because the
> list of concerns is open.
>
> So: **is continuous per-concern convergence what was wanted, or is a bounded
> family-batch sweep still the goal?** This change should not be started, split
> or closed until that is answered. It is owner-named work and the answer
> decides whether this remains one change, becomes a tracking umbrella for the
> per-concern changes, or is closed as already-in-progress.

## Why

**A mixed tree is worse than either end of the migration.** The argument is not
tidiness — it is that in this repo the corpus *is* the documentation. A new game
gets written by reading the nearest existing one, so a tree where half the games
declare and half hand-roll manufactures a fork in the road at every reading, and
the wrong turn gets copied. That is the owner's stated reason (2026-08-07) for
sweeping everything rather than letting games adopt at their leisure.

**The characteristic risk is silent capability loss**, not breakage. A
re-expression that drops a game's keypad, its reference aid or its mistake
checking still compiles, still plays, and still passes most of its tests. At a
scale of 57 that is the failure that will actually happen, which is why the
capability diff must exist **before** the first game moves, whatever route this
takes.

It needs no manifest and no adapter. `testing/enrollment.ts`'s `builtGames()`
already returns, for all 57 games, the live game object and the `Ui` its `newUi`
actually returned; the set of optional `Game` members a game *has* plus the `Ui`
fields it carries is a snapshot off that, and a derived set cannot be forgotten
by the re-expression that drops a member — which is the whole reason a declared
one would have been weaker (`audit-declared-versus-derived-capabilities`).

## This is where the dictum is cashed

AGENTS.md § "Convention over configuration" states the goal; **this change is
the one that actually delivers it across the collection**, because the corpus is
the documentation. A new game is written by reading the nearest existing one, so
until the 57 agree, "one obvious way to do it" is a claim no reader can verify —
they can see five ways and no marking of which is meant.

**The acceptance test is therefore comparative, not per-game**: pick any two
games that mean the same thing and ask what still differs between them. Every
remaining difference must be one somebody can defend as belonging to the puzzle.
A difference nobody can defend is a fork in the road for whoever reads them next,
and a wrong turn that gets copied.

**Two guards against this change eating itself.** It is a 57-game sweep, which is
exactly the shape that hides a regression in a green suite — so the bulk-edit
rule applies at full strength (assert every changed line is the one intended kind
of change, then read the exceptions), and the acceptance bar applies per family:
**run the games**. `adopt-conventional-tier-names` is the cautionary tale at 1/57
scale — a 29-game rename whose full gate passed twice while two games' menus were
visibly wrong, because the words had been retyped somewhere no test looked.

**And the batches are families for a reason**: family-at-a-time is what lets the
comparative test above be applied by eye, by one reader, in one sitting.

## What Changes

- **Family batches**, not alphabetical: the Latin family, edge games, planner
  games, and the bespoke-hatch cases each move together, so one contract lesson
  applies to a whole batch.
- **Two-lane acceptance** (`migration.md`, owner 2026-08-07): a re-expression
  whose entire guard set passes **unchanged** — frozen differentials byte-clean,
  narration strings byte-clean, render snapshots untouched — is machine-provably
  invisible and gets batched spot acceptance. One that re-baselines even a
  single snapshot takes the full owner-acceptance gate. **The scarce resource is
  owner time, not AI labor**, and this spends it only where behavior could have
  moved.
- **A capability diff per game**, derived from `builtGames()` — built before the
  first game moves, not alongside it.
- **Games that keep a hatch still converge on everything else.** Untangle and
  Cube keep bespoke input and render; that is what a hatch is for, and it has
  never been a reason to exempt a game from the shared vocabulary, the tier
  names or the cursor contract.

## Impact

- Affected specs: `ts-migration`, and every per-game spec that describes
  structure rather than behavior.
- Affected code: all 57 game directories, in batches.
- **Enormous blast radius, which is why the ordering above is load-bearing.**
  The three migration invariants apply per game and per batch, whatever the
  route: ids byte-stable, narrations byte-identical, snapshots explainable.
  They are `migration.md`'s, not the withdrawn adapter's, and they survive it.
- **This change should be split**, and the per-concern changes already archived
  are what a split looks like — one pass, independently valuable, archivable
  alone. Keeping this as a single unit through implementation would violate the
  repo's own "one change per coherent unit of work", and a 57-game change cannot
  be reviewed or reverted.
