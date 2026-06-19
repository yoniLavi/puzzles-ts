## ADDED Requirements

### Requirement: Singles hint colour legend

When a Singles hint is displayed, `redraw` SHALL distinguish the element types
the deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **forced cell(s)** (the move) SHALL be filled `COL_HINT` with no
  number/mark preview drawn.
- An **undecided number premise** (the matching numbers a deduction reasons
  over) SHALL be shaded `COL_HINT_CELL`, the cell's digit drawn on top.
- A cited **decided black ("shaded square") premise** SHALL be ringed
  `COL_HINT_BLACKREF`; a cited **decided white/circle ("ringed white square")
  premise** SHALL be ringed `COL_HINT_WHITEREF` — so a deduction that names both
  a shaded/marked premise and the forced cell does not draw them in the same
  colour. The ring colour SHALL be chosen from the cell's own decided state.
- The **protected corner** of a corner deduction SHALL remain `COL_HINT_STRAND`.

The legend SHALL be consistent across deductions (a shaded-square premise is the
same colour in every hint that cites one). The `SinglesHint` payload
(`targets`/`evidence`/`strand`) is unchanged; the legend is a render concern,
and the three highlight roles remain disjoint.

#### Scenario: A cited shaded square rings distinct from the forced cell

- **WHEN** an `adjBlack` hint is displayed (a shaded square forces an adjacent
  cell white)
- **THEN** the cited black premise is ringed `COL_HINT_BLACKREF` and the forced
  cell is filled `COL_HINT`, in different colours

#### Scenario: A cited ringed white square uses the white-reference colour

- **WHEN** a `sameLine` or `boxedIn` hint is displayed (a ringed white square is
  the reason)
- **THEN** the cited white/circle premise is ringed `COL_HINT_WHITEREF`

#### Scenario: Number premises and corners are unchanged

- **WHEN** a hint cites undecided matching numbers, or a corner deduction
  protects a corner
- **THEN** the numbers shade `COL_HINT_CELL` (digits on top) and the protected
  corner stays `COL_HINT_STRAND`, as before
