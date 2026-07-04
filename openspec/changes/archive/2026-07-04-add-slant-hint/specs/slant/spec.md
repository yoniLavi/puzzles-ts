# slant Specification (delta)

## ADDED Requirements

### Requirement: Slant ships an explained deductive hint

The game SHALL implement `hint()` returning a plan of narrated steps computed
by the game's own solver techniques from the player's current position (the
solver seeded with the placed diagonals), refusing on a solved board and on a
board with detectable mistakes (coupling to the `findMistakes` overlay and the
banner). The plan SHALL be computed with the recorder off leaving the
generator's solve path byte-identical (the byte-match differential unchanged).

Each step SHALL name its technique and, for the glance-able techniques
(clue-counting, loop avoidance, dead-end avoidance), meet the Palisade quality
bar: lead with the recognisable indication, state why the move is forced,
conclude in the necessity voice. One deduction firing = one journey; a clue
firing that forces several squares SHALL be one multi-leg journey
(`continuesPrevious` legs), not several independent hints. The equivalence
technique (a square locked to the same slant as an already-filled square) MAY
use the honest non-local "locked-slant" narration — naming the technique and
citing the anchor square without reconstructing the full v-shape/pairing chain
— since it is not a single glance-able step and Slant has no on-board mark to
externalise the chain. No displayed step SHALL be a generic, un-narrated
fallback: the plan draws only on the four move-producing techniques of the
ported solver.

#### Scenario: A clue-counting firing is explained and grouped

- **WHEN** the plan reaches a clue whose remaining lines equal its remaining
  empty neighbours (or is already satisfied)
- **THEN** one journey fills all forced neighbours, its opening leg naming the
  clue and why the count forces the slant, concluding with a necessity modal,
  and continuation legs flagged `continuesPrevious`

#### Scenario: Loop and dead-end firings name the connectivity reason

- **WHEN** the plan reaches a square forced by simple loop avoidance or by
  dead-end avoidance
- **THEN** the step's narration explains that the ruled-out slant would close a
  loop (or seal points off from the grid's edge), and its evidence shades the
  connected chain / trapped components involved

#### Scenario: Refusal on a wrong board

- **WHEN** `hint()` is invoked on a board where `findMistakes` is non-empty
- **THEN** it refuses with an error and the mistake overlay is displayed

#### Scenario: The plan completes deductive boards

- **WHEN** the plan is computed on any generated Easy or Hard board
- **THEN** following it step-by-step solves the board with no un-narrated step

### Requirement: Slant hint rendering follows the element-type legend

The displayed hint SHALL highlight, not perform: target square(s) filled
`COL_HINT` blue with **no slash preview** (the diagonal is drawn only once
auto-hint applies the move), the deduction's evidence — the clue's
neighbourhood, the loop chain, the trapped components, or the locked
equivalence class, computed against the board as that step fires — shaded
`COL_HINT_CELL`, the driving clue's digit recoloured `COL_HINT`, and a cited
filled anchor ringed `COL_HINT_REF`. Hint colours SHALL be appended past the
upstream colour enum (the dark-mode overrides target other indices), and every
hint bit SHALL participate in the per-tile render-cache diff key.

#### Scenario: Evidence is visible as an area

- **WHEN** a clue-counting step is displayed
- **THEN** the target square(s) render `COL_HINT` with no slash drawn, the
  clue's digit recolours `COL_HINT`, and the reasoned neighbourhood renders
  `COL_HINT_CELL`

#### Scenario: Every step carries visible evidence

- **WHEN** any glance-able-technique step is displayed
- **THEN** it carries a non-empty evidence area or a ringed anchor, never a
  bare conclusion
