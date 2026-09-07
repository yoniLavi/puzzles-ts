# ascent

## ADDED Requirements

### Requirement: Ascent acts on a pointer button, not on a pointer coordinate

Ascent's `interpretMove` SHALL enter its board arm only for an actual pointer
button — a press, drag or release — and not for any button whose coordinates
merely fall inside the grid.

Upstream gates that arm on the coordinates alone. That is harmless in a frontend
which claims `n`, `u`, `r` and `q` **above** the game, and it is not harmless
here, where the app derives its bare-letter shortcuts from whether the game
declined the key. Keyboard events arrive at `(0, 0)`, which is inside every
grid, so every key ran the no-op mouse-click path, set `finishTyping`, and fell
through the tail that returns `UI_UPDATE` when typing was finished and no move
resulted. Ascent therefore answered **every** button code in existence: undo,
redo, New game and Hint were all dead from its keyboard, and the collection's
consumed-based input guards were blind to the game entirely — with its cursor
keys deliberately disabled, the keyboard-reachability guard still reported it
healthy.

The `UI_UPDATE` tail itself SHALL be kept. It is not gratuitous: it is what
repaints a moved cursor, a click that lands outside the grid and clears the UI,
and a pointer press that mutates selection without producing a move. The defect
was the arm's gate, not the tail, and narrowing the tail by comparing UI state
before and after is expressly not the remedy.

**Scope, stated rather than implied**: this restores the keyboard-reachability
guard for Ascent and returns the four bare-letter shortcuts to its players. It
does **not** make the `ignoresSecondaryButton` biconditional sensitive for
Ascent — `RIGHT_BUTTON` is a pointer button, so it still reaches the tail, and
deleting Ascent's entire right-button arm leaves that guard green. Ascent's flag
is correct nonetheless, verified by reading the two arms rather than by probing:
a right-click cycles a two-candidate cell and a middle-click clears, so Ascent
has a genuine secondary meaning and correctly does not declare the flag.

#### Scenario: A key that is not a pointer button is declined

- **WHEN** a button that is neither a press, a drag nor a release is delivered at
  coordinates inside the grid, and Ascent has no other meaning for it
- **THEN** `interpretMove` returns `null`, so the app's bare-letter shortcuts run

#### Scenario: A typed number still commits on a cursor move or a click

- **WHEN** a partially typed number is pending and the player moves the cursor,
  presses Enter, or clicks the board
- **THEN** the number is committed, as before
