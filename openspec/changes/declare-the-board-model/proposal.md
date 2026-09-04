# declare-the-board-model

Realizes: `docs/framework-rdd/game-definition.md` § "The board model".

**Readiness: exemplar-gated.** The largest and least-proven declaration, and the
one the vision itself names as most likely to fail. Do not start it before
`declare-the-gesture-table` has produced evidence, and do not start it without a
non-Latin game to build against.

## Why

**This is where the framework either generalizes or does not.** A board model
declaration is supposed to buy state allocation and cloning, the desc codec,
coordinate maps shared by input and paint, cursor movement, and geometry for
`computeSize` — the largest block of derived behavior in the whole vision, and
the one that most decides whether "adding a game" gets cheap.

**It is also the one the vision predicts will break.** `migration.md` lists,
under "what could falsify this design", *"the adapter forces contortion on the
first non-Latin exemplar (the Palisade re-expression is the test — edge games
are where 'cells with domains' assumptions die)"*. That is a specific,
checkable prediction, and it should be tested deliberately and early rather than
discovered at the end of a sweep.

**The collection already refuses a single board abstraction once.** `engine/grid/`
holds eighteen tilings, `border-grid.ts` serves edge games, Slant is a vertex
game, Galaxies has a two-move-set model where deductions are about cell
ownership and the win condition reads walls. `deduction.md` records that last one
as a substrate note. Any declaration that does not have an answer for all four
shapes is a Latin-family abstraction wearing a framework's clothes.

## The decision this removes

Judged by AGENTS.md § "Convention over configuration": *which decision does this
take off the porter's desk, and would two games ever legitimately answer it
differently?*

- **"How do I allocate and clone this state?"** — every game answers it, none
  answers it interestingly, and getting it wrong is an immutability bug rather
  than a puzzle bug.
- **"How do I map a pixel to a cell?"** — the answer must be *the same function*
  the painter uses, and today that is a discipline ("one function, both callers")
  rather than a structure. A declared coordinate map makes the wrong answer
  unavailable.
- **"How does the cursor move here?"** — half-grid and edge-cursor variants are
  re-derived per game and are pure topology.

**What must stay free to differ**: bespoke geometry, and every existing game's
desc codec — **byte-stable, permanently**, because a shared game ID is a promise
to players. This change may derive codecs for new games; it does not touch old
ones.

**This is the piece most likely to fail the dictum rather than serve it**, and
the vision says so. A board model that expresses squares and hexes cleanly while
Palisade, Slant, Loopy's eighteen tilings and Untangle's free graph all escape it
has not produced one obvious way — it has produced a majority idiom plus a
second, less-traveled path, which is the state we are in now with extra
machinery. **Hence exemplar-gated: pick the game chosen to break it, not the one
chosen to fit.** Declining this declaration outright, with the measurement
recorded, is a legitimate and valuable outcome.

## What to explore first

- **Pick the exemplar to fail against, not the one to succeed with.** Palisade
  (edge) or Slant (vertex) tests the model; Towers does not, because the Latin
  substrate already fits by construction.
- **Establish what `cloneState` actually costs today.** "No game writes
  `cloneState` again" is the claim; count the lines and the variation before
  believing it is worth a declaration.
- **Descs are player promises.** `migration.md`: existing games keep their
  byte-stable codecs permanently. A derived desc codec is for new games only, so
  the value here is mostly for the games that do not exist yet — which weakens
  the "port existing games into it" case for this declaration specifically and
  should be weighed honestly.

## Impact

- Affected specs: `ts-engine`, `ts-migration`.
- Affected code: `src/engine/grid/`, `geometry.ts`, per-game `state.ts`.
- **Highest-risk piece in the definition end.** It touches state
  representation, which every other part of a game reads. If the exemplar shows
  contortion, the honest outcome is a postmortem and a withdrawal — the
  scene-graph precedent — not a hatch for every game that does not fit.
