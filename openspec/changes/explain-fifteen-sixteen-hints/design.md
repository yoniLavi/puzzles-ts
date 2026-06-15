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

### D1 — Fifteen: derive the kind from the greedy frontier (OPEN)

The greedy solver homes tiles in fill order (shorter of top row / left column,
tile by tile), so at any board there is a **current target tile** = the
lowest-numbered not-yet-locked tile in that order, and a **locked region** of
already-homed cells the solver won't touch. A step is a **home move** iff the
tile it slides ends in its solved cell *and* that cell is (becoming) part of the
locked region; otherwise it is a **helper move** maneuvering the gap/target.

Open question for implementation: the cleanest way to compute "current target
tile" + "locked region" without duplicating solver internals — options: (a)
re-derive the frontier from the board each step (a small pure helper), (b) have
the solver expose the target it is working on. Prefer (a) if it's a few lines;
it keeps `solver.ts` a faithful port. Narration then reads e.g. *"Slide tile 4
home"* vs *"Slide tile 7 to work tile 4 toward the top row"*.

### D2 — Sixteen: label each planned slide home-vs-stage (OPEN)

`narrateStep` already knows the narrated tile and its landing cell. A step is a
**home move** iff the landing cell (for a journey, the journey's *final* landing
cell) equals the tile's solved cell; else a **stage**. The journey wording
already carries multi-leg paths, so the *why* attaches to the journey's
end: *"Move tile 10 to its place in column 3"* vs *"Move tile 10 to column 3
to set up the next move"*.

Open question: for a journey whose first leg is a stage but whose second leg
homes the tile, narrate the journey as a home move (the end state is home) — and
keep the continuation leg's short form consistent.

### D3 — Shared vocabulary

A small shared phrasing helper (or agreed constants) so both games use the same
words for home vs helper, aligned with Palisade's concise, advice-style voice.
Decide at implementation whether this lives per-game or as a tiny shared module
(only worth extracting if the wording is genuinely identical).

## Risks

- **Mislabelling**: calling a stage move a "home" move would mislead worse than
  saying nothing. Unit tests must assert, on concrete boards, that a known
  final-placement step narrates "home" and a known maneuvering step does not.
- **Over-narration**: keep continuation legs short (the first leg gives the
  reason); don't repeat the *why* on every leg of one journey.
