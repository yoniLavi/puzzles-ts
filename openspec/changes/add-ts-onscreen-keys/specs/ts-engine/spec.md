# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: Games may expose on-screen key labels

The engine SHALL support an optional `Game.requestKeys(params)` hook returning an
ordered list of `KeyLabel` (`{ button, label }`) — the on-screen virtual-keypad
buttons for that game, faithful to upstream `game_request_keys`. The hook SHALL
depend only on `params` (not on `state` or `ui`), matching upstream and the fact
that the app's key panel reloads its labels only when params change. Each entry's `button` is the
key code processed exactly as the equivalent physical keypress, and `label` is the
resolved display text (the digit/letter character, or `"Clear"` for the clear key,
so the app's icon mapping renders it); the engine does not re-derive labels from
button codes.

The `EngineCore` surface SHALL expose `requestKeys(): KeyLabel[]`, and the midend
SHALL return `game.requestKeys(params)` for the current params when the hook is
present and an empty list when it is absent. The worker adapter SHALL forward this
result rather than returning a fixed empty list, so a TS-served game shows the same
keypad it showed on the C/WASM path. A game without the hook SHALL show no keypad
(an empty list), unchanged from prior behaviour.

#### Scenario: A keypad game's labels are served on the TS path

- **WHEN** the app requests the key labels for a TS-served game that implements
  `requestKeys`
- **THEN** the midend returns that game's `KeyLabel[]` for the current params
- **AND** the app renders one on-screen button per label, each entering the key
  when pressed

#### Scenario: A game without the hook shows no keypad

- **WHEN** the app requests the key labels for a TS-served game that does not
  implement `requestKeys`
- **THEN** the midend returns an empty list and no keypad is shown
