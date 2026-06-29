# undead Specification (delta)

## ADDED Requirements

### Requirement: Undead provides on-screen key labels

Undead SHALL implement `requestKeys()` returning its four monster-entry keys —
`G` labelled `"Ghost"`, `V` labelled `"Vampire"`, `Z` labelled `"Zombie"` — followed
by a clear key (button code `8`, labelled `"Clear"`), reproducing upstream
`game_request_keys` so the keypad matches the C build. (The keys carry the monster
letters regardless of the pictures/letters display preference, matching upstream.)

#### Scenario: The keypad is the three monsters plus clear

- **WHEN** the key labels are requested for any Undead board
- **THEN** the result is exactly the buttons `G` ("Ghost"), `V` ("Vampire"),
  `Z` ("Zombie"), and a clear key
