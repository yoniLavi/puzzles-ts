# solo Specification (delta)

## ADDED Requirements

### Requirement: Solo provides on-screen key labels

Solo SHALL implement `requestKeys(params)` returning the digit keypad for its grid:
one button per symbol `1..cr` (where `cr = c·r`), labelled by the symbol character
(`"1".."9"`, then `"a"`, `"b"`, … for `cr > 9`), followed by a clear key (button
code `8`, the backspace, labelled `"Clear"`). This reproduces upstream
`game_request_keys` so the keypad is identical to the C build.

#### Scenario: A 9-symbol board shows digits 1–9 plus clear

- **WHEN** the key labels are requested for a `3×3` Solo board
- **THEN** the result is the buttons `1,2,…,9` followed by a clear key

#### Scenario: A smaller board shows fewer digits

- **WHEN** the key labels are requested for a `2×2` Solo board
- **THEN** the result is the buttons `1,2,3,4` followed by a clear key
