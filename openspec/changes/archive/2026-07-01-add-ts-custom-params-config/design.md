# Design — TS custom-params configuration UI

Mirror the already-proven **`prefs`** surface (`Midend.getPreferencesConfig` /
`getPreferences` / `setPreferences`, `midend.ts`), which turns a game's
declarative preference list into the app's `ConfigDescription` and back. Custom
params are the same shape over `Params` instead of `Ui`.

## D1 — The `Game.paramConfig` member

Optional, declarative, one entry per configurable field (the params analogue of
`GamePref`):

```
type ParamConfigItem<Params> =
  | { kw; name; type: "string";  get(p): string; set(p, v: string): void }
  | { kw; name; type: "boolean"; get(p): boolean; set(p, v: boolean): void }
  | { kw; name; type: "choices"; choices: string[]; get(p): number; set(p, v: number): void }
```

- `kw` is the stable config key the app form uses; `name` the label.
- `string` renders a text field (width/height parse to integers in `set`),
  matching upstream's `C_STRING` numeric fields; `choices` a select; `boolean` a
  checkbox — the three `ConfigItem` types the app already renders.
- `get`/`set` read/write one field of a *copy* of the params, so the engine never
  mutates live params mid-edit.

A game without `paramConfig` keeps today's empty dialog (correct for a
preset-only game like Flip until Phase 2 decides otherwise).

## D2 — The shared width/height helper

`dimensionParamConfig()` returns the `[width, height]` string items (integer
parse + basic bounds), so a w/h game writes `paramConfig: dimensionParamConfig()`.
This is the Phase-1 amortisation that covers Pattern and the ~15 other w/h games
at once — the same move as the shared dimension param parser.

## D3 — The engine round-trip

- **`getCustomParamsConfig()`**: `{ title: game.id, items }` built from
  `paramConfig` (type + label + `choicenames`), exactly as `getPreferencesConfig`
  does for prefs.
- **`getCustomParams()`**: each item's `get(currentParams)` → the form's initial
  values.
- **`setCustomParams(values)`**: clone the current params, apply each item's
  `set(clone, values[kw])`, run `validateParams(clone, /*full*/ true)`; on error
  return the string (the form shows it and does not submit); on success apply the
  new params so the app generates a new game — the same effect the C path's
  `setCustomParams` has. The worker-adapter forwards all three to the midend
  instead of returning the empty shape.

Loose typing is coerced at the boundary (the form submits a string for a text
field, a number index for a choice, a boolean for a checkbox), reusing the
coercion already written for `applyPrefs`.

## D4 — Why declarative (not a free-form `getConfig()` per game)

A declarative list keeps the render *and* the parse in one place per field (no
drift between "what field to show" and "how to read it back"), lets the shared
w/h helper exist, and matches the existing `prefs` and `describeParams` idioms so
there is one mental model for "game metadata the app renders." `validateParams`
stays the single source of truth for validity, so the custom dialog rejects the
same params the game ID path would.

## D5 — Phasing

- **Phase 1**: the interface member, the engine round-trip, the
  `dimensionParamConfig` helper, and `paramConfig` on the w/h games (Pattern
  included). Unblocks the common case; dev-verify a custom W×H on Pattern.
- **Phase 2**: the variant games add their non-dimension fields (Solo
  jigsaw/killer/X + symmetry + difficulty, Flip shape-type, Undead count-style,
  Keen/Unequal/Towers difficulty, Galaxies difficulty, …). Each is a small
  declarative addition; no engine change.

## Out of scope

- The type-summary string path (`describeParams` / `augmentation.ts`) and its
  guard — unchanged.
- The preferences surface — already modelled.
- The deduction-engine unification and Pattern's hint Phase-3.
