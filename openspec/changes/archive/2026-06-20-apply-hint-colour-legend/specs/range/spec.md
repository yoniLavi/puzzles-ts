## ADDED Requirements

### Requirement: Range hint colour legend

When a Range hint is displayed, `redraw` SHALL distinguish the element types the
deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **forced cell** (the move) SHALL be filled `COL_HINT`, with the forced mark
  previewed as a shape — an inset black square for a forced black, a dot for a
  forced white.
- **Undecided premise cells** the deduction reasons over (a clue's line of sight,
  a reach run, the cells a cut would disconnect) SHALL be shaded `COL_HINT_CELL`.
- A cited **decided black square** premise (the adjacent black in an `adjacency`
  deduction) SHALL be ringed `COL_HINT_BLACKREF`, not `COL_HINT` — so a deduction
  that names both a shaded black premise and the forced cell does not draw them
  in the same colour. The cell stays black underneath; the teal ring is
  reinforcement.

The legend SHALL be consistent across deductions. The `RangeHint` payload
(`target`/`area`/`blackRefs`) and the narration text are unchanged; the legend is
a render concern.

#### Scenario: A cited black square rings distinct from the forced cell

- **WHEN** an `adjacency` hint is displayed (a black square forces an adjacent
  cell white)
- **THEN** the cited black premise is ringed `COL_HINT_BLACKREF` and the forced
  cell is filled `COL_HINT`, in different colours

#### Scenario: Undecided premises stay shaded

- **WHEN** a `satisfied`, `overrun`, `reach`, or `connect` hint cites a clue's
  visible white cells or the cells a cut would disconnect
- **THEN** those undecided premise cells are shaded `COL_HINT_CELL`, distinct
  from both the target and any cited black square
