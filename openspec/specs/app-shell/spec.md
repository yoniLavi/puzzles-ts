# app-shell Specification

## Purpose
TBD - created by archiving change fix-board-focus-after-command. Update Purpose after archive.

## Requirements

### Requirement: Pressing a control gives the keyboard back to the board

The puzzle screen SHALL return keyboard focus to `puzzle-view-interactive` after
a control has been pressed with a pointer. The board is the screen's primary
interaction surface and every control around it is a one-shot action on the
puzzle, so the player must be able to carry on playing at the board rather than
typing at the control they just pressed.

This SHALL cover both routes a control can take: the command bus (the game menu
and every `data-command` control) and the toolbar buttons, which are wired to
their own click handlers. Focus SHALL be handed over asynchronously, because the
dropdown and the button each focus themselves synchronously first.

A command that opens a dialog needs no exception: the dialog takes focus when it
opens, and returns it to the board — rather than to the control that opened it —
when it closes.

Without this, `handleBubbledKeyDown`'s stray-key redirect cannot help, because it
only fires when nothing at all is focused; a single click on any control would
leave the board unable to receive a keystroke until it was clicked again.

#### Scenario: Enter reaches the board after a menu command

- **WHEN** the player picks a command from the game menu and then presses Enter
- **THEN** the key reaches the puzzle, and does not reopen the menu

#### Scenario: The cursor keys reach the board after a toolbar click

- **WHEN** the player clicks a toolbar button (undo, hint, check-&-save, …) and
  then presses a cursor key
- **THEN** the key reaches the puzzle

### Requirement: Focus is not taken from a player who is using the keyboard

Returning focus to the board SHALL NOT override a player who is navigating by
keyboard, in either of two cases.

A click that *opens* a menu SHALL leave focus alone, because the open menu needs
it for its own arrow-key navigation. A control activated *from* the keyboard —
tabbed to and pressed, which arrives as a click with a `detail` of 0 — SHALL
also leave focus alone, because that player is moving through the tab order
deliberately and would lose their place. Dismissing a menu with Escape or a
click-away SHALL continue to return focus to the menu's trigger, which is the
conventional behavior for a dismissal.

#### Scenario: A menu opened with the mouse can still be driven with the keyboard

- **WHEN** the player clicks a dropdown's trigger button
- **THEN** the menu opens with focus inside it, and the cursor keys navigate it

#### Scenario: Tabbing to a button and pressing Enter keeps the tab position

- **WHEN** the player tabs to a toolbar button and activates it with Enter
- **THEN** focus stays on that button

### Requirement: Every press delivered to a puzzle is followed by exactly one release

The interactive puzzle view SHALL deliver a release (or cancel) event to the
puzzle for every press it has delivered, exactly once, regardless of the timing
of the asynchronous round-trip that carries the press to the puzzle engine.

A pointer release that occurs while the corresponding press is still in flight
SHALL be retained and delivered once the press has been acknowledged, rather
than discarded. A press the puzzle declines SHALL continue to be followed by an
immediate release, as it is today.

This guarantee is independent of which engine serves the puzzle: it holds for
the TypeScript engine and for the C/WebAssembly engine alike, because it is a
property of the input layer above both.

#### Scenario: A click completed before the press is acknowledged still releases

- **WHEN** the player presses and releases a pointer faster than the press
  reaches the puzzle engine
- **THEN** the puzzle receives the press and then the release
- **AND** any state the puzzle shows only while a press is held — a drag
  highlight, a lifted piece, a drag preview — is cleared without waiting for a
  later, unrelated input

#### Scenario: A release is never delivered twice

- **WHEN** a pointer release arrives after the press has already been
  acknowledged
- **THEN** the puzzle receives exactly one release for that press

### Requirement: A puzzle page reopens on the board it was last showing

Opening a puzzle SHALL show the board that puzzle last dealt, rather than
generating a new one, whenever nothing more specific applies. The order of
preference SHALL be: a game ID supplied in the URL, then the most recent autosave,
then the last board this puzzle dealt, then a new game.

The last dealt board SHALL be recorded as a game ID in the puzzle's settings
record, and SHALL NOT be recorded as an autosave. The autosave table is what the
home screen reads to badge a puzzle as having a game in progress, so a row written
for a board the player has not touched would make that badge true for every puzzle
they have merely opened.

A recorded game ID that this build can no longer deal SHALL be discarded and
replaced by a new game, without interrupting the player — they did not ask for
that board, so its loss is not a decision to put in front of them. A game ID
supplied in the URL is unaffected by this and continues to report its failure.

#### Scenario: An untouched board survives a reload

- **WHEN** a puzzle is opened, no move is made, and the page is reloaded
- **THEN** the same board is shown, and no autosave record exists for that puzzle

#### Scenario: A started game still restores from its autosave

- **WHEN** a puzzle is opened, moves are made, and the page is reloaded
- **THEN** the board and the moves are restored from the autosave, not re-dealt
  from the recorded game ID

#### Scenario: Browsing puzzles does not badge them as in progress

- **WHEN** a puzzle is opened and left without a move
- **THEN** the home screen does not show that puzzle as having a game in progress

#### Scenario: A remembered board this build cannot deal is dropped quietly

- **WHEN** a puzzle is opened whose recorded game ID no longer validates
- **THEN** a new game is dealt, the recorded ID is cleared, and no alert is shown

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
