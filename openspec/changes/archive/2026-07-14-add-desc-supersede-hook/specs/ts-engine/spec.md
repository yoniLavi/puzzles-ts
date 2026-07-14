# ts-engine

## ADDED Requirements

### Requirement: A game can supersede its game description mid-play

The engine SHALL let a game replace the stored game description (and optionally a
private, serialisation-only description) after a move commits — upstream
`midend_supersede_game_desc` — without games holding a midend back-reference and without
`executeMove` losing purity. On supersession the midend SHALL emit its id-change
notification so the shareable game ID reflects the real board, restart SHALL restart the
superseded description, and a save taken after supersession SHALL restore the superseded
(private, when provided) description.

#### Scenario: Mines' first click generates the real layout

- **WHEN** a game's first move generates the actual board (first-click-never-a-mine) and
  signals supersession with the real description and a private layout-only description
- **THEN** the stored description is replaced, the id-change notification fires, and the
  shareable game ID names the real board

#### Scenario: Restart after supersession

- **WHEN** the player restarts after the description was superseded
- **THEN** the game restarts from the superseded description, not the pre-supersession
  placeholder

#### Scenario: Save and restore mid-game

- **WHEN** the player saves after supersession and later restores
- **THEN** the restored game is built from the superseded (private, when provided)
  description and replays cleanly
