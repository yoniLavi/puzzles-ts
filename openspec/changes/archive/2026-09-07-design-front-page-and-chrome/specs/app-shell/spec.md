# app-shell Specification Delta — design-front-page-and-chrome

## ADDED Requirements

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
