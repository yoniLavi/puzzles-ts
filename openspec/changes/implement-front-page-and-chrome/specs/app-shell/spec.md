# app-shell Specification Delta — implement-front-page-and-chrome

## ADDED Requirements

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
