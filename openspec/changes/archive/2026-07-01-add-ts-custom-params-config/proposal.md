# Model the "Custom type…" configuration UI for TS-ported games

## Why

The **"Custom type…" dialog is empty for every TS-ported game** (owner-found on
Pattern, 2026-07-01): it shows only the game-id title and Cancel/OK, no fields.
Root cause is systemic, not per-game:

- `TsWorkerPuzzle.getCustomParamsConfig()`
  (`src/native/engine/worker-adapter.ts`) returns an unconditional empty config,
  and `setCustomParams` is a no-op stub.
- The `Game` interface (`src/native/engine/game.ts`) has **no member that
  describes config-form fields** — `describeParams` only feeds the type-*summary
  string* (`ts-engine` "A game maps its params to type-summary config values"),
  not the input widgets.

So the whole custom-params round-trip is unimplemented for TS games — the
worker-adapter header flags it as "a later cross-cutting change, not modelled
here yet." For preset-only games (Flip) an empty dialog is acceptable; for
Pattern (which wants any W×H beyond its five presets) it is a live block.

The app-side form machinery is already built and used by the C/WASM path
(`src/puzzle/puzzle-config.ts` `PuzzleCustomParamsForm`, the
`ConfigDescription`/`ConfigValues` types); only the TS engine's side of the
contract is missing.

## What Changes

- **Add a declarative `paramConfig` to the `Game` interface**, mirroring the
  proven `prefs` surface (`ts-engine` "The engine supports per-game user
  preferences"): an ordered list of field descriptors (`kw`, `name`, a `string` /
  `choices` / `boolean` type, and `get`/`set` accessors over `Params`), from which
  the engine builds the `ConfigDescription` and parses `ConfigValues` back.
  Validation reuses the game's existing `validateParams`.
- **Implement the round-trip in the engine**: `Midend.getCustomParamsConfig()`
  (current params → field descriptors + values), `getCustomParams()`, and
  `setCustomParams(values)` (values → params → `validateParams` → error string or
  apply); the worker-adapter forwards these instead of returning empty.
- **A shared `dimensionParamConfig()` helper** supplies the width/height fields so
  the common w/h game is one line — the same amortisation as the shared dimension
  param parser.
- **Phase 1 (unblocks Pattern):** the engine plumbing + the width/height helper,
  wired into Pattern and the other w/h games. **Phase 2:** the variant games add
  their extra fields (Solo's jigsaw/killer/X + difficulty, Flip's shape-type,
  Undead's count-style, Keen's difficulty, …).

**Pattern needs no game-specific work** — its params are exactly `{w, h}`, so
Phase 1's shared width/height path is its complete fix; there is no separate
Pattern change.

## Impact

- Affected specs: **`ts-engine`** (ADD "The engine exposes each game's
  custom-params configuration UI").
- Affected code: `src/native/engine/game.ts` (the `paramConfig` member + a
  `dimensionParamConfig` helper), `src/native/engine/midend.ts` (build + parse +
  apply), `src/native/engine/worker-adapter.ts` (forward instead of empty), and a
  one-line `paramConfig` per w/h game in Phase 1.
- No change to `describeParams` / the type-summary path or its
  `augmentation.test.ts` guard; no change to the preferences surface.
- Independent of the deduction-engine work; Pattern's hint/solver Phase-3
  (`remove-pattern-hint-fallback`) is separately tracked.
