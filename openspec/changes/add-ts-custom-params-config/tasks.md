# Tasks — TS custom-params configuration UI

## 1. Phase 1 — engine plumbing + width/height (unblocks Pattern)
- [ ] 1.1 Add the declarative `ParamConfigItem<Params>` type + optional
      `Game.paramConfig` member (`game.ts`), mirroring `GamePref` (string /
      choices / boolean, `get`/`set` over a params copy).
- [ ] 1.2 Add the shared `dimensionParamConfig()` helper (width/height string
      items, integer parse + bounds) in `src/native/engine/`.
- [ ] 1.3 Implement the engine round-trip in `midend.ts`: `getCustomParamsConfig`
      (params → items + values), `getCustomParams`, `setCustomParams` (values →
      params copy → `validateParams(_, true)` → error string or apply + new game).
- [ ] 1.4 Forward all three from `worker-adapter.ts` (`TsWorkerPuzzle`) to the
      midend instead of returning `EMPTY_CONFIG` / no-op.
- [ ] 1.5 Add `paramConfig: dimensionParamConfig()` to Pattern and the other w/h
      games registered today.
- [ ] 1.6 Tests: unit-test the round-trip (build → edit → parse → validate → apply;
      an invalid value returns the `validateParams` error and does not apply). Add
      a guard that every TS game with `paramConfig` round-trips its default params
      (`get`∘`set` ≡ identity through `ConfigValues`).
- [ ] 1.7 Dev-verify in the browser: Pattern "Custom type…" shows width/height,
      accepts a custom size (e.g. 12×18), generates it, and rejects an invalid one
      with the validation message. 0 console errors.

## 2. Phase 2 — variant games' extra fields
- [ ] 2.1 Add `paramConfig` fields for the non-dimension params of the variant
      games: Solo (jigsaw/killer/X + symmetry + difficulty), Flip (shape-type),
      Undead (count-style + pictures/letters where a param, not a pref), Keen /
      Unequal / Towers / Galaxies (difficulty), and any other registered game whose
      ID carries params beyond W×H. Each is a declarative addition; no engine change.
- [ ] 2.2 Extend the round-trip guard to cover the variant games' presets.

## 3. Close out
- [ ] 3.1 `openspec validate add-ts-custom-params-config --strict` passes.
- [ ] 3.2 Full gate green (tsc → biome lint → vitest → vite build).
- [ ] 3.3 On owner acceptance, commit + archive.
