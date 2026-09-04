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

**The recorded game ID SHALL carry the full params encoding**, difficulty
included, and SHALL NOT be the id offered for sharing. Those are different jobs:
a shared `params:desc` id deliberately omits difficulty (upstream
`midend_get_game_id`), because the desc already fixes the board and a link should
not over-constrain the recipient's next game — while re-dealing a remembered
board must restore the tier the player chose, since loading a game ID sets the
params from its prefix. Recording the sharing id here reset a tiered puzzle to
its default difficulty on every reopen, and the settings write that followed
made the reset permanent.

A recorded game ID that this build can no longer deal SHALL be discarded and
replaced by a new game, without interrupting the player — they did not ask for
that board, so its loss is not a decision to put in front of them. A game ID
supplied in the URL is unaffected by this and continues to report its failure.

#### Scenario: An untouched board survives a reload

- **WHEN** a puzzle is opened, no move is made, and the page is reloaded
- **THEN** the same board is shown, and no autosave record exists for that puzzle

#### Scenario: A reopened board keeps the difficulty it was dealt at

- **WHEN** a tiered puzzle is dealt at a non-default difficulty, no move is made,
  and the page is reloaded
- **THEN** the same board is shown **and** the puzzle still reports that
  difficulty, so the next new game is dealt at it
- **AND** the type control names that difficulty rather than the default one

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

### Requirement: The params a puzzle reports are the full params of the board on screen

The params a puzzle reports for display SHALL be the **full** encoding of the
board currently on screen, difficulty included — the same encoding a restore
uses, never the lossy sharing form. They label the type control, describe the
type in the share dialog, and key the keypad and view re-renders, and every one
of those is wrong if the difficulty is missing.

Deriving them from the random seed and falling back to the descriptive game ID
SHALL NOT be done: the preference exists only because the seed carries full
params and the game ID does not, so the fallback mislabels precisely those boards
that have no seed — which is every board restored from a descriptive ID, i.e.
every reopened puzzle. Unruly at 10x10 Normal reopened as "10x10 Trivial", a type
its preset menu does not offer.

#### Scenario: A board with no seed still reports its difficulty

- **WHEN** a board is restored from a descriptive game ID, so no random seed
  exists for it
- **THEN** the params it reports carry the difficulty the board was dealt at

#### Scenario: The reported params follow a re-deal

- **WHEN** a new board is dealt at a different difficulty
- **THEN** the params reported change with it rather than keeping the first
  value seen

### Requirement: The type header names an option by the name the game declares

The custom-configuration summary in the type header SHALL render a `choices`
field's value using that field's declared `choicenames` — the option names the
midend builds from the game's own `paramConfig` — and SHALL NOT carry a second,
hand-written copy of them.

A template token that spells its own options (`{allow-loops:|, no loops}`) is
**presentation shaping**: punctuation, a leading space, an empty branch. It has
no other source and stays. A token that names a choices field with no option
list (`{difficulty}`) resolves from the declaration. The distinguishing test is
whether the spelled list is identical to the declared names: if it is, it is a
copy, and a copy can only ever be right by coincidence.

Twenty-four hand-typed lists existed when this was written, and **19 of the 21
games whose header named a difficulty named one the game does not have** —
Bricks rendered three tier words for two tiers, and Loopy rendered a raw tier
index because its `paramConfig` spelled the field `diff` while the value it was
looked up by was `difficulty`. The Custom dialog was correct throughout, because
it had always read the declared names; the header beside it disagreed.

**A game that declares tiers SHALL name the tier in its summary.** Clusters and
Salad omitted the field entirely, so a custom board gave the player no way to
tell which tier they were on.

#### Scenario: A tier renders as its declared name

- **WHEN** a summary is rendered for params at any tier of any tiered game
- **THEN** the text contains that tier's declared name

#### Scenario: A wrong, reordered or miscounted tier list is reported

- **WHEN** a template spells a tier list that differs from the game's declared
  names in wording, order, or length
- **THEN** the check fails, naming the game and the tier

#### Scenario: The check cannot pass over nothing

- **WHEN** no game is reached, or no tier is rendered
- **THEN** the vacuity guard fails rather than the sweep reporting health

### Requirement: A summary check asserts the rendered word, not merely that a token was replaced

The guard over type-header summaries SHALL compare rendered text against the
declaring source, not only assert that no `{field}` placeholder survives.

The placeholder check existed and stayed green throughout, because **substituting
the wrong word is still substituting**: it measured a neighbor of the property it
was meant to protect. Both checks are kept — an unsubstituted token and a wrongly
substituted one are different defects — but the second is the one that catches a
tier list drifting from the game it describes.

#### Scenario: A substituted-but-wrong word is caught

- **WHEN** a template substitutes a word that is not the declared name
- **THEN** the guard fails, even though no placeholder survives
