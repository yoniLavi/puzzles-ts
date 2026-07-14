# netslide

## MODIFIED Requirements

### Requirement: Netslide renders the displayed hint step

`redraw` SHALL show the current hint step: the tile being placed highlighted, the
cell the plan is taking it to marked, and the slide arrow the player should press
drawn in the hint colour. A destination the tile genuinely belongs in SHALL be
marked distinctly from one it is only passing through, so a setting-up move never
reads as the answer. Hint colours SHALL be appended past the upstream colour enum
so the game's palette stays index-for-index with it.

The hint overlay SHALL be part of the render cache's diff key, so it repaints on
the frame the hint is requested even though the underlying tiles did not change
that frame.

The two marks SHALL behave differently while a slide animates, because they mark
different kinds of thing:

- The **tile** mark marks a *tile*, which is moving, so it SHALL travel with the
  tile it marks. While the hinted slide is animating, the displayed step's
  `tile` cell is the cell the tile set off *from* — the midend advances the plan
  when the animation ends — so `redraw` SHALL mark the cell the slide lands it in,
  and SHALL NOT mark the vacated cell, which by then holds a different tile.
- The **destination** mark marks a *cell*, which is not moving, so it SHALL stay
  where the cell is while the line slides underneath it, and SHALL NOT be drawn
  with the animation's offset.

#### Scenario: A hint repaints on a board that did not otherwise change

- **WHEN** a board is drawn, a hint is then requested, and the same draw state is
  redrawn
- **THEN** the hint highlight appears on that second paint

#### Scenario: The tile mark travels with the tile mid-slide

- **WHEN** a frame is captured partway through the slide the displayed hint step
  asked for
- **THEN** the tile highlight is drawn on the tile being placed, at the offset
  position that tile is drawn at — not on the cell it has left

#### Scenario: The destination mark stays put mid-slide

- **WHEN** a frame is captured partway through a slide whose line contains the
  cell the hint is taking the tile to
- **THEN** that cell's outline is drawn at the cell's own position, unshifted by
  the animation
