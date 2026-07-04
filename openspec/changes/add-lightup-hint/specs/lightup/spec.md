# lightup Specification (delta)

## ADDED Requirements

### Requirement: Light Up ships an explained deductive hint

The game SHALL implement `hint()` returning a plan of narrated steps computed
by the game's own solver techniques from the player's current position
(honouring placed bulbs and impossible-marks), refusing on a solved board and
on a board with detectable mistakes (coupling to the `findMistakes` overlay
and the banner). Each step SHALL name its technique and meet the Palisade
quality bar: lead with the recognisable indication, state why the move is
forced, conclude in the necessity voice, one deduction firing = one step (a
clue firing that forces several squares is one grouped multi-cell step). The
narrated techniques SHALL cover at minimum: forced-light (an unlit square
with one remaining way to be lit), clue-satisfied (a full clue crossing out
its remaining neighbours), clue-saturated (remaining bulbs = remaining
spaces), and the overlapping-set discount (a candidate square that would
extinguish every way to satisfy an unlit square or a clue). Steps that rule
squares out SHALL emit the game's impossible-mark move, so the accumulated
marks externalise the deduction state on the board. `hintKeepTrack` SHALL
classify a player's partial completion of a multi-cell step as on-track and
shrink the step in place. No displayed step may be a generic, un-narrated
fallback.

#### Scenario: A forced bulb is explained

- **WHEN** the plan reaches a square with exactly one remaining way to be lit
- **THEN** the step's move places that bulb, and its narration names the
  unlit square and why every other candidate is gone, concluding with a
  necessity modal

#### Scenario: A satisfied clue groups its marks

- **WHEN** a clue already adjacent to its full bulb count has k > 1 free
  neighbours
- **THEN** one step emits one move marking all k squares impossible, narrated
  as a single deduction

#### Scenario: Refusal on a wrong board

- **WHEN** `hint()` is invoked on a board where `findMistakes` is non-empty
- **THEN** it refuses with an error, and the mistake overlay is displayed

#### Scenario: The plan completes deductive boards

- **WHEN** the plan is computed on any generated Easy or Tricky board
- **THEN** following it step-by-step solves the board with no un-narrated step

### Requirement: Light Up hint rendering follows the element-type legend

The displayed hint SHALL highlight, not perform: target square(s) filled
`COL_HINT` blue with no bulb/mark preview (bulb targets and mark targets look
identical; the narration says which action), the deduction's evidence — the
corridor of sight or the clue's free neighbours, computed against the board
as that step fires — shaded `COL_HINT_CELL`, with the driving clue's digit
visible on its shaded cell. Hint colours SHALL be appended past the upstream
colour enum (the dark-mode overrides target indices 2 and 3), and every hint
bit SHALL participate in the per-tile render cache diff key.

#### Scenario: Evidence is visible as an area

- **WHEN** a forced-light step is displayed
- **THEN** the target square renders `COL_HINT` with its content un-obscured
  and the corridor it reasons over renders `COL_HINT_CELL`

#### Scenario: A hint step's marks stay inside its evidence

- **WHEN** any grouped clue step is displayed
- **THEN** every target square lies within the narrated clue's neighbour set

### Requirement: No non-Unreasonable Light Up tier requires guessing

Light Up SHALL comply with the `ts-migration` narratable-deduction generation
policy: every difficulty tier offered under a name other than `Unreasonable`
SHALL generate only boards solvable by the narrated deductive techniques with
no recursion. The current Hard tier (recursion-requiring by construction)
SHALL be resolved by measurement plus one of the sanctioned remedies — rename
to `Unreasonable` (labels only; generation and the byte-match differential
unchanged), or promotion of single-level forcing to a narrated externalized
technique — chosen by the owner with the depth-distribution numbers in hand.
On boards of an `Unreasonable` tier the hint MAY narrate the deductive prefix
and then refuse honestly at the guess point.

#### Scenario: Deductive tiers are hint-complete

- **WHEN** a board is generated at a non-`Unreasonable` tier
- **THEN** the hint's narrated techniques solve it to completion

#### Scenario: The guess tier is honestly named

- **WHEN** a tier's boards require recursion to solve
- **THEN** that tier is offered only under the name `Unreasonable`
