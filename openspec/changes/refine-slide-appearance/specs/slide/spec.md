# slide Specification Delta — refine-slide-appearance

## ADDED Requirements

### Requirement: Slide's board reads by colour, not only by bevel

The floor, the walls, the ordinary blocks and the main block SHALL be
distinguishable from one another by fill, not solely by their bevels, in both the
light and the dark presentation. Upstream derives all four from the single host
background, which its own author records as "wishy-washy"; this project's display
code is free to correct that.

The target marker SHALL remain the pale, most prominent thing on the board, since
it names the goal. The exit marking SHALL be legible at the smallest shipped tile
size. The solver's next-piece indication SHALL read as an ordering cue rather than
as the brightest element of the frame.

Every colour SHALL come from the shared palette, and SHALL be checked in both
schemes — a fill that reads as contrast against a light background must not read
as a bright patch against a dark one.

#### Scenario: The pieces are told apart without relying on bevels

- **WHEN** the board is rendered in either colour scheme
- **THEN** floor, wall, ordinary block and main block each read as a distinct
  fill, and the target marker remains the most prominent

#### Scenario: The next-piece cue does not dominate the frame

- **WHEN** the solver indicates the next piece to move
- **THEN** that piece is marked without being the brightest element on the board
