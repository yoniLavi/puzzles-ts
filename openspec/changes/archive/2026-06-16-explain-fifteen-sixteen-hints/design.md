# Design

## Context

The hint quality bar (AGENTS.md, exemplar: Palisade) asks every game's `hint()`
to explain *why* a move is forced/valuable. Fifteen and Sixteen were the first
sliding-tile ports; their hints emit correct plans with `continuesPrevious`
journeys but narrate only the move. This change enriches the narration only —
no plan, highlight, `hintKeepTrack`, or pacing change.

Current state (grounding):
- Fifteen `hint()` (`index.ts` ~446): greedy `computeHint` loop; each step is
  `{ move, explanation: "Slide tile N into the space", highlights: { tile } }`.
  The solver (`solver.ts`, faithful `compute_hint`/`next_move`) fills the shorter
  of top row / left column tile-by-tile.
- Sixteen `narrateStep()` (`index.ts` ~1469): already computes the narrated
  tile, its landing cell, journey continuation (`continuesPrevious`), and a
  second-leg preview ("then to row 2"). Narration: "Move tile N to column C[,
  then to row R]".

## Goals / Non-Goals

- **Goal**: each step says whether it *places a tile home* or *stages/maneuvers*
  toward homing a tile, in a shared vocabulary, matching the Palisade voice.
- **Non-Goal**: changing which moves the hint chooses, the highlights, the
  tracking, or the pace. Same plan, richer words.
- **Non-Goal**: an engine change — the journey mechanism already carries this.

## The home-vs-helper distinction

Two move kinds to narrate:
- **Home move** — after the move, the slid/narrated tile sits in its final
  solved cell and the solver will not disturb it again.
- **Helper / setup move** — the move repositions a tile (or, in Fifteen, the
  gap) to enable a later home move; it does not land a tile permanently home.

### D1 — Fifteen: derive the kind from the greedy frontier (RESOLVED)

The greedy solver homes tiles in fill order, so at any board there is a
**current target tile** it is working toward home and a **locked region** of
already-homed cells the solver won't touch. A step is a **home move** iff the
tile it slides *is* the target and lands in its solved cell; otherwise it is a
**helper move** (nudging the target itself closer, or repositioning another
tile/the gap to serve the target).

**Decision:** option (b) — `computeHint` now also returns `target` (upstream's
`nextpiece`), a one-field extension that keeps `solver.ts` a faithful port
without duplicating its frontier loop. Home detection: `tile === target &&
board.gapPos === target - 1` (the slid tile lands at the old gap; tile `t`'s
solved cell is index `t - 1`). We label "home" *only* when the slid tile is the
target landing in place, so a coincidental landing of an off-target tile is
never overclaimed (conservative — see Risks).

**Refinement 1 (owner feedback 2026-06-15):** a target-tile slide that does not
land home is *not* automatically "closer". The greedy solver routinely pushes
the target **away** from its home for a step or two to walk the gap to the far
side of it (reported case: tile 8 one cell below its home slides *down*). So
compare the target's Manhattan distance-to-home before vs after the slide:
decrease → "slide it closer"; increase → "reposition it". (A single slide always
changes the distance by exactly ±1, so the two cases are exhaustive.) Without
this, "slide it closer" actively misleads on routing moves.

**Refinement 2 — stable goal (owner feedback 2026-06-15):** the per-step
`nextpiece` is *memoryless* and flips during the end-of-row/column rotation: to
place the last tiles of a line the solver temporarily displaces an already-home
tile, so `nextpiece` drops to that lower tile, then climbs back. Narrating the
goal as the raw `nextpiece` made the banner read "Working on tile 8" → "Working
on tile 7" → "Working on tile 8" and look like it lost the plot (owner trace:
displace 7 to route the gap for 8, re-home 7, then home 8). Fix: the `hint` loop
holds a **stable goal** = the running max of `nextpiece` until that goal is
actually homed, then resets. The displaced tile's restoration is narrated as a
sub-step of the same goal — *"Working on tile 8: slide tile 7 into place"* — and
"into place" wording is now used for *any* tile (goal or restored) that lands in
its own solved cell. So the four Fifteen tactics are: `slide it into place`
(goal homes), `slide it closer` / `reposition it` (goal moves, refinement 1),
`slide tile N into place` (a displaced tile is restored), `slide tile N out of
the way` (any other maneuver).

### D2 — Sixteen: label each planned slide home-vs-stage (RESOLVED)

`narrateStep` already knows the narrated tile and its landing cell. A step is a
**home move** iff its journey's *final* landing cell equals the tile's solved
cell (`finalPos = ultimatePos ?? targetPos; home ⟺ finalPos === tile - 1`); else
a **stage**. The why attaches to leg 0 of a journey; continuation legs carry no
why (leg 0 already did and is still on screen). A first leg that merely stages
but whose previewed second leg homes the tile reads as a home move. (Edge: a
3+-leg journey only previews one leg ahead, so leg 0 can under-claim a distant
home as "setting up" — accepted, it never *over*-claims.)

### D3 — Shared vocabulary (RESOLVED)

**Owner chose the goal:tactic voice** (2026-06-15): every step names the tile it
works toward home, then the tactic — *"Working on tile N: …"*. This fits Fifteen
naturally (where the slid tile is often *not* the goal tile) and reads
consistently in Sixteen (where goal and moved tile coincide). The shared element
— the `workingOn(tile)` prefix and the `(setting up)` staging marker — lives in
`src/native/engine/hint-vocab.ts`; the home/tactic verbs stay per-game because
the two games' grammar differs (Fifteen *slides* a tile aside/closer/into place;
Sixteen *moves* its tile to a line). Concrete wording:

- **Fifteen** — home: `Working on tile 3: slide it into place`; nudge (target
  moves nearer): `Working on tile 3: slide it closer`; reposition (target moves
  away to route the gap): `Working on tile 3: reposition it`; maneuver (a
  non-target tile slides): `Working on tile 3: slide tile 7 out of the way`.
- **Sixteen** — home: `Working on tile 5: move it to column 3, its final spot`;
  stage: `Working on tile 5: move it to column 3 (setting up)`; journey:
  `Working on tile 7: move it to row 1, then column 2 (setting up)`;
  continuation leg: `Working on tile 7: then to column 2`.

(Earlier drafts used `Slide tile N into the space` / `Move tile N to column C`
with a trailing "into its final place" / "setting up later moves"; rejected as
awkward — *"to work tile 3 toward home"* in particular — in favour of the
goal:tactic restructure above.)

## Related engine fix — uniform 1s hint animation (owner 2026-06-16)

Surfaced while playing the improved Fifteen hints: auto-hint had a long frozen
gap between steps. Cause — the auto-hint loop dwells `AUTO_HINT_STEP_MS` (1s) per
step, but the engine stretched a hint move only by a *fixed 2.5× scale*, so
Fifteen's 0.13s base slide became 0.325s of motion followed by ~0.68s of frozen
board. (Sixteen's 0.4s base → 1.0s happened to fill the dwell, which is why only
Fifteen looked wrong.) Fix in `midend.ts`: replace the fixed `HINT_ANIM_SCALE`
multiplier with a fixed target *duration* `HINT_ANIM_S` (1.0s, = the dwell) —
every animated hint move now spans the whole step as continuous motion, with the
per-move `animScale = HINT_ANIM_S / base` kept so `redraw`'s `animTime/animScale`
progress still maps correctly. Manual moves are untouched (un-stretched). This is
a shared-engine change but strictly an improvement for every game and the
original "pace auto-hint uniformly" intent; `fifteen-midend.test.ts` locks
Fifteen's hint move at 1.0s vs its 0.13s manual move.

## Risks

- **Mislabelling**: calling a stage move a "home" move would mislead worse than
  saying nothing. Unit tests must assert, on concrete boards, that a known
  final-placement step narrates "home" and a known maneuvering step does not.
- **Over-narration**: keep continuation legs short (the first leg gives the
  reason); don't repeat the *why* on every leg of one journey.
