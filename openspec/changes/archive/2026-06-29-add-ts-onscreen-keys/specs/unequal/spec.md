# unequal Specification (delta)

## ADDED Requirements

### Requirement: Unequal provides on-screen key labels

Unequal SHALL implement `requestKeys(params)` returning one button per grid value
`1..order` followed by a clear key (button code `8`, labelled `"Clear"`),
reproducing upstream `game_request_keys` so the keypad matches the C build, in both
the inequality and adjacent (Adjacent) modes.

Faithful to upstream's `c2n`/`game_request_keys`, the value-to-button mapping
depends on the order: for `order < 10` the buttons are `'1'..'9'` (value `v` ⇒
char `'0' + v`); for `order ≥ 10` the keypad is `'0'`-based — `'0'..'9'` cover
values `1..10` and `'a','b',…` cover `11..order`. Each button's label is its own
character. Orders run 3..32, so the high range is genuinely reachable. (This
diverges from the shared `digitKeys` helper, which the other digit games use.)

#### Scenario: The keypad covers the grid's digits plus clear (order < 10)

- **WHEN** the key labels are requested for an order-4 Unequal board
- **THEN** the result is the buttons `1,2,3,4` followed by a clear key

#### Scenario: The keypad is '0'-based for order ≥ 10

- **WHEN** the key labels are requested for an order-11 Unequal board
- **THEN** the result is the buttons `0,1,…,9,a` (values 1..11) followed by a clear key
