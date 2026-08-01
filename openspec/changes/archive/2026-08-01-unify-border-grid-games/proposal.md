# unify-border-grid-games

## Why

**Palisade and Separate are the same game wearing two implementations.** Both
divide a grid into regions by marking the edges *between* cells with a tri-state
(wall / no-wall / undecided); they differ in what constrains the regions —
Palisade gives each cell a clue counting its walls, Separate gives each region a
required size and a set of cells that must be kept apart. The mechanic the player
operates is identical, and so is most of the code that implements it.

Measured with jscpd on 2026-08-01: **466 duplicated lines across 22 clone
blocks** between the two games — by a wide margin the largest cross-game
duplication in the repository, which totals 2,180 lines across all 57 games. The
single largest clone anywhere in the tree is here: **111 consecutive lines**,
`palisade/index.ts:98` against `separate/index.ts:88` — the whole of
`interpretMove`, including the closest-edge hit test, the `BORDER`/`DISABLED`
bit arithmetic, the YES→MAYBE→NO cycling, the paired edit of both cells adjacent
to an edge, and the keyboard-cursor half-cell coordinate scheme. The rest is
spread across `render.ts` (7 blocks, 126 lines), `state.ts` (7 blocks, 129
lines) and three further `index.ts` blocks.

**This is the case the standing refactor directive was written for.** The owner's
2026-07-14 directive says to extract when "the shared shape will stay stable
indefinitely, or will need to evolve the same way across multiple games", and
that "makes the codebase noticeably cleaner" is sufficient on its own. Border
marking on a square grid is about as stable a shape as this collection has — it
is upstream's, it has not changed, and there are exactly two consumers who would
both need any change to it. A bug fixed in one game's edge hit test today is
silently absent from the other; that has already been true for the lifetime of
both ports.

**It is also the safest possible extraction**, because both games have frozen
differential fixtures. Border-marking input handling does not touch generation,
so a correct extraction is a **no-op against every fixture and every snapshot** —
which makes the test suite a genuine oracle here rather than merely a net. If a
differential moves, the extraction is wrong.

## What Changes

- **Extract a shared border-grid module** into `src/native/engine/` covering the
  mechanic both games share: the `BORDER`/`DISABLED`/`FLIP` bit vocabulary, the
  closest-edge hit test from a pointer coordinate, the YES/MAYBE/NO cycle for
  left and right button, the paired two-cell edit an edge toggle produces, and
  the half-cell (`2x+1`, `2y+1`) cursor coordinate scheme with its select
  handling.
- **Both games consume it**, keeping their own clue semantics, solver,
  generator, completion check and rendering of clues entirely per-game. Only the
  edge mechanic moves.
- **Extract the shared `render.ts` and `state.ts` blocks only where they are
  genuinely the same mechanic**, not merely textually identical — see the design
  note on the difference.
- **Re-measure.** The change states its before/after cross-game clone lines
  against the `establish-refactor-baseline` snapshot.

Explicitly **not** in this change: unifying the two games' solvers (they solve
different constraint systems and share nothing but the substrate), their
generators, their clue rendering, or their difficulty tiers. And not a general
"grid game framework" — two consumers with an identical mechanic justify a module,
not an architecture. The scene-graph postmortem is the precedent for why the
larger version of this idea does not follow from the smaller one.

## Impact

- Affected specs: `palisade`, `separate` (each gains a requirement that the
  shared mechanic is shared).
- Affected code: a new engine module; `palisade/{index,render,state}.ts` and
  `separate/{index,render,state}.ts`.
- **No behaviour change whatsoever is intended.** Both games' differentials and
  render snapshots must pass **unmodified**. A snapshot needing `-u` is the
  signal that the extraction changed something, and is a defect in this change,
  not a baseline to update.
- Player-visible: nothing. This is the rare refactor with a hard oracle, which is
  precisely why it is worth doing first among the structural changes.
