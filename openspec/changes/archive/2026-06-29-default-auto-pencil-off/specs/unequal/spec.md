# unequal Specification (delta)

## MODIFIED Requirements

### Requirement: Unequal exposes pencil-mark preferences

The game SHALL expose, via the `prefs` hook, a "sticky pencil mode" boolean
(default on — right-click toggles a persistent pencil mode), an "auto-pencil"
boolean (**default off** — when on, placing a number strikes it from the pencil
marks of its row and column), and a "keep mouse highlight after changing a pencil
mark" boolean (default off), each stored on the `Ui` and applied by
`interpretMove`/`executeMove`. With auto-pencil off (the default), note cleanup is
manual — the player removes obvious candidates via the mark-all control or a hint.

#### Scenario: Sticky pencil mode persists across left-clicks

- **WHEN** sticky pencil mode is on and the player right-clicks to enter pencil
  mode, then left-clicks another empty cell
- **THEN** the new cell is highlighted for pencil entry (the mode is not reset)
