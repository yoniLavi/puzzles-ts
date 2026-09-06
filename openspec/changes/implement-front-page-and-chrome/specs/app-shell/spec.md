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

#### Scenario: A command is offered twice

- **WHEN** a command in the puzzle screen's command map is reachable from more
  than one place in the rendered chrome
- **THEN** a test fails, naming the command and both places

#### Scenario: A command has no home

- **WHEN** a command in the command map is reachable from nowhere in the
  rendered chrome
- **THEN** a test fails, naming the command

#### Scenario: A control carries no label

- **WHEN** the command surface renders a control
- **THEN** it carries a visible text label, not an icon alone

### Requirement: A player can have their work checked without saving

Where a game implements `findMistakes`, the puzzle screen SHALL offer a command
that runs it and reports the result **without writing a checkpoint**.

`findMistakes` is implemented by 42 of the 57 games and had exactly one
production caller, the quick-save action, which checks only as a precondition of
saving and refuses to save when it finds something. Checking your work and
keeping a checkpoint are different intentions, and a player who wanted the first
could only get it by asking for the second.

The command SHALL appear only where the game reports `canFindMistakes`, derived
from the game rather than from a list of games.

#### Scenario: A game that can find mistakes

- **WHEN** the puzzle screen renders for a game reporting `canFindMistakes`
- **THEN** a check command is offered
- **AND** invoking it highlights the mistakes and reports the count
- **AND** no checkpoint is written

#### Scenario: A game that cannot

- **WHEN** the game does not report `canFindMistakes`
- **THEN** the command is absent rather than present and disabled

### Requirement: Undo and redo have keyboard shortcuts

The app SHALL bind `Ctrl/Cmd+Z` to undo and `Ctrl/Cmd+Shift+Z` and `Ctrl+Y` to
redo, in every game, and SHALL show each binding on its control.

Keys reach the game through the frontend's key map and nothing above it claims
any, so the collection shipped with no way to undo from the keyboard. Upstream
bound `u`, `r` and `n` behind a user preference and further bound control codes
unconditionally; the port carried neither.

Single-letter shortcuts MAY additionally be offered behind a preference, and
SHALL be suppressed for a game that consumes that letter as input. The
suppression SHALL be **derived** from what the game already declares — the key
labels it returns and the button codes it handles — never from a list of games,
which a new game can join without anyone noticing.

The key shown on a control SHALL be asserted equal to the key that is bound, so
a shortcut label cannot become decorative.

#### Scenario: Undo from the keyboard

- **WHEN** a player presses `Ctrl/Cmd+Z` with moves to undo
- **THEN** the last move is undone

#### Scenario: A game that takes letter input

- **WHEN** single-letter shortcuts are enabled
- **AND** the game consumes that letter as input
- **THEN** the letter reaches the game and does not trigger the app command

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
