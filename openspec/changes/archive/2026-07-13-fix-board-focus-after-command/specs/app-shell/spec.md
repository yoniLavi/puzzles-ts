# app-shell Specification

## ADDED Requirements

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
