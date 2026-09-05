# palisade — deltas for share-the-border-grid-renderer

## MODIFIED Requirements

### Requirement: Palisade shares its border-marking mechanic rather than owning a copy

Palisade SHALL obtain the grid-edge marking mechanic it shares with Separate from
a shared engine module rather than from its own copy: the border/disabled bit
vocabulary and direction tables, the closest-edge hit test from a pointer
coordinate, the undecided→wall→no-wall tri-state cycle under left and right
button, the paired edit of the two cells adjacent to a marked edge, and the
half-cell keyboard cursor coordinate scheme.

**The mechanic's *look* is shared on the same terms**, and for the same reason:
the board geometry, the four three-valued edge rects, the tile skeleton around
them, the half-cell cursor the module already moves, and the live error model —
a region larger than the target size, one smaller, or a wall that separates
nothing. Those are properties of the marking mechanic, not of Palisade, and a
change to what counts as a wrong wall SHALL take effect in both games at once.

Palisade's clue semantics (each cell's count of adjacent walls), its solver, its
generator, its difficulty grading and its **clue** rendering SHALL remain
entirely its own — the digit, the clue-satisfaction test that decides when a
region is finished, and the explained hint's own marks. The shared renderer SHALL
take Palisade's palette indices and a callback for the middle of a tile, and
SHALL NOT branch on which game is drawing.

Adopting the shared module SHALL NOT change any board Palisade generates or any
frame it draws: its differential fixtures and render snapshots SHALL pass
unmodified. Input handling is downstream of generation and touches none of it, so
a correct extraction is a provable no-op — a snapshot that requires
re-baselining is evidence the extraction is wrong, not a new baseline. **The same
standard binds the rendering extraction, and binds it harder**, because a
tier-2.5 snapshot records every draw call with its coordinates and its resolved
color: sharing the look either changes no draw call or it is wrong.

#### Scenario: The shared mechanic is adopted without moving a board

- **WHEN** Palisade is changed to consume the shared border-grid module
- **THEN** every Palisade differential fixture passes without modification
- **AND** every Palisade render snapshot passes without `vitest -u`

#### Scenario: A fix to the shared mechanic reaches both games

- **WHEN** a defect is found in the edge hit test or the tri-state cycle
- **THEN** it is fixed once in the shared module
- **AND** both Palisade and Separate receive the fix, rather than one game
  silently retaining the defect

#### Scenario: The explained hint survives the shared renderer

- **WHEN** a hint step is displayed
- **THEN** the edges it forces paint in the hint color, over their normal
  three-valued states
- **AND** the cells it references are outlined inside the cell body
- **AND** its narration is unchanged
