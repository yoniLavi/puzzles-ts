# adopt-the-game-definition-adapter

Realizes: `docs/framework-rdd/migration.md` § "What already exists, and what it
becomes" + § "Order of adoption".

**Readiness: blocked on the declarations.** This is how a definition becomes a
playable game; it needs at least params and gestures to exist first. Scaffolded
now so the ordering is recorded, not so it is started next.

> **Open question this change now has to answer first: does the definition
> object need to exist at all?** (Raised 2026-09-05, after row 2 shipped.)
>
> Two rows have now landed, and **neither needed an adapter or a definition
> object**. `derive-difficulty-from-the-technique-ladder` shipped as a function
> games call. `declare-params-and-presets` shipped as a segment list a game
> passes to a helper, adopted one game at a time, with the other 38 games
> untouched and playing. Both removed per-game surface; neither required a
> compiler, a big-bang migration, or anything to abort.
>
> That is evidence against this change's premise — *"the adapter is the whole
> trick that makes this migration abortable"* — because a helper nobody calls
> is already abortable, at zero cost. It is **not** proof: rows 1 and 2 were the
> two easiest declarations, and the argument that survives is the
> **capability-manifest diff**, which needs somewhere to read a game's declared
> capability set from and is the named guard against `re-express-the-collection`'s
> characteristic risk.
>
> **The criterion that settles it** — did a declaration need to know about any
> *other* declaration to do its job? If each keeps standing alone, this change
> is a manifest reader and not an adapter, and `re-express-the-collection` is N
> small per-concern adoptions rather than one sweep. If one cannot be expressed
> without reaching for another, the definition object is real and this change
> stays as written.
>
> **The criterion has now been applied, and there is no declaration left to
> apply it to.** It was to be settled by `declare-the-gesture-table`, withdrawn
> 2026-09-05, and then by `declare-the-board-model` — the one most likely to be
> reached *for* rather than to reach. That change was withdrawn on 2026-09-06
> (`openspec/postmortems/2026-09-06-board-model-withdrawal.md`), and the reason
> bears directly on the criterion: **the board every other concern would have
> reached for is not a declaration and never was.** A game gets its board by
> importing `src/engine/grid/` when it is a planar graph, by indexing a typed
> array when it is not, its cursor from `pointer.ts`, and its coordinate pair
> from `geometry.ts`. Rows 1, 2, 3 and 4 are now four for four: every concern
> the vision expected to compose into a definition object either shipped as a
> helper a game calls, or declined to exist.
>
> **What that leaves this change as.** Nothing has been found that one
> declaration cannot express without another, so on its own stated criterion
> this is a manifest reader rather than an adapter, and
> `re-express-the-collection` is N small per-concern adoptions rather than one
> sweep. The remaining question is the capability diff, and
> `audit-declared-versus-derived-capabilities` has since reported that a derived
> set serves it — see the paragraph above. **Settle this change (as a
> withdrawal, or as whatever the capability diff still needs) rather than
> waiting on a fifth declaration; there is no longer one coming.**
>
> The withdrawal is weak evidence on the "stands alone" side and should be
> weighed as weak: input was the concern most plausibly needing the board
> model's geometry, and it turned out not to want a declaration at all — the
> sharing it wanted was a *mechanic* module (`border-grid.ts`-shaped), which
> reaches for nothing. That is one concern declining to join, not four
> declarations proving independent.
>
> **Three more concerns have since stood alone, 2026-09-05/06**, and they are
> worth weighing together because they were not chosen to make this point:
> `border-grid.ts`'s input mechanic, `border-grid-render.ts` (its look), and
> `note-taking-cell.ts` across eleven games. Each is a module a game *calls*;
> none reaches for another declaration; the three hardest integrations — a
> crossword direction flip, a highlight held in element space, a hint layer
> that must draw under the shared edges — were each solved by composing *around*
> a helper, in ways a declaration cannot express without growing hooks.
>
> **And the manifest-diff argument may not need a manifest.** It is the strongest
> surviving reason for a definition object, and the reason is that
> `re-express-the-collection` needs somewhere to read a game's capability set
> from. A *derived* set can be snapshotted and diffed the same way, and cannot be
> forgotten by a game that has the capability — which is the direction
> `derive-hint-enrollment` and `audit-input-mode-parity`'s removal of
> `needsRightButton` both already went. `audit-declared-versus-derived-capabilities`
> is checking exactly that, and this change should not be settled before it
> reports, because its answer removes or keeps the last argument here.
>
> Do not settle it from rows 1 and 2 alone — they are the rows least likely to
> need each other.

## Why

**The adapter is the whole trick that makes this migration abortable.**
`migration.md`: a framework definition *compiles to* a `Game` object, so "the
midend, worker, app shell and save formats do not change at all in phase one".
That property is what lets one game be re-expressed without the other 56
noticing, and what lets the direction be withdrawn if an exemplar shows
contortion. Without it, adopting the framework is a 57-game commitment taken on
faith.

**It must be co-developed with one real re-expression, not built first.** The
repo's own precedent is the TS midend, co-developed with Flip;
`migration.md` restates it. An adapter built against the fiction and *then*
pointed at a game will fit the fiction. So this change ships the adapter **and**
the first game through it, and the game's differential is the adapter's proof.

**The first game should be chosen to test the adapter, not to flatter it.** The
same rule as the board model: a Latin game fits by construction and would teach
nothing. `migration.md` proposes one exemplar per family — a Latin game, an edge
game, a planner game, and Loopy as a bespoke-hatch proof — and the *first* should
be whichever most nearly breaks it.

## What this owes the dictum

AGENTS.md § "Convention over configuration" asks of every framework piece which
decision it takes off the porter's desk. **This one takes none** — it is the
mechanism the others are delivered through, and its job is to make sure they can
be delivered *one at a time*.

That is the requirement to hold it to: **a game must be able to adopt one
declaration without adopting the rest.** An adapter that only compiles a
*complete* definition turns every declaration into a big-bang migration and makes
"decline this declaration" (which `declare-the-board-model` may well conclude)
impossible to act on. Partial adoption is what keeps each convention independently
justifiable, and it is what makes the whole migration abortable — which is
already this change's own stated argument.

**The tell that it has gone wrong**: a game's definition has to state something
it does not care about in order to state the thing it does.

## What Changes

- **The adapter**: a definition compiles to the `Game` interface the midend
  already consumes. No change to midend, worker, app shell or save format.
- **The capability-manifest diff**, from `migration.md`: a re-expression asserts
  the game declares the same capability set before and after — hints, mistakes,
  prefs, keypad, reference aid, difficulty tiers. **This is the guard against the
  characteristic sweep risk**, which is silent capability loss, and it should be
  built here rather than when the sweep starts, because the sweep is when it is
  too late.
- **One re-expressed game**, with its frozen differential byte-clean and its
  narration strings byte-identical.

## Impact

- Affected specs: `ts-migration`, `ts-engine`.
- Affected code: a new adapter under `src/engine/`, one game directory.
- **The invariants that must not move** (`migration.md`, restated because they
  are the acceptance criteria): every existing game keeps its byte-stable
  `params:desc` and `params#seed` ids; narration strings are byte-identical
  through a re-expression; tier-2.5 render snapshots move only where a change is
  intended.
- **If the first exemplar needs contortion, that is the finding**, and the
  honest outcome is a postmortem rather than a hatch. This change should be as
  willing to end the direction as to advance it.
