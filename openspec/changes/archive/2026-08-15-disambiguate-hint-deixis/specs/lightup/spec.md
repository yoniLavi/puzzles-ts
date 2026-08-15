# lightup Specification Delta — disambiguate-hint-deixis

## MODIFIED Requirements

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

**A discount narration SHALL describe the set it is discounting as the
deduction counts it.** The set of squares one of which must hold a bulb
includes, for an unlit square, **that square itself** wherever a bulb could
still be placed there — it lights itself. Because the display rings that square
rather than shading it, a narration that says only "the shaded squares" can
light it names fewer candidates than the deduction rests on, and is false on
the boards where the ringed square is a member. The sentence SHALL therefore
say which of the two shapes it means, and SHALL state the premise its
conclusion needs — that one of those squares must hold the bulb — rather than
leaving the reader to supply it.

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

#### Scenario: A discounted square's narration counts every candidate

- **WHEN** a discount step's rule-out set contains the ringed unlit square
  itself, so that only the *remaining* members are shaded
- **THEN** the narration names the ringed square alongside the shaded ones as
  a place the bulb could go, rather than attributing the whole set to the
  shaded squares

#### Scenario: Refusal on a wrong board

- **WHEN** `hint()` is invoked on a board where `findMistakes` is non-empty
- **THEN** it refuses with an error, and the mistake overlay is displayed

#### Scenario: The plan completes deductive boards

- **WHEN** the plan is computed on any generated Easy or Tricky board
- **THEN** following it step-by-step solves the board with no un-narrated step
