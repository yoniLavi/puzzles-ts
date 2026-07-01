# Tasks — TS custom-params configuration UI

## 1. Phase 1 — engine plumbing + width/height (unblocks Pattern)
- [x] 1.1 Add the declarative `ParamConfigItem<Params>` type + optional
      `Game.paramConfig` member (`game.ts`), mirroring `GamePref` (string /
      choices / boolean, `get`/`set` over a params copy).
- [x] 1.2 Add the shared `dimensionParamConfig()` helper (width/height string
      items, integer parse + bounds) in `src/native/engine/params.ts`.
- [x] 1.3 Implement the engine round-trip in `midend.ts`: `getCustomParamsConfig`
      (params → items + values), `getCustomParams`, `setCustomParams` (values →
      params copy → `validateParams(_, true)` → error string or apply + new game).
      Also `encodeCustomParams` (build draft → validate → encoded id or `#ERROR:`),
      correcting the adapter's prior current-params stub.
- [x] 1.4 Forward all four from `worker-adapter.ts` (`TsWorkerPuzzle`) to the
      midend instead of returning `EMPTY_CONFIG` / no-op (removed `EMPTY_CONFIG`).
- [x] 1.5 Add `paramConfig: dimensionParamConfig()` to the pure-w/h games
      registered today: Pattern, Filling, Range, Fifteen.
- [x] 1.6 Tests: `custom-params.test.ts` unit-tests the round-trip (build → edit →
      parse → validate → apply; invalid value returns the `validateParams` error and
      does not apply; loose-typed coercion; `encodeCustomParams` `#ERROR:`; a game
      without `paramConfig` keeps an empty dialog). Guard: every registered game with
      `paramConfig` round-trips all its presets (`get`∘`set` ≡ identity).
- [x] 1.7 Dev-verified in the browser (Playwright): Pattern "Custom type…" shows
      Width/Height populated from current params, accepts 12×18 and generates it,
      and rejects width 0 with "Width and height must both be at least one" (dialog
      stays open, type unchanged). 0 console errors.

## 2. Phase 2 — variant games' extra fields
- [x] 2.1 Added `paramConfig` for every registered variant game (labels/choices
      from `augmentation.ts`, matching upstream's config labels; `get` mirrors each
      game's `describeParams`, `set` is the inverse). No engine change. Games:
      Flip (shape-type), Galaxies/Singles/Undead/Keen/Towers/Unequal/Unruly
      (difficulty ± width/height), Flood (colours + extra moves), Samegame
      (colours + scoring-system choices + solubility), Sixteen/Twiddle
      (shuffling-moves ± block-size/flags), Palisade (region-size), Pegs
      (board-type), Blackbox (no-of-balls "N"/"N-M" string), Mosaic
      (width/height + aggressive), Solo (columns/rows + jigsaw/x/killer +
      symmetry + difficulty — jigsaw `c*=r;r=1` folds after the column/row items,
      matching upstream `custom_params`), Guess (pegs/guesses/colours + blanks +
      duplicates), Cube (type-of-solid + top/bottom dims), Untangle
      (number-of-points). Non-`w`/`h` games (Mosaic `width`/`height`, Unruly
      `w2`/`h2`, the square games) supply their own dimension items rather than the
      shared helper. A shared `parseConfigInt` (atoi semantics: empty/non-numeric →
      0, so `validateParams` rejects with its message rather than `NaN` slipping
      through a bound check) backs every numeric `set`.
- [x] 2.2 The round-trip guard iterates `TS_PORTED_PUZZLE_IDS`, so it now covers
      all 24 games with `paramConfig` (every preset round-trips
      `get`∘`set` ≡ identity — 33 tests green).

## 3. Close out
- [x] 3.0 Fixed a latent TS-engine bug the form surfaced: `Midend.emitIdChange`
      encoded the `params#seed` random-seed with `full=false`, dropping a
      difficulty suffix. Since the app's `currentParams` prefers the seed form, the
      type-menu label (and shared seeds) lost the difficulty. Now the seed form uses
      `encodeParams(_, true)` and the `params:desc` form stays `false`, matching
      upstream `midend_get_random_seed`/`midend_get_game_id`. Regression-tested in
      `midend.test.ts`; dev-verified (Towers "Custom → Extreme" now labels
      "5x5 Extreme", was "5x5 Easy").
- [x] 3.1 `openspec validate add-ts-custom-params-config --strict` passes.
- [x] 3.2 Full gate green (tsc → biome lint → vitest 1944 → vite build).
- [ ] 3.3 On owner acceptance, commit + archive.
- [x] 3.4 Dev-verified Phase 2: Solo (columns/rows + X/Jigsaw/Killer + Symmetry +
      Difficulty; the jigsaw fold `c*=r;r=1` generated a "9 Jigsaw Trivial" board)
      and Towers (Grid size + Difficulty radiogroup Easy/Hard/Extreme/Unreasonable,
      submit generates + labels correctly). 0 console errors.
