# filling Specification (delta)

## ADDED Requirements

### Requirement: Filling provides on-screen key labels

Filling SHALL implement `requestKeys()` returning the fixed digit keypad `1..9`
(labelled by the digit character) followed by a clear key (button code `8`,
labelled `"Clear"`), reproducing upstream `game_request_keys` (which is fixed to
digits 1–9 regardless of board size) so the keypad matches the C build.

#### Scenario: The keypad is digits 1–9 plus clear

- **WHEN** the key labels are requested for any Filling board
- **THEN** the result is the buttons `1,2,…,9` followed by a clear key
