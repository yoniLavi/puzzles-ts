# declare-the-gesture-table

Realizes: `docs/framework-rdd/game-definition.md` § "Moves and gestures".

**Readiness: needs exploration first.** Highest ergonomic payoff of the
definition-end pieces, and the highest design risk. Task 0 is an
`/opsx:explore`.

## Why

**This is the declaration that turns an audit obligation into a resting state.**
The input-parity bar (owner, 2026-08-03) says every move a player can make by
pointer must also be reachable by keyboard and touch. Today that is enforced by
*auditing* — `audit-input-mode-parity` swept the collection, `input-parity.test.ts`
guards it, and each new game has to be checked. The vision derives keyboard and
touch equivalents from a declared gesture table instead, so parity is what you
get rather than what you verify.

**And the evidence for it is unusually good, because the audit already ran.**
`audit-input-mode-parity` (2026-08-29) left reusable measurements and found a
cross-game defect that was fixed a layer down (`ignoresSecondaryButton` — a held
finger was throwing away a game's gestures). Its `audit.md` is the closest thing
the collection has to a catalog of the gesture shapes actually in use, which is
exactly the input `game-definition.md` assumes when it says the table is *"drawn
from a named library of the gesture shapes the collection has already needed"*.

**The four frontend traps are the argument for centralizing.** Stylus stripping,
hold-as-right-button, bare-digit binding and focus return are documented in
`docs/games/input.md` as things every game must get right; each is a place a new
game can silently be wrong. A library handles them once.

## The decision this removes

Judged by AGENTS.md § "Convention over configuration": *which decision does this
take off the porter's desk, and would two games ever legitimately answer it
differently?*

- **"What are the keyboard and touch equivalents of this gesture?"** — the
  parity bar says they must exist, and today the porter answers it per game, from
  scratch, and the collection finds out by *audit*. A gesture drawn from a named
  library brings its own equivalents, so the answer arrives with the
  declaration. **This is the piece with the highest ratio of decisions-removed
  to framework added**, because the obligation is already collection-wide and
  only its *satisfaction* is per-game.
- **"Which of the four frontend traps applies here?"** — a trap is a decision
  nobody wants to make and everybody must; each one a declaration absorbs is a
  wrong turn that can no longer be taken. `escape-was-a-dead-key` and
  `a-held-finger-throws-away-a-games-gestures` were both fixed a layer down
  precisely because they were never per-game questions.

**What must stay free to differ**: what a gesture *means* in this game. Cycling a
cell, painting a region, picking a transformation — the mapping is the game's,
and Sixteen's drag-to-slide is the named falsifier for any library that cannot
express it.

**Watch for the failure this change can produce**: a table that expresses the
easy 80% and forces the rest through an escape hatch is not one obvious way, it
is two ways plus a seam. Measure the escapers before committing to the shape —
"a shared form escaped by more games than it serves is not a win" is the same
test `declare-params-and-presets` sets itself.

## What to explore first

- **Is the gesture library real, or is every game bespoke?** Read the
  `interpretMove` implementations and classify: click-cycles, drag-paints,
  right-click-marks, press-picks-transformation, and whatever else is actually
  there. If the long tail dominates, the table is a worse abstraction than the
  function it replaces. `audit-input-mode-parity`'s `audit.md` is the starting
  point, but it answered a different question and must not be read as if it
  answered this one.
- **What does a derived keyboard binding do about conflicts?** Two gestures
  claiming the same key is a per-game judgment; a derivation needs a rule.
- **Sixteen's drag-to-slide is the named falsifier.** `migration.md` lists
  *"the derived gesture layer cannot express a real game's input without more
  declaration than the `interpretMove` it replaces"* as a thing that would end
  this direction, and names Sixteen as the test. Try it early, not last.

## Impact

- Affected specs: `ts-engine` (input), `repo-layout`.
- Affected code: `src/engine/pointer.ts`, `key-labels.ts`, per-game
  `interpretMove`.
- **Player-visible.** Input is how the game feels; a derived binding that
  changes what a key or a drag does is an owner-acceptance matter, not an
  implementation detail. Expect to run the app, on touch as well as pointer.
