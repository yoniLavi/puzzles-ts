# unequal Specification (delta)

## ADDED Requirements

### Requirement: Unequal provides on-screen key labels

Unequal SHALL implement `requestKeys(params)` returning one button per digit
`1..order` (labelled by the digit character) followed by a clear key (button code
`8`, labelled `"Clear"`), reproducing upstream `game_request_keys` so the keypad
matches the C build, in both the inequality and adjacent (Adjacent) modes.

#### Scenario: The keypad covers the grid's digits plus clear

- **WHEN** the key labels are requested for an order-5 Unequal board
- **THEN** the result is the buttons `1,2,3,4,5` followed by a clear key
