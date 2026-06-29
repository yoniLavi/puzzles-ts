# solo Specification (delta)

## MODIFIED Requirements

### Requirement: Solo exposes pencil-mark preferences

The game SHALL expose, via the `prefs` hook, a sticky-pencil-mode preference
(default on; right-click toggles a persistent pencil mode), an auto-pencil
preference (**default off**; when on, placing a digit strikes it from the pencil
marks of its row, column, block, and diagonal), and a keep-mouse-highlight-after-pencil
preference (default off, matching upstream `PREF_PENCIL_KEEP_HIGHLIGHT`).
Preference values SHALL live on the `Ui` and be set as defaults by `newUi`. With
auto-pencil off (the default), note cleanup is manual — the player removes obvious
candidates via the mark-all control or a hint.

#### Scenario: Pencil preferences are exposed with their defaults

- **WHEN** the game's preferences are read
- **THEN** they include a sticky-pencil-mode boolean defaulting to on
- **AND** an auto-pencil boolean defaulting to off
- **AND** a keep-highlight boolean defaulting to off
