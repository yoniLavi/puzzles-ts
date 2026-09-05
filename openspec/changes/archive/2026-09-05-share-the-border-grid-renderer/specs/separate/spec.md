# separate — deltas for share-the-border-grid-renderer

## MODIFIED Requirements

### Requirement: Separate shares its border-marking mechanic rather than owning a copy

Separate SHALL obtain the grid-edge marking mechanic it shares with Palisade from
a shared engine module rather than from its own copy: the border/disabled bit
vocabulary and direction tables, the closest-edge hit test from a pointer
coordinate, the undecided→wall→no-wall tri-state cycle under left and right
button, the paired edit of the two cells adjacent to a marked edge, and the
half-cell keyboard cursor coordinate scheme.

**The mechanic's *look* is shared on the same terms**, and for the same reason:
the board geometry, the four three-valued edge rects, the tile skeleton around
them, the half-cell cursor the module already moves, and the live error model —
a region larger than the target size, one smaller, or a wall that separates
nothing. Those are properties of the marking mechanic, not of Separate, and a
change to what counts as a wrong wall SHALL take effect in both games at once.

Separate's region constraints (required region sizes and the cells that must be
kept apart), its solver, its generator and its **clue** rendering SHALL remain
entirely its own — the letter, the repeated-letter error inside a completed
region, and the test that decides when a region is finished. The shared renderer
SHALL take Separate's palette indices and a callback for the middle of a tile,
and SHALL NOT branch on which game is drawing.

Adopting the shared module SHALL NOT change any board Separate generates or any
frame it draws: its differential fixtures and render snapshots SHALL pass
unmodified. **The same standard binds the rendering extraction, and binds it
harder**, because a tier-2.5 snapshot records every draw call with its
coordinates and its resolved color: sharing the look either changes no draw call
or it is wrong.

#### Scenario: The shared mechanic is adopted without moving a board

- **WHEN** Separate is changed to consume the shared border-grid module
- **THEN** every Separate differential fixture passes without modification
- **AND** every Separate render snapshot passes without `vitest -u`

#### Scenario: The games' move formats stay independent

- **WHEN** the shared module reports which edge a pointer or cursor action
  targets and how its state should cycle
- **THEN** each game constructs its own `Move` from that description
- **BECAUSE** a shared move type would couple two save formats that have no
  reason to be identical

#### Scenario: A game adopting the input mechanic adopts its look

- **WHEN** a game uses the shared border-grid input mechanic
- **AND** its sources never reference the shared border-grid renderer
- **THEN** the build fails, naming that game
- **BECAUSE** two hand-written renderers of one mechanic is the state this
  module exists to end, and nothing else can see a third being written
