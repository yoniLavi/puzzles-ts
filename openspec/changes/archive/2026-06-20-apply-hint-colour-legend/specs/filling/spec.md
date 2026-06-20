## ADDED Requirements

### Requirement: Filling hint colour legend

When a Filling hint is displayed, `redraw` SHALL distinguish the element types
the deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **target square(s)** (the move) SHALL be filled `COL_HINT` as a *mild*
  highlight with **no digit drawn**, so the cell reads as a call to action ("fill
  here"), not as a pre-printed answer.
- The cited **region** premise (the numbered cells a deduction grows or blocks,
  or the neighbours that rule out a value) SHALL be shaded `COL_HINT_CELL` with
  the cell's **digit drawn on top** — the digit is the non-colour cue and stays
  readable, which is why Filling shades premises rather than ringing them.

A firing that forces several target squares fills them all `COL_HINT`
(equivalent moves share one colour). The legend SHALL be consistent across the
deduction kinds (`growth` exact/partial, `blocked`, `lonely`, `bitmap`).

#### Scenario: The empty target reads distinct from the shaded premise

- **WHEN** a `growth` hint names a region of N and the empty squares it must grow
  into
- **THEN** the target squares fill `COL_HINT` with no digit, and the cited region
  shades `COL_HINT_CELL` with its digits drawn on top, in different colours

#### Scenario: Grouped target squares share one colour

- **WHEN** one deduction forces several empty squares at once
- **THEN** every forced square fills the same `COL_HINT`, not distinct colours
