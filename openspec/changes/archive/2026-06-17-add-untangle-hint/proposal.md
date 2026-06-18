# Proposal: Add a move hint + animation to Untangle

**Status**: Proposed

## Why

The Untangle TS port (`add-untangle-ts-port`, 2026-06-17) shipped with no
`hint()` — its design noted there is "no deductive solver to narrate, and crossed
edges drawn red ARE the mistake feedback". The owner asked for a hint+animation
anyway, accepting that Untangle is **not** a deductive puzzle: a hint here is a
*suggested move*, not a forced deduction, so it deliberately ships **without the
explanatory "why" narration** the Palisade quality bar mandates. This is an
explicit, owner-approved divergence from that bar for a non-deductive game.

The animation half is essentially free: Untangle already animates vertex moves
(`mix()` interpolation over `ANIM_TIME`, the `animLength` hook), and the midend
already stretches a hint-executed move to the uniform hint-step duration. A hint
move rides that existing pipeline, so auto-hint reads as the vertex sliding into
place.

A first cut used only a local crossing-reduction heuristic (centroid of
neighbours). Owner testing found it **clustered vertices in the centre and stalled
without fully untangling**, badly on the larger boards (n=25). The clustering is
the Tutte/barycentric smoothing fixed point (no pinned boundary); the stalling is
inherent greedy local-minimum behaviour. The robust fix is to use the **known
solution** when available, so this change makes the aux solution the primary hint
and keeps the heuristic only as a fallback.

## What Changes

- **Engine: `Game.hint` receives `aux`.** The hook becomes
  `hint?(state, aux?)`; the midend passes its stored `aux` (the generator's
  solution hint, the same value handed to `solve`). Additive — existing deductive
  games ignore the second argument. Present for freshly-generated games, absent
  for descriptive game ids / some loaded saves.
- **`hint.ts` (new): aux solution primary, heuristic fallback.**
  - **Aux plan (when a solution is known).** The board has a unique solution up to
    the 8 dihedral symmetries, so the best hint walks the player to it. Take the
    dihedral image of the solution closest to the current positions (least
    motion), **rescale it to fill the play box** (a uniform scale preserves
    planarity, so the result is crossing-free *and* maximally spaced — fixing both
    the clustering and the failure-to-progress), then emit a plan that places
    vertices one at a time, greedily choosing the order that keeps intermediate
    crossings lowest. The end state is the full rescaled solution: **guaranteed
    untangled**.
  - **Heuristic fallback (no aux).** Greedy crossing-reduction with a spread
    tie-break: among vertices on a crossed edge, take only strictly
    crossing-reducing moves; each candidate offers the neighbour centroid plus
    outward-pushed variants, and among equally-untangling targets prefer the one
    that most reduces a pairwise clustering score (Σ 1/(distance+ε)) so it spreads
    rather than collapsing. May stall at a local minimum (which is why aux is
    preferred). `findCrossings` now also returns the crossing-pair count for this
    objective.
- **`index.ts`: `hint(s, aux)` wired; `solve` refactored.** The aux parse +
  dihedral-symmetry match are extracted to `state.ts` (`parseAux`,
  `dihedralSolvedUnits`) and now shared by both `solve` and the hint. `hint`
  refuses (`{ ok: false }`) when already solved (or, on the fallback path, when no
  move reduces crossings). Steps carry an **empty explanation** and a
  `{ vertex, to }` highlight. No `hintKeepTrack` (the default `"off"` verdict
  drops the plan on any player move and the next request recomputes).
- **`render.ts` renders the hint.** The displayed step draws a `COL_HINT` line
  from the hinted vertex to its suggested destination and a `COL_HINT` marker at
  the destination; an auto-hint shows the line shrink as the vertex slides. The
  hint signature folds into the full-frame redraw early-out so a manual hint (no
  position change) still repaints.
- **Tests**: tier-1 (aux plan fully untangles *and* fills the box on n=10 and
  n=25; aux preferred over the heuristic; heuristic-fallback plan reduces
  crossings; refusal on a solved board) and tier-2.5 (`renderScenario({ showHint })`
  reaches a hint frame; assert the `COL_HINT` line + marker plus a snapshot).

## Impact

- **Affected specs:** `untangle` (ADDED: move hint + animation requirement),
  `ts-engine` (MODIFIED: the Hint System hook gains the optional `aux` argument).
- **Affected code:** `src/native/games/untangle/{hint,index,render,state}.ts` and
  tests; `src/native/engine/{game,midend}.ts` (the `aux` argument). The midend
  `ActiveHint` lifecycle, the hint-move animation stretch, and the shell
  Hint/Auto-Hint buttons already exist. Parity-gated: shipped for owner
  acceptance, additive to the already-shipped port.

## Out of scope

- **An explained "why" narration.** Untangle has no deduction to teach; the
  visual highlight + motion *is* the hint. Approved divergence from the Palisade
  bar for a non-deductive game.
- **One-vertex-at-a-time learning hints.** The aux plan moves every misplaced
  vertex (a full guided solve) rather than teaching a technique — Untangle has
  none. A single manual Hint still advances just one vertex at a time.
