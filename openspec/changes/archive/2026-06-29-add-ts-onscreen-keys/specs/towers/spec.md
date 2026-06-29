# towers Specification (delta)

## ADDED Requirements

### Requirement: Towers provides on-screen key labels

Towers SHALL implement `requestKeys(params)` returning one button per digit `1..w`
(labelled by the digit character) followed by a clear key (button code `8`,
labelled `"Clear"`), reproducing upstream `game_request_keys` so the keypad matches
the C build.

#### Scenario: The keypad covers the grid's heights plus clear

- **WHEN** the key labels are requested for a `5×5` Towers board
- **THEN** the result is the buttons `1,2,3,4,5` followed by a clear key
