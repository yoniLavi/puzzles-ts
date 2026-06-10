## ADDED Requirements

### Requirement: A single quick-save slot per puzzle

The app SHALL provide one dedicated quick-save slot per `puzzleId`,
persisted in IndexedDB as a distinct save type, separate from the named
save library and from autosave. Saving to the slot SHALL overwrite the
previous quick-save for that puzzle. The slot SHALL be readable back into
the puzzle via the same engine-agnostic save codec the library uses, so
it works for both TS-engine and C/WASM games. The presence of a slot for
a puzzle SHALL be observable reactively so a quick-load control can
enable/disable itself.

#### Scenario: Quick-save then quick-load round-trips

- **WHEN** the player quick-saves a board and later quick-loads
- **THEN** the puzzle is restored to the quick-saved state
- **AND** a second quick-save overwrites the slot rather than adding a
  second record

#### Scenario: Quick-load disabled with no slot

- **WHEN** no quick-save exists for the current puzzle
- **THEN** the quick-load control is disabled, and it becomes enabled as
  soon as a quick-save is made

### Requirement: Combined Check-&-Save gates the checkpoint on a clean board

The app SHALL provide a single primary control that, for a game
implementing mistake-checking (`canFindMistakes`), validates before
saving: it SHALL run `findMistakes()` and, only if zero mistakes are
found, quick-save the board and confirm; if one or more mistakes are
found it SHALL NOT write the quick-save slot (the previous quick-save
SHALL be left intact), and SHALL surface the count while the mistaken
cells are highlighted. For a game without mistake-checking, the same
control SHALL perform a plain quick-save. The control's label SHALL
reflect which behaviour applies ("Check & Save" vs "Quick-save").

#### Scenario: Clean board is checkpointed

- **WHEN** the player activates Check-&-Save on a mistake-checking game
  whose board has no mistakes
- **THEN** the board is quick-saved and a confirmation is shown

#### Scenario: Board with mistakes is not checkpointed

- **WHEN** the player activates Check-&-Save and the board has mistakes
- **THEN** no quick-save is written, the previous quick-save (if any)
  remains, the mistaken cells are highlighted, and the count is reported

#### Scenario: Game without mistake-checking does a plain quick-save

- **WHEN** the active game does not implement mistake-checking
- **THEN** the control is labelled "Quick-save" and activating it
  quick-saves the board directly

### Requirement: Quick-save keyboard shortcut

The app SHALL bind Cmd/Ctrl+S to the Check-&-Save action and SHALL
prevent the browser's default "save page" behaviour for that chord while
a puzzle is open.

#### Scenario: Cmd/Ctrl+S triggers Check-&-Save

- **WHEN** the player presses Cmd/Ctrl+S with a puzzle open
- **THEN** the Check-&-Save action runs and the browser does not show its
  save-page dialog
