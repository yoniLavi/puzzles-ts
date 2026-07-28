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
conventional behaviour for a dismissal.

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

