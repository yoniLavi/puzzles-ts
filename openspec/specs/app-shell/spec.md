# app-shell Specification

## Purpose
The app's chrome around the puzzles — the puzzle screen's commands, keyboard and
focus handling, the press-and-release stream it delivers to a game, the board
and params it restores and reports, and the home screen's navigation — as a
design of this project's own. It exists so that every command has one home, the
board keeps the keyboard, the layout holds at a phone width, a setting is
offered only while something reads it, and nothing in the chrome presses a
player toward a hint.

## Requirements

### Requirement: Pressing a control gives the keyboard back to the board

The puzzle screen SHALL return keyboard focus to `puzzle-view-interactive` after
a control has been pressed with a pointer. The board is the screen's primary
interaction surface and every control around it is a one-shot action on the
puzzle, so the player must be able to carry on playing at the board rather than
typing at the control they just pressed.

This SHALL cover both routes a control can take: the command bus (every
`data-command` control), and a pointer click anywhere in the chrome, since a
control may be both a `data-command` and a menu trigger and only a real event's
composed path tells those apart. Focus SHALL be handed over asynchronously,
because the dropdown and the button each focus themselves synchronously first.

A command that opens a dialog needs no exception: the dialog takes focus when it
opens, and returns it to the board — rather than to the control that opened it —
when it closes.

Without this, `handleBubbledKeyDown`'s stray-key redirect cannot help, because it
only fires when nothing at all is focused; a single click on any control would
leave the board unable to receive a keystroke until it was clicked again.

#### Scenario: Enter reaches the board after a menu command

- **WHEN** the player picks a command from a menu and then presses Enter
- **THEN** the key reaches the puzzle, and does not reopen the menu

#### Scenario: The cursor keys reach the board after a toolbar click

*(The title keeps the word "toolbar" because a `MODIFIED` delta replaces a
requirement wholesale and cannot rename a scenario — omitting the old title is
what `openspec validate` refuses. The surface it names is the command
surface.)*

- **WHEN** the player clicks a control in the command surface (undo, hint,
  check & save, …) and then presses a cursor key
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

- **WHEN** the player tabs to a control in the command surface and activates it
  with Enter
- **THEN** focus stays on that control

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

### Requirement: The chrome follows a recorded design direction of this project's own

The app's chrome — the front page, the puzzle screen's app bar, toolbar,
keypad and dialogs, and the design tokens they are built on — SHALL follow a
design direction chosen by the owner and recorded in this project, rather than
the layout inherited from `puzzles-web` with the shell.

The direction SHALL be chosen on sight, from drawn alternatives, before any
implementation begins: a visual direction is a decision the owner makes by
looking, and code written ahead of it is work spent on a guess. The recorded
direction SHALL be specific enough to implement from — palette tokens, type
scale, spacing, radius, and the layout of each surface — and a change that
alters the chrome SHALL cite it.

#### Scenario: A redesign is proposed

- **WHEN** a change proposes to alter the look or layout of the chrome
- **THEN** it cites the recorded design direction it implements or amends
- **AND** where no direction is yet recorded, it produces one first, chosen by
  the owner from drawn alternatives, and lands no code until then

### Requirement: Every puzzle command has exactly one home

The puzzle screen SHALL present exactly one command surface, and every command
it offers SHALL be reachable from exactly one place in it.

Two surfaces were maintained in parallel — a game menu and a toolbar — with
`hint`, `toggle-reference` and `check-and-save` in both, and eleven further
commands split between them under no rule. A player then has to learn both
surfaces to know what the app can do, and can still miss a command that lives
only in the other one.

The surface SHALL be laid out vertically, which is what allows each command to
carry a visible label as well as an icon: a horizontal bar has no room for text,
and that is why eight controls shipped wordless. Commands SHALL be grouped by
what they act on and ordered by how often they are used, and only rare or
once-ever commands may sit behind a menu.

**A phone's quick-access bar is a promotion, not a second surface.** Where the
viewport is too narrow for the vertical surface, a small bar MAY offer the most
frequent commands, and the surface itself SHALL remain reachable behind it with
the same order and the same wording. Every command in that bar SHALL also be in
the surface — the bar is a **subset**, checked as one — so a player who learns
the surface has learned everything the bar can do and a command can never be
promoted into the bar and nowhere else. The rule this refines is unchanged in
its purpose: what it forbids is *two surfaces a player must both learn*, which
is what the game menu and the toolbar were.

The surface and the bar SHALL be drawn from one implementation, so that "the
same order and the same wording" is a property of the code rather than a promise
somebody has to keep.

#### Scenario: A command is offered twice

- **WHEN** a command in the puzzle screen's command map is reachable from more
  than one place in the rendered command surface
- **THEN** a test fails, naming the command and both places

#### Scenario: A command is in the phone bar but not in the surface

- **WHEN** the phone's quick-access bar offers a command
- **AND** the command surface behind it does not
- **THEN** a test fails, because `More…` no longer reaches everything

#### Scenario: A command has no home

- **WHEN** a command in the command map is reachable from nowhere in the
  rendered chrome
- **THEN** a test fails, naming the command

#### Scenario: A control carries no label

- **WHEN** the command surface renders a control
- **THEN** it carries a visible text label, not an icon alone

### Requirement: Checking a board never costs a player their checkpoint

The combined check-and-save command SHALL remain in the chrome's most reachable
tier. Alongside it, where a game implements `findMistakes`, the puzzle screen
SHALL also offer a quieter command that runs the check and reports the result
**without writing a checkpoint**.

The combined command is deliberate and is what most players want: it verifies
first and refuses to save over a mistake, so a saved checkpoint is a known-good
one. What it cannot serve is a narrow case created by the store: **the
quick-save slot is one per puzzle**, so checking overwrites it. A player who
saved deliberately before a speculative branch, and then checks while the board
is still consistent, silently loses the position they were keeping.

Both commands SHALL appear only where the game reports `canFindMistakes`,
derived from the game rather than from a list of games.

#### Scenario: Checking without saving preserves an earlier checkpoint

- **GIVEN** a checkpoint saved at an earlier position
- **WHEN** the player runs the check-without-saving command at a later position
- **THEN** the mistakes are highlighted and the count reported
- **AND** returning to the checkpoint still restores the earlier position

#### Scenario: A game that cannot find mistakes

- **WHEN** the game does not report `canFindMistakes`
- **THEN** both commands are absent rather than present and disabled

### Requirement: Undo and redo have keyboard shortcuts

The app SHALL bind `Ctrl/Cmd+Z` to undo and `Ctrl/Cmd+Shift+Z` and `Ctrl+Y` to
redo, in every game, and SHALL show each binding on its control.

Keys reach the game through the frontend's key map and almost nothing above it
claims any, so the collection shipped with no way to undo from the keyboard.
Upstream bound `u`, `r` and `n` behind a user preference and further bound
control codes unconditionally; the port carried neither. (`Ctrl/Cmd+S` was the
one exception, bound to the combined check-and-save; it stays bound, and now
appears on that command's control, where it was never shown.)

Single-letter shortcuts MAY additionally be offered behind a preference, and
SHALL NOT fire for a game that consumes that letter as input. That SHALL be
**derived from the game's own behavior, not from any declaration about it**: the
key is offered to the game first and becomes an app command only if the game
declines it, which the midend already reports by returning false exactly when
`interpretMove` returned null. This is stronger than reading a game's declared
key labels, because it also covers a game that consumes a letter without ever
offering it on a keypad — and it is why no game has to say anything at all.

The key shown on a control SHALL be asserted equal to the key that is bound, so
a shortcut label cannot become decorative.

#### Scenario: Undo from the keyboard

- **WHEN** a player presses `Ctrl/Cmd+Z` with moves to undo
- **THEN** the last move is undone

#### Scenario: A game that takes letter input

- **WHEN** single-letter shortcuts are enabled
- **AND** the game consumes that letter as input
- **THEN** the letter reaches the game and does not trigger the app command
- **AND** the game declared nothing to bring that about

#### Scenario: The shown key is the bound key

- **WHEN** a control displays a keyboard shortcut
- **THEN** a test asserts that pressing exactly that key invokes exactly that
  command

### Requirement: The chrome does not overflow at a phone width

The puzzle screen's chrome SHALL lay out without horizontal overflow at 390 CSS
pixels.

The inherited header was a non-wrapping flex row with no minimum-width budget,
so at 390px its last control ran underneath the one before it and the type menu
truncated to a single character. Moving the commands to a vertical surface
removes the failure mode rather than tuning it, and the remaining header carries
few enough items to fit.

#### Scenario: A narrow viewport

- **WHEN** the puzzle screen renders at 390 CSS pixels wide
- **THEN** no chrome element overlaps another, and no control's label is
  truncated to fewer characters than it needs

### Requirement: Every bare shortcut letter is swept against every game

The suite SHALL sweep each bare letter in the shortcut table against every
registered game and SHALL fail on a game that consumes one, unless that game is
on an explicit ledger whose entry states the reason a player would accept.

Deriving the collision from the game's own behavior — offering the key first and
acting only if the game declines — needs no declaration from any game, which is
its whole advantage. What it does not do is *notice*: a game that consumes a
letter simply makes that shortcut do nothing, silently, in that game alone.
Nothing about the table, the matchers or the labels is wrong when that happens,
so every test of them stays green. Ascent consumed `u`, `r`, `n` and `h`, leaving
undo, redo, New game and Hint unreachable from its keyboard, while the shortcut
suite passed in full.

The sweep SHALL ask on a fresh board **and** with the keyboard cursor revealed,
because several games accept letters only once the cursor is visible; asking in
one state alone misses them. The ledger SHALL be asserted exactly equal to the
set found, so a game that stops claiming a letter forces its entry to be deleted.

A ledger entry records a **collision, not a defect**: a game keeping its own
meaning for a letter is the derivation working. Tents binds `n` to "not a tent"
whenever its cursor is visible, which is exactly when a player means the cell;
Guess and Pearl bind `h` to their own hint, which is the command the bare letter
would have run anyway.

#### Scenario: A game that swallows a shortcut letter is caught

- **WHEN** a registered game consumes a bare shortcut letter on a fresh board or
  with its cursor revealed
- **THEN** the sweep fails and names the letter and the command it cost, unless
  that game is on the ledger

#### Scenario: A recorded collision keeps the game's meaning

- **WHEN** a game on the ledger consumes its letter
- **THEN** the sweep passes, and the entry states why a player is not worse off

### Requirement: The chrome offers the hint and never urges it

No control in the chrome SHALL be styled to recommend taking a hint. The hint
SHALL be as reachable as any other command — same surface, same label, the same
two beats of show-then-apply — and SHALL NOT be given an emphasis that sets it
above the commands beside it.

Explained hints are why this fork exists, and that is a fact about the fork
rather than an instruction to a player. Rendered as the one filled control on
the screen, it read as the second: a player opening a puzzle was met with the
loudest thing on the board telling them to ask for help. Whether to take a hint
is the player's call, and wanting to solve a puzzle unaided is the instinct the
chrome should leave room for.

The hint's own amber is unaffected, and the distinction is the point: the
explanation panel is the hint **speaking**, which it may do as loudly as it
likes once asked. The button is the chrome **offering**, which it does plainly.

#### Scenario: A player opens a puzzle they have not asked for help with

- **WHEN** the puzzle screen renders its command surface
- **THEN** no control is emphasized for being the hint

### Requirement: A preference exists only while something reads it

A setting SHALL NOT be offered to a player unless the state it controls changes
something the player can observe. Where the condition a setting reveals or hides
can no longer occur, the setting and every surface built on it SHALL be removed
together rather than left as an inert control.

This is not tidiness. "Show experimental puzzles" revealed games carrying the
catalog's `unfinished` flag — a flag **no puzzle has ever set**, as the field's
own doc comment recorded. Four surfaces were maintained over that empty set: the
preference, the home screen's `visibleIds` filter, the catalog card's
"Experimental" badge, and a once-a-day warning dialog with its own throttle and
its own persisted timestamp. A fifth, in the share dialog, had decayed further:
its exclusion could not fire, which made an escape hatch for Group unreachable
and the branch around it an unconditional return.

A control that cannot change what a player sees still costs them the attention
to read it and decide, which is the part that is not free.

#### Scenario: The condition a setting gates can no longer arise

- **WHEN** nothing in the shipped product can put a player in the state a
  preference exists to control
- **THEN** the preference is removed, together with the filters, badges and
  dialogs that read it

### Requirement: The home screen's navigation has no layer it does not need

The home screen's header SHALL present its destinations directly rather than
behind a menu, unless the number of destinations makes a menu the shorter path.
A page's own title SHALL NOT be a menu trigger.

The header carried an "Options" dropdown holding three items, one of which — a
"Show intro message" checkbox — controlled a single line of text, and at the
compact width the dropdown's trigger was the app's own name. Removing the
checkbox left two destinations behind a menu, which is a tap spent on nothing.

About needs no menu row: the footer already links to it in prose and names what
is inside it, which tells a player more than the word "About" does.

#### Scenario: A menu is left holding what a player could reach directly

- **WHEN** a navigation menu's contents shrink to what fits beside it
- **THEN** the menu is removed and its destinations are presented directly
