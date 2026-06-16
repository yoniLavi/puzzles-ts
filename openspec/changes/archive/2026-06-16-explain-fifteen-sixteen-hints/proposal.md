# Explain *why* in Fifteen & Sixteen hints

## Why

Per the hint quality bar (AGENTS.md, exemplar: Palisade), a good hint explains
*why* a move is valuable, not just *what* to do. Fifteen and Sixteen currently
state only the move:

- **Fifteen**: `"Slide tile 10 into the space"` — every step reads identically;
  the player learns nothing about the strategy.
- **Sixteen**: `"Move tile 10 to column 3, then to row 2"` — richer (it has
  journey continuity and landing cells) but still silent on *purpose*: is the
  tile reaching its final home, or being staged to make room for another?

Both games already use multi-leg `continuesPrevious` journeys, so the structure
is in place — the gap is the narration's explanatory depth. Closing it brings
the two earliest sliding-tile ports up to the standard Palisade set.

## What Changes

- **Fifteen hint narration** (`index.ts`): each step states whether the slide
  **places a tile in its final position** ("…putting tile 10 home") or is a
  **setup/maneuvering move** toward homing the current target tile ("…working
  tile 10 toward the top row"). Derived from the greedy solver's fill frontier
  (which tile it is currently homing, and whether this move lands it).
- **Sixteen hint narration** (`index.ts`): each step (and journey) states
  whether the move **lands the tile in its solved cell** ("…into its final
  place") or **stages** it ("…to set up the next move"). Derived by comparing
  the narrated tile's landing cell to its solved position.
- A shared, consistent **vocabulary** for home-vs-helper across both games
  (and aligned with the Palisade exemplar's tone), so the two read as one
  coherent hint voice.
- Behaviour, move sequences, highlights, `hintKeepTrack`, and pacing are
  **unchanged** — this is a narration enrichment only.

## Impact

- Affected specs: `fifteen` (MODIFIED: the greedy hint requirement),
  `sixteen` (MODIFIED: the heuristic-hint requirement).
- Affected code: `src/native/games/{fifteen,sixteen}/index.ts` (narration), with
  new unit tests asserting home-vs-helper wording; no solver/planner/render
  logic change.
- No engine change. Follows the `ts-engine` hint convention already in place.
- Design `design.md` flags the two derivation questions (Fifteen's "is this tile
  now permanently home?" frontier tracking; Sixteen's home-vs-stage labelling of
  a planned slide) to settle at implementation time next session.
