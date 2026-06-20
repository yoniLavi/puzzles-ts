## ADDED Requirements

### Requirement: Towers offers a sticky pencil mode with an on-screen indicator

Towers SHALL support a sticky pencil-entry mode, exposed as a `Game.prefs`
boolean (`Ui.pencilSticky`) that defaults **on**. When sticky mode is on, a
right-click (`RIGHT_BUTTON`) SHALL toggle a persistent pencil mode and move the
highlight to the clicked cell, and a left-click (`LEFT_BUTTON`) SHALL only move
the highlight, preserving the current pencil/real mode. When sticky mode is off,
input SHALL behave exactly as upstream: a left-click reverts to real entry and a
right-click is a per-cell pencil select. The keyboard path is unaffected (it is
already mode-persistent).

While pencil mode is active, Towers SHALL draw an on-screen mode indicator (a
small pencil glyph) in a fixed board location that no tower overlaps, so the
player can always see which mode they are in. The indicator SHALL appear and
clear together with the pencil mode and SHALL NOT alter game state.

#### Scenario: Sticky mode keeps pencil entry across left-clicks

- **WHEN** sticky pencil mode is on and the player right-clicks a cell, then
  left-clicks a different cell
- **THEN** pencil mode stays on, the highlight moves to the second cell, and a
  digit there writes a pencil mark (not a real entry)
- **AND** the on-screen pencil-mode indicator is shown the whole time

#### Scenario: Right-click toggles the mode off

- **WHEN** sticky pencil mode is on and active, and the player right-clicks again
- **THEN** pencil mode turns off, real entry resumes, and the indicator clears

#### Scenario: Sticky mode disabled restores upstream behaviour

- **WHEN** the sticky pencil preference is off and the player right-clicks a cell
  to pencil it, then left-clicks another cell
- **THEN** the left-click reverts to real entry, exactly as upstream
