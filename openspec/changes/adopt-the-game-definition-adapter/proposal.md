# adopt-the-game-definition-adapter

Realizes: `docs/framework-rdd/migration.md` § "What already exists, and what it
becomes" + § "Order of adoption".

**Readiness: blocked on the declarations.** This is how a definition becomes a
playable game; it needs at least params and gestures to exist first. Scaffolded
now so the ordering is recorded, not so it is started next.

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
