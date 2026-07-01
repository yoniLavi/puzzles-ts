# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: The engine exposes each game's custom-params configuration UI

The engine SHALL let a game describe its **custom-params** configuration form so
the app's "Custom type…" dialog can edit the game's parameters, mirroring the
per-game preferences surface. The `Game` interface SHALL define an optional
declarative `paramConfig`: an ordered list of field descriptors, each with a
stable keyword, a display name, a type (`string` for a text field — e.g. a numeric
width/height — `choices` for a select, or `boolean` for a checkbox), and
`get`/`set` accessors over the game's `Params`. A shared width/height helper SHALL
supply the common dimension fields so a plain w/h game declares them in one line.

The `Midend` SHALL build the app's `ConfigDescription` and initial `ConfigValues`
from `paramConfig` and the current params, and SHALL apply a submitted form by
mapping the values back onto a copy of the params, validating them with the
game's own `validateParams`, and — on success — adopting the new params (so the
app generates a new game) or — on failure — returning the validation error string
without applying. The worker-side adapter SHALL forward these to the midend rather
than return an empty configuration. A game that declares no `paramConfig` keeps an
empty custom dialog (correct for a preset-only game).

This is independent of the type-summary `describeParams` hook (which renders the
menu label, not the form) and of the preferences surface.

#### Scenario: A width/height game's custom dialog is populated and applied

- **WHEN** the "Custom type…" dialog is opened for a TS game that declares
  `paramConfig` (e.g. width/height)
- **THEN** the form shows a field per descriptor initialised from the current
  params
- **AND** submitting valid values validates them with the game's `validateParams`
  and generates a new game at those params

#### Scenario: An invalid custom value is rejected with the game's message

- **WHEN** the submitted values fail the game's `validateParams`
- **THEN** the engine returns the validation error string and does not change the
  current params

#### Scenario: A game without paramConfig keeps an empty dialog

- **WHEN** a TS game declares no `paramConfig`
- **THEN** its custom dialog is empty and no fields are shown (unchanged behaviour)
