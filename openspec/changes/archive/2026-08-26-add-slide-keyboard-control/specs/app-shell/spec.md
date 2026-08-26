# app-shell Specification Delta — add-slide-keyboard-control

## ADDED Requirements

### Requirement: Escape reaches the puzzle when there is no gesture to cancel

Escape SHALL be delivered to the running puzzle as button `27` whenever no
pointer gesture is in flight. When a pointer *is* down, Escape SHALL instead
abandon that gesture — the puzzle already hears it as a drag out of bounds
followed by a release — and SHALL NOT also arrive as a keypress, so a game
never sees one Escape as two events.

The delivery SHALL NOT suppress the browser's default handling, so Escape
continues to compose with the reference spotlight and with any dialog above the
board.

This is the frontend half of a contract games already write to: `interpretMove`
implementations test `button === 27` for "put it back down". Escape was
previously swallowed unconditionally, which made every such arm a **key that can
never fire** — the same class of defect as an upstream binding on
`MOD_NUM_KEYPAD` or on the space *character*, and it had shipped in two games.

A game whose cancel arm tests upstream's `'\b'` (8) SHALL also test `127`,
because that is the code the key map sends for Backspace, Delete and Clear.

#### Scenario: Escape with no pointer down reaches the puzzle

- **WHEN** the player presses Escape while no pointer gesture is in flight
- **THEN** the puzzle receives button `27`

#### Scenario: Escape with a pointer down cancels the gesture only

- **WHEN** the player presses Escape while a pointer is down
- **THEN** the puzzle receives the gesture's own out-of-bounds drag and release
- **AND** it does not additionally receive button `27`
