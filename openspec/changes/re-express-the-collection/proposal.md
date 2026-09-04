# re-express-the-collection

Realizes: `docs/framework-rdd/migration.md` § "Order of adoption", step 4 —
*"then the full sweep, in family batches: every game is re-expressed"*.

**Readiness: blocked, and deliberately last.** This is the change that ports the
existing games into the framework. It must not start until the exemplars have
hardened the contract: `migration.md` is explicit that *"a premature sweep
multiplies every contract change by 57"*.

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
capability-manifest diff is built in `adopt-the-game-definition-adapter` — one
change earlier, on purpose.

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
- **A capability-manifest diff per game**, from the adapter change.
- **Games that keep a hatch still adopt the definition.** Untangle and Cube keep
  bespoke input/render; the hatches are part of the framework and those games
  still gain conformance enrollment.

## Impact

- Affected specs: `ts-migration`, and every per-game spec that describes
  structure rather than behavior.
- Affected code: all 57 game directories, in batches.
- **Enormous blast radius, which is why the ordering above is load-bearing.**
  Every invariant from the adapter change applies per game and per batch: ids
  byte-stable, narrations byte-identical, snapshots explainable.
- **This change should be split** once the exemplars exist — one change per
  family batch, each archivable on its own. Keeping it as a single unit through
  implementation would violate the repo's own "one change per coherent unit of
  work", and a 57-game change cannot be reviewed or reverted.
