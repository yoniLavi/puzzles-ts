# pegs Specification Delta — group-crowded-source-directories

> Path correction only. `colour-mkhighlight.ts` moves into `src/engine/colour/`.

## MODIFIED Requirements

### Requirement: Pegs derives its palette via the shared mkhighlight helper

The Pegs `colours()` method SHALL derive its background, highlight, and lowlight colours from the shared `mkhighlight` helper in `src/engine/colour/colour-mkhighlight.ts`, with no local copy of the derivation.

#### Scenario: Pegs colours on a near-white host

- **WHEN** the host background is near-white
- **THEN** the shared helper shifts the background away from pure white
- **AND** the Pegs palette's COL_HIGHLIGHT is visibly brighter than COL_BACKGROUND
