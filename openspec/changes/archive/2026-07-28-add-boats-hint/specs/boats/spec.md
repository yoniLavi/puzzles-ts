# boats Specification Delta — add-boats-hint

## ADDED Requirements

### Requirement: Boats explains its next deduction

Boats SHALL provide an explained hint that computes a plan of forced moves from
the player's current board and narrates each one by the deduction that forces it,
meeting the project's hint quality bar: the narration SHALL state *why* the move
is forced — the premise that singles out this conclusion — and not merely what to
place.

The hint SHALL be derived from the same deduction engine as the solver, replayed
one firing at a time, and SHALL NOT alter the solver, the generator or the
description codec.

Because the solver is not monotone in its difficulty cap, the hint SHALL replay
the deduction at the **lowest** cap at which the board solves, so that a board
generated at an easy tier is taught the easy technique that suffices.

Every named technique SHALL be narratable — Boats guesses at no tier, so the hint
SHALL NOT fall back on an unexplained "this is the only possibility" step.

#### Scenario: A hint names the technique that forces the move

- **WHEN** a hint is requested on a board where a row already shows all the ships
  its number allows
- **THEN** the remaining squares in that row are offered as water, and the
  explanation states that the row's number is already met

#### Scenario: A hint on an easy board teaches an easy technique

- **WHEN** a hint is requested on a board generated at the easiest difficulty
- **THEN** a plan is produced, and it is the deduction that difficulty admits
  rather than a harder refutation reaching the same square

#### Scenario: A refutation names the rule the alternative would break

- **WHEN** a square is forced only because the opposite placement immediately
  contradicts the board
- **THEN** the explanation names the specific rule that would break — a line's
  number, two boats touching, or a boat the fleet cannot hold — rather than
  asserting the square is forced without reason

### Requirement: One deduction is one hint

A single deduction that forces several squares SHALL be presented as **one**
hint — a multi-leg journey whose continuation legs are marked as continuing the
previous one — rather than as several disjoint hints. Squares that follow from a
placement by the never-touch rule SHALL be shown as part of that step rather than
narrated as further deductions.

Forced squares and the evidence they are deduced from SHALL be visually distinct,
and the two kinds of placement Boats admits — a boat segment and water — SHALL be
marked in the shape of the action each represents, so that one hint colour cannot
stand for two different actions.

#### Scenario: A line filled by one deduction is a single hint

- **WHEN** a deduction completes a whole row with water
- **THEN** one hint is presented covering every square in that row, not one hint
  per square

### Requirement: Boats refuses to hint a board it cannot honestly advise

The hint SHALL refuse, with a reason, when the board is already solved, when the
player has placed a square that contradicts the puzzle's unique solution, or when
no further deduction is available. On the mistake refusal it SHALL surface the
offending squares through the existing mistake overlay.

A placement that breaks no rule yet but that no solution permits SHALL be treated
as a mistake for this purpose, so that the hint never reasons onward from a board
that cannot be completed.

#### Scenario: A wrong-but-legal placement is refused rather than reasoned from

- **WHEN** a hint is requested on a board carrying a boat segment that breaks no
  rule but appears in no solution
- **THEN** the hint refuses and the offending square is highlighted, rather than a
  plan being computed from the unsolvable position
