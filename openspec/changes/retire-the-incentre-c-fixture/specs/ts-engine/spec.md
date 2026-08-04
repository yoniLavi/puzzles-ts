## MODIFIED Requirements

### Requirement: The engine supports per-game user preferences

The engine SHALL support per-game user preferences, the idiomatic-TS
realisation of upstream's `get_prefs`/`set_prefs`. The `Game` interface
SHALL define an **optional** declarative `prefs` member: an ordered list
of preference items, each carrying a stable keyword (`kw`), a
human-readable `name`, a discriminated `type` (`"boolean"` or
`"choices"`, with `choices` items carrying the ordered choice labels),
and `get`/`set` accessors that read and write the preference's value on
the game's **`Ui`** value (preferences live on the `Ui`, exactly as
upstream stores them on `game_ui`, so `interpretMove` and `redraw` see
them). A game with no preferences SHALL omit `prefs`, and the engine
SHALL report an empty preferences set for it — the correct behaviour for
the four-plus existing ports, not a stub.

The `Midend` (and the `EngineCore` surface it implements) SHALL expose
`getPreferencesConfig()`, `getPreferences()`, and `setPreferences(values)`
that translate the declarative `prefs` to and from the app's existing
`ConfigDescription`/`ConfigValues` shapes: a `boolean` item maps to a
boolean value, a `choices` item maps to the selected zero-based numeric
index. `setPreferences` SHALL apply only the keys present in the supplied
values (leaving others unchanged), coerce each value to its item's type,
and request a repaint (a preference such as "highlight crossed edges"
changes rendering). The `TsWorkerPuzzle` worker adapter SHALL delegate
these three methods to the engine, so the app's existing
`puzzle-preferences-form` and per-puzzle IndexedDB persistence drive a TS
game's preferences with no app-shell change.

Because the midend recreates the `Ui` (`newUi`) on every new game / load
/ game-from-id, the midend SHALL retain the last-applied preference
values and re-apply them after each `Ui` recreation, so a player's
preference survives starting a new game (upstream keeps one `game_ui`
across new games; this reproduces that effect). Preferences SHALL NOT be
written into the save file (they are app-level, persisted per puzzle by
the existing settings store). The engine SHALL NOT carry a binary
`savePreferences`/`loadPreferences` surface. It existed only to mirror
upstream's `midend_serialise_prefs` across the C/WASM boundary; the app has
never used it for persistence, and the TS adapter answered it with an empty
buffer — a method that silently returned nothing rather than refusing, which is
worse than its absence. If an import/export feature is ever wanted it SHALL
choose its own wire format rather than inherit the C's.

#### Scenario: A game declares preferences and the app drives them unchanged

- **WHEN** a registered TS game declares a `prefs` list and the user opens
  the puzzle preferences form
- **THEN** `getPreferencesConfig()` returns a `ConfigDescription` whose
  items reflect the declared keywords, names, types, and choice labels
- **AND** `getPreferences()` returns the current value of each preference
  (boolean, or the numeric index for a choice) read from the live `Ui`
- **AND** toggling a preference calls `setPreferences(...)`, which writes
  the new value onto the `Ui` and repaints

#### Scenario: A preference survives a new game

- **WHEN** the user changes a preference and then starts a new game of the
  same puzzle
- **THEN** the freshly created `Ui` carries the player's chosen
  preference values, not just the `newUi` defaults

#### Scenario: A game with no preferences reports an empty set

- **WHEN** the engine is asked for the preferences of a game that omits
  `prefs` (e.g. Flip, Galaxies)
- **THEN** `getPreferencesConfig()` returns an empty item set and
  `getPreferences()` returns an empty value map, with no error

#### Scenario: A preference change repaints even when no board state moved

- **WHEN** the user toggles a preference that affects only rendering
  (e.g. Untangle's vertex style or crossed-edge highlight), changing no
  vertex position
- **THEN** the midend forces a full repaint (dropping the per-frame draw
  cache, as for a palette/font change) so the new appearance shows
  immediately rather than being skipped by the game's redraw early-out

