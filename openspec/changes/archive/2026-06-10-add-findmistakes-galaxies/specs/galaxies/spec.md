## ADDED Requirements

### Requirement: Galaxies detects and highlights mistakes

Galaxies SHALL implement the engine's `findMistakes` hook. It SHALL
recover the puzzle's unique solution by solving a cleared copy of the
state (dots only) to its canonical tile→dot partition, then SHALL flag,
covering **both** ways the game is played:

- every **tile** the player has associated (`F_TILE_ASSOC`) with a dot
  different from the solution's dot for that tile; and
- every interior **wall** the player has set (`F_EDGE_SET`) whose two
  adjacent tiles the unique solution assigns to the **same** region (a
  boundary drawn inside a single galaxy).

Tiles the player has not yet associated and walls the player has not
drawn SHALL NOT be flagged — they are incomplete, not mistaken. If the
cleared copy does not solve to a unique solution (only possible for a
hand-entered non-unique board), Galaxies SHALL flag nothing.

Galaxies SHALL render the flagged tiles and walls with a distinct
mistake highlight, drawn while the engine supplies the mistake list and
cleared on the next transition by the engine's mistake lifecycle.

> Wall detection is essential, not optional: Galaxies is commonly played
> by drawing region boundaries with no association arrows at all, and a
> mistake-check blind to walls would let a wrong wall-only board pass as
> clean.

#### Scenario: A wrong association is flagged

- **WHEN** the player associates a tile with a dot other than the one the
  unique solution assigns it, and invokes mistake-checking
- **THEN** Galaxies flags exactly that tile (and its 180° partner if the
  player likewise mis-associated it) and the renderer highlights it

#### Scenario: A correct partial board is clean

- **WHEN** every association the player has made matches the solution,
  though the board is not yet complete
- **THEN** Galaxies flags no cells and mistake-checking reports zero

#### Scenario: A wall inside a single region is flagged

- **WHEN** the player draws an interior wall between two tiles that the
  unique solution places in the same region, and invokes mistake-checking
- **THEN** Galaxies flags that wall and the renderer highlights it in the
  mistake colour — even when the board has no association arrows at all

#### Scenario: A wall on a true region boundary is clean

- **WHEN** the player draws an interior wall that the unique solution
  also has (a real boundary between two different regions)
- **THEN** Galaxies does not flag it

#### Scenario: A solved board is clean

- **WHEN** the player has completed the board correctly
- **THEN** mistake-checking reports zero (and the engine's lifecycle has
  already cleared any prior highlight on the solving move)
