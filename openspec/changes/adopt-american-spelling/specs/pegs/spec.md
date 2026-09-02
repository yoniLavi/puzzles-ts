# pegs Specification Delta — adopt-american-spelling

## MODIFIED Requirements

### Requirement: Pegs derives its palette via the shared mkhighlight helper

The Pegs `colors()` method SHALL derive its background, highlight, and lowlight colors from the shared `mkhighlight` helper in `src/engine/color/color-mkhighlight.ts`, with no local copy of the derivation.

#### Scenario: Pegs colours on a near-white host

- **WHEN** the host background is near-white
- **THEN** the shared helper shifts the background away from pure white
- **AND** the Pegs palette's COL_HIGHLIGHT is visibly brighter than COL_BACKGROUND
