# ts-engine

## ADDED Requirements

### Requirement: A hint SHALL show only steps the player's board does not already decide

A deductive hint SHALL NOT show a step whose every change the player's board
already decides. The shared plan loop (`deduceHintPlan`) SHALL provide the
mechanism, as an optional `showable(board, firing)` judgment the game supplies:

- a firing that is not showable SHALL still advance the plan's working board,
  since later firings may rest on it, and SHALL NOT become a step;
- the plan cap SHALL count shown steps only, so hidden firings can never turn a
  plan into a refusal;
- the loop SHALL report how many firings it hid, and SHALL tick its step budget
  for hidden firings as for shown ones.

What is evident is the game's to judge, since it depends on what that game
draws; the judgment SHALL hide only conclusions the player's board already
shows, and SHALL NOT hide a change the win condition needs. Where a game derives
it from move legality — the game would refuse the move (Galaxies) or its
contrary (Tracks) — that derivation SHALL be judged on the board before the
firing, and a game that declares which rules are evident SHALL hold the
declaration to such a derivation in a test.

#### Scenario: A redundant deduction is never a step

- **WHEN** a deduction's every change is one the player's board already decides
  — Tracks' "a finished piece's other two sides are blocked", beside squares the
  player has marked empty
- **THEN** the plan applies it to its working board and shows no step for it

#### Scenario: Hidden firings do not spend the plan cap

- **WHEN** several hidden firings precede the next showable one and the plan cap
  is one step
- **THEN** the plan holds that showable step, and reports the hidden ones as a
  count

#### Scenario: A hidden firing that changes nothing still terminates

- **WHEN** a firing is hidden but changes nothing, so the loop would ask for it
  again for ever
- **THEN** the step budget throws, exactly as it does for a shown one
