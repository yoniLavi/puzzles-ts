# adopt-declarative-config-helpers — tasks

## 1. Params config

- [ ] 1.1 For each of the 11 hand-rollers (`ascent`, `bricks`, `lightup`, `loopy`,
      `map`, `mines`, `mosaic`, `rome`, `seismic`, `sticks`, `unruly`), check
      whether its hand-written table is **byte-equivalent** to what
      `dimensionParamConfig()` produces. A game whose labels or parsing differ is
      not a hand-roller of the same thing and stays as it is — record which.
- [ ] 1.2 Adopt the helper in the eight with plain `w`/`h` params.
- [ ] 1.3 `loopy`, `mosaic` and `unruly` spell their dimensions differently.
      Either widen the helper to take a field accessor pair, or leave them and
      record why. **Do not rename a game's params fields to fit the helper** —
      that is contorting a game to fit a contract, which the standing guardrail
      forbids.
- [ ] 1.4 After each game, confirm its `paramConfig` still yields the same fields
      and labels (`custom-params.test.ts` is the existing guard).

## 2. Pencil preferences

- [ ] 2.1 Confirm the three preference declarations are identical across `solo`,
      `keen`, `unequal` and `towers` — including the **player-visible wording**,
      which is the part that matters most for having one source.
- [ ] 2.2 Extract `pencilPrefs()` into the engine, parameterised only where the
      four genuinely differ (if they do not differ at all, take no parameters).
- [ ] 2.3 Adopt in all four. `midend-prefs.test.ts` covers the preference
      plumbing; confirm it still passes.

## 3. Verify the no-op

- [ ] 3.1 No differential fixture and no render snapshot may change. These tables
      are consumed by dialogs, not by any solver or codec.
- [ ] 3.2 **Browser check, and this one is not optional.** A `paramConfig`
      regression is invisible to the suite — it shows up as an empty or
      mislabelled Custom-type dialog, which is exactly the failure
      `add-ts-custom-params-config` was created to fix. Open the Custom dialog for
      at least one adopting game per shape, and the preferences dialog for one
      latin-family game.
- [ ] 3.3 Full gate green.

## 4. Close out

- [ ] 4.1 Re-run `npm run metrics`; report the cross-game clone-line delta
      against the `metrics/2026-08-01-after` baseline (1,985 lines).
- [ ] 4.2 Note in `docs/porting/game-port-playbook.md` that a new port declares
      `paramConfig: dimensionParamConfig()` rather than writing the table, and
      that a latin-family port with pencil marks uses `pencilPrefs()`.
- [ ] 4.3 If a helper still has non-adopters afterwards, say which and why. An
      unused helper is worse than no helper, and a partially-adopted one is the
      drift this change exists to close.
