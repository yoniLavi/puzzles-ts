## ADDED Requirements

### Requirement: Dominosa provides a domino reference with pair-occurrence highlight

Dominosa SHALL implement the engine reference-aid hooks so the app shows a domino
reference: a checklist of the game's fixed inventory of `DCOUNT(n) = (n+1)(n+2)/2` distinct
number-pairs (`0-0 … n-n`), each with found status, and a click-to-highlight of a pair's
candidate placements.

`reference(state, ui)` SHALL enumerate exactly one `ReferenceItem` per domino index
`0 … DCOUNT(n)-1`, each carrying its two face values as `pips` and an `"a–b"` `label`. Status
SHALL be derived purely from the player's placed dominoes — no solver, no solution
information — by scanning `grid`: for each square `i` with `grid[i] > i`, the placed pair is
`DINDEX(numbers[i], numbers[grid[i]])`. An index placed zero times SHALL be `outstanding`,
once SHALL be `placed`, and two or more times SHALL be `conflict`. The model's `selected`
SHALL be the currently highlighted pair's key, or null.

The `DominosaUi` SHALL carry a `highlightPair: number | null` field (a domino index, or
null). `selectReference(ui, key)` SHALL set it from the item key (or clear it) and report
whether it changed. `highlightPair` SHALL be reset to null when the board is completed
(together with the number-highlight slots) and **dismissed by any board tap** (see below); it
is otherwise not cleared by `executeMove`, so a programmatic move / the panel closing keeps it
(the mark→close→place flow). It SHALL coexist with the existing number-highlight aid as an
independent visual channel, and is `Ui`-only state: never a move, never serialised.

Because Escape is undiscoverable and unavailable on touch, **any pointer tap on the board**
(`interpretMove` for a left/right button within the grid) SHALL clear `highlightPair` — the
tap still performs its normal action (place/remove a domino, toggle a barrier, toggle a
number-highlight), and even a tap that would otherwise do nothing SHALL repaint so the cleared
spotlight disappears.

When `highlightPair` is set, `redraw` SHALL box **both** squares of every orthogonally
adjacent square-pair whose two clue values are that domino — i.e. all candidate placements
for it — in a dedicated `COL_REFERENCE` colour that is distinct from the mistake, hint, and
number-highlight colours, and SHALL box no other squares. The highlight state SHALL be folded
into the render cache key so the box appears and clears on selection change.

#### Scenario: A board tap dismisses the spotlight while doing its action

- **WHEN** a domino is spotlighted and the player taps the board to place a domino
- **THEN** that domino is placed AND the spotlight is cleared (a discoverable, touch-friendly
  dismiss); a tap that resolves to no move still clears the spotlight and repaints

#### Scenario: The checklist reflects placed, outstanding, and conflicting pairs

- **WHEN** the player has placed the `2-5` domino once and left `0-0` unplaced, and has
  placed two separate dominoes whose values are both `1-3`
- **THEN** `reference()` returns `DCOUNT(n)` items in which `2-5` is `placed`, `0-0` is
  `outstanding`, and `1-3` is `conflict`

#### Scenario: Selecting a pair boxes exactly its candidate placements

- **WHEN** the player selects the `2-5` item
- **THEN** `redraw` draws a `COL_REFERENCE` box around both squares of every adjacent
  square-pair showing a 2 next to a 5, and around no other squares; selecting it again (or
  another pair) clears/replaces the boxes

#### Scenario: The highlight is Ui-only and clears on completion

- **WHEN** a pair is highlighted and the player then completes the board
- **THEN** the highlight is cleared, and neither selecting nor clearing a highlight ever
  added a move, an undo entry, or anything to the saved game
