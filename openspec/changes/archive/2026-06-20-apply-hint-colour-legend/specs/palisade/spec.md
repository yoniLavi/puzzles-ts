## ADDED Requirements

### Requirement: Palisade hint colour legend

When a Palisade hint is displayed, `redraw` SHALL distinguish the element types
the deduction names using a stable colour legend, each colour paired with a
non-colour cue:

- The **forced edge(s)** (the move) SHALL be drawn `COL_HINT` as wall segments on
  the relevant cell borders. A firing that forces several equivalent edges draws
  them all in the same `COL_HINT` (equivalent moves share one colour — the legend
  governs element *types*, not distinct cells of one type).
- A cited **region** the deduction reasons over SHALL be shaded `COL_HINT_CELL`
  across its cells.
- A cited **clue** is identified by its **drawn digit** on the (shaded) cell — it
  is not given a separate fill colour, the same way a number premise is treated
  elsewhere; the digit is the non-colour cue.

No Palisade hint cites a *decided cell* that would otherwise collide with the
move colour, so no premise ring colour is needed. The legend SHALL be consistent
across the deduction rules.

#### Scenario: Forced edges and cited region are distinct

- **WHEN** a `notTooBig`/`notTooSmall`/`equivalentEdges` hint names a region and
  the edge(s) it forces
- **THEN** the forced edge(s) draw `COL_HINT` and the cited region shades
  `COL_HINT_CELL`, in different colours

#### Scenario: Equivalent forced edges share one colour

- **WHEN** one firing forces several edges that share a fate (e.g. all remaining
  edges of an exhausted clue)
- **THEN** every forced edge draws the same `COL_HINT`, not distinct colours
