# adopt-declarative-config-helpers — tasks

## 1. Params config

- [x] 1.1 For each of the 11 hand-rollers (`ascent`, `bricks`, `lightup`, `loopy`,
      `map`, `mines`, `mosaic`, `rome`, `seismic`, `sticks`, `unruly`), check
      whether its hand-written table is **byte-equivalent** to what
      `dimensionParamConfig()` produces. A game whose labels or parsing differ is
      not a hand-roller of the same thing and stays as it is — record which.
      **Result: all eleven were byte-equivalent** (same `kw`s, same labels, same
      `type: "string"`, same `String(...)` / `parseConfigInt(...)` accessors);
      the only differences are *which fields* they name.
- [x] 1.2 Adopt the helper in the games with plain `w`/`h` params. **Nine, not
      eight**: the proposal listed `loopy` among the field-different games, but
      `LoopyParams` has plain `w`/`h` — its `paramConfig` simply lives in
      `loopy/params.ts` rather than `index.ts`, which is why the survey
      mis-classified it. Adopted in `ascent`, `bricks`, `lightup`, `loopy`, `map`,
      `mines`, `rome`, `seismic`, `sticks`.
- [x] 1.3 `mosaic` (`width`/`height`) and `unruly` (`w2`/`h2`) spell their
      dimensions differently. **The helper was widened**, taking an optional
      `DimensionFields<P>` key pair; the games' fields were *not* renamed.
      The key type is `PlainNumberKey<P>`, deliberately narrower than "numeric
      key" — a field typed as a literal union (a difficulty index `0 | 1 | 2`)
      is excluded, because a free-text integer box must not write an
      out-of-union value into it.
- [x] 1.4 After each game, confirm its `paramConfig` still yields the same fields
      and labels. `custom-params.test.ts` passes; **`grep 'kw: "width"'` over
      `src/native` now returns nothing outside tests — the helper has zero
      non-adopters**, which is the outcome the spec asks for.

## 2. Pencil preferences

- [x] 2.1 Confirm the preference declarations are identical across the games that
      declare them, **including the player-visible wording**. Found *more* than
      the proposal estimated, and the split is not where it guessed:
      - `sticky-pencil-mode` — **ten** games, byte-identical (`seismic`,
        `mathrax`, `abcd`, `solo`, `undead`, `keen`, `unequal`, `towers`,
        `salad`, `crossing`);
      - `pencil-keep-highlight` — **five**, byte-identical (`solo`, `undead`,
        `keen`, `unequal`, `towers`);
      - `auto-pencil` — four, and **the wording genuinely differs in each**,
        because it names the regions that game clears ("its row, column and
        block" in Solo; "its row and column" in Keen/Unequal; Towers places a
        *tower*, not a number).
- [x] 2.2 Extract into `src/native/engine/pencil-prefs.ts`, parameterised only
      where the games genuinely differ. **Three factories, not one options bag**:
      each then carries the precise `Ui` constraint for the field it drives
      (`Ui extends { pencilSticky: boolean }`), so a game offering a preference
      whose field it lacks fails to compile rather than reading `undefined` at
      runtime; and separate items drop into any array position, which Crossing
      needs (it lists sticky-pencil **fourth**, after three of its own).
      `autoPencilPref(name)` takes its label as a **required** argument, so no
      game can inherit a silently wrong sentence.
- [x] 2.3 Adopt in all ten. `midend-prefs.test.ts` passes. New
      `pencil-prefs.test.ts` adds a **drift guard**: any game declaring one of
      the two shared keywords with a divergent label fails. Verified
      load-bearing by mutation (a deliberately wrong expected label produced ten
      offenders), and it pins the reach counts so it cannot pass vacuously if a
      future refactor stops registering games.

## 3. Verify the no-op

- [x] 3.1 No differential fixture and no render snapshot changed. `git status`
      shows no file under any `__fixtures__/` or `__snapshots__/`; the diff
      touches no solver, generator or description codec.
- [x] 3.2 **Browser check** (Chrome, `npm run dev`). Custom-type dialog:
      `unruly?type=14x10de` → Width **14**, Height **10** (the definitive
      not-swapped check, since Unruly's presets are all square); submitting
      Width 16 produced type **16x10 Easy**, so the write path maps correctly
      too. `mosaic?type=12x9` → Width **12**, Height **9**.
      `loopy?type=9x7t2dn` → Width **9**, Height **7**, Grid type *Honeycomb*.
      Preferences dialog on Towers: all three pencil items present, in order,
      with the expected wording; toggling auto-pencil persisted across a reload,
      exercising `set` as well as `get`. **0 console errors.**
- [x] 3.3 Full gate green.

## 4. Close out

- [x] 4.1 Re-ran `npm run metrics` (`metrics/2026-08-01-config-helpers`).
      **Cross-game clone lines 1985 → 1612, a delta of −373 (−18.8%)** against
      the `metrics/2026-08-01-after` baseline; blocks 146 → 130; overall
      duplication 1.89% → 1.63%. `keen ↔ unequal` (70) and `towers ↔ unequal`
      (62) left the worst-pairs table entirely; `mathrax ↔ seismic` fell 93 → 79.
- [x] 4.2 `docs/porting/game-port-playbook.md` §"Custom type…" now says a new
      port never hand-writes the width/height pair (with the field-map form for
      a game that spells them differently), and the pencil-mark section says the
      three preferences come from `engine/pencil-prefs.ts`.
- [x] 4.3 **Neither helper has a non-adopter.** `dimensionParamConfig` is called
      by all 44 two-dimension games; the two shared pencil prefs are called by
      all ten and all five. The only deliberate non-share is `auto-pencil`'s
      *label*, recorded above and in the helper's own doc comment.
- [x] 4.4 **Swept for anything else of this shape, and recorded the one no-go.**
      Across all 57 games there are now **28 distinct hand-written `prefs`
      items**, and exactly **one** appears in two games: `kw: "appearance"` /
      `name: "Puzzle appearance"` in Pearl and Towers. It is **not** extracted,
      because the two share only the label — Towers offers `["2D", "3D"]` over
      `ui.threeD`, Pearl `["Traditional", "Loopy-style"]` over `ui.guiStyle`.
      That is a coincidence of wording, not a shared decision, and a helper over
      it would contort two unrelated preferences into one contract.

## 5. Finding worth carrying (fed to `audit-test-suite-strength`)

- [x] 5.1 **The engine's `custom-params.test.ts` round-trip guard is
      structurally blind to a swapped field map.** `get` and `set` name the same
      field, so `set(get(p))` is the identity whether the "Width" item drives
      `w2` or `h2` — and Mosaic and Unruly ship only *square* presets, so no
      preset-derived generic check could distinguish the two orders for exactly
      the two games where the mapping is new. Direct per-game assertions were
      added (`unruly.test.ts`, `mosaic.test.ts`) naming the fields and the
      resulting game id. Generalises: **a test whose only observer is the thing
      under test cannot establish ground truth** — which is the same question
      mutation testing asks, and is why this was handed to the next change.
