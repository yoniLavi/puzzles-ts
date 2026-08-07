# slide Specification Delta — refine-slide-appearance

## ADDED Requirements

### Requirement: Slide's board reads by colour, not only by bevel

The floor, the walls, the ordinary blocks and the main block SHALL be
distinguishable from one another by fill, not solely by their bevels, in both the
light and the dark presentation. Upstream derives all four from the single host
background, which its own author records as "wishy-washy"; this project's display
code is free to correct that.

Each SHALL be a function of the host background rather than an authored colour,
so that one inversion rule maps all four and their **ordering** survives the
scheme flip by construction. Only the two the help page names to the player —
the blue key block and the green exit — SHALL carry a hue; the others stay
neutral so they cannot compete with them.

The target marker SHALL remain the most prominent thing on the board, since it
names the goal. "Pale" is scheme-relative and is not the testable part: a tint
that is lighter than the board under a light scheme is *darker* than it under a
dark one, which is the relationship being preserved rather than a defect.

The exit marking SHALL be legible at the smallest shipped tile size, and SHALL
mark the gate's **boundary** rather than filling its squares, because the gate
usually lies on top of the exit area and two fills cannot both be seen.

The solver's next-piece indication SHALL read as an ordering cue rather than as
the brightest element of the frame, and SHALL leave the piece's own fill intact
so that it is not mistaken for a change of state.

Every colour SHALL come from the shared palette, and SHALL be checked in both
schemes — a fill that reads as contrast against a light background must not read
as a bright patch against a dark one.

#### Scenario: The pieces are told apart without relying on bevels

- **WHEN** the board is rendered in either colour scheme
- **THEN** floor, wall, ordinary block and main block each read as a distinct
  fill, and the target marker remains the most prominent

#### Scenario: The ladder inverts as a whole

- **WHEN** the board is rendered under the opposite colour scheme
- **THEN** the four fills keep their order relative to one another, reversed
  along with the board itself, rather than any one of them changing its place

#### Scenario: The exit gate is marked without hiding the exit

- **WHEN** a gate square also lies inside the exit area
- **THEN** the exit's tint is still drawn across that square, and the gate is
  marked only along the edges where it meets something that is not the gate

#### Scenario: The next-piece cue does not dominate the frame

- **WHEN** the solver indicates the next piece to move
- **THEN** that piece is marked without being the brightest element on the board,
  and keeps the fill it had before it was marked
