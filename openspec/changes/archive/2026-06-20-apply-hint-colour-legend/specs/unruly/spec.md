## ADDED Requirements

### Requirement: Unruly hint colour legend

When an Unruly hint is displayed, `redraw` SHALL distinguish the element types
the deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **forced cell** (the move) SHALL be filled `COL_HINT`, with the forced
  colour previewed as an inset square (and a grow animation while it is placed).
- The deduction's other **forced empty cells** in the same journey SHALL be
  shaded `COL_HINT_CELL` (applied only to still-empty cells).
- The **cited premise / pivotal cells** the deduction reasons over (the
  same-colour pair in `threes`, the completed quota in `complete`, the full
  reference line in `unique`, the reserved window in `nearcomplete`) SHALL be
  ringed `COL_HINT_REF`, not `COL_HINT` — so the cited premise is not drawn in
  the same colour as the forced move. The cell keeps its own appearance (a
  filled black/white cell stays visible; an empty reserved-window cell stays
  empty) underneath the ring.

Unruly uses a **single** premise ring colour (not a per-colour black/white
split): its ringed cells are not uniformly one decided colour — `unique` rings a
balanced line holding both colours and `nearcomplete` rings empty cells — so a
state-derived ring colour is ill-defined. The legend SHALL be consistent across
the four techniques. The `UnrulyHint` payload (`target`/`area`/`ring`) is
unchanged; the legend is a render concern.

#### Scenario: A cited premise rings distinct from the forced cell

- **WHEN** a `threes`, `complete`, or `unique` hint is displayed (filled premise
  cells force a move)
- **THEN** the cited premise cells are ringed `COL_HINT_REF` and the forced cell
  is filled `COL_HINT`, in different colours

#### Scenario: Forced journey cells stay shaded

- **WHEN** a hint forces several empty cells in one line (a `fillRow` journey)
- **THEN** the still-empty forced cells are shaded `COL_HINT_CELL`, distinct from
  both the `COL_HINT` target and the `COL_HINT_REF` premise ring
