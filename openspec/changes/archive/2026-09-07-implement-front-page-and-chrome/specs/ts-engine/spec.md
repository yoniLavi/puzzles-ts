# ts-engine Specification Delta — implement-front-page-and-chrome

## ADDED Requirements

### Requirement: The midend reports where a displayed hint sits in its journey

When a hint step is on display, the midend SHALL report its position within the
**journey** it belongs to, and the journey's length, so the chrome can say
"Step 2 of 3" while one deduction plays out over several moves.

A journey is the unit this collection already has: the step on display plus
every following step the game flagged `continuesPrevious` ("One deduction firing
is one journey"). The midend SHALL derive it by walking back to the first step of
that run and forward to the last — never from anything a game declares for this
purpose, because `continuesPrevious` is already set by the games that group their
steps, for their own reasons.

The position SHALL NOT be the index within the stored plan. For a plan-based
game the stored plan is the whole tour, and "Step 3 of 47" is a fact about the
solver rather than about the hint the player is looking at. A game that never
groups its steps therefore reports a journey of length 1, and the chrome shows
nothing.

The report SHALL be absent when no step is displayed, so a stale position cannot
sit beside a board with no hint on it.

#### Scenario: A multi-leg deduction reports its progress

- **WHEN** a hint plan's steps 2 and 3 are flagged `continuesPrevious`
- **AND** the first step is displayed
- **THEN** the midend reports position 1 of 3
- **AND** after a move completes that step, position 2 of 3

#### Scenario: A single-leg hint reports a journey of one

- **WHEN** the displayed step is flagged neither as a continuation nor followed
  by one
- **THEN** the journey length is 1, and the chrome shows no step counter

#### Scenario: No hint is displayed

- **WHEN** no hint step is on display
- **THEN** no journey position is reported at all
