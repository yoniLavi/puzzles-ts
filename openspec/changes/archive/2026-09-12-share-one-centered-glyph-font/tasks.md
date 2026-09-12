## 1. The helper

- [x] 1.1 Add `glyphFont(size)` to `src/engine/draw.ts`, returning the centered
      variable-font options, and name it in `docs/games/engine-catalog.md`.
      Verify the engine-catalog check passes.

## 2. The call sites

- [x] 2.1 Replace the inline literals across the game files, including the three
      local helpers, and verify the count of remaining inline copies is zero.
      **Measured by parse, not by grep: 56 literals in 40 files**, against the
      60-in-43 the proposal was scaffolded with. After the edit, `src/games`
      holds 65 `glyphFont(` calls: 56 − 3 (the three local helpers' bodies, which
      became nothing) + 12 (those helpers' own call sites, four each in Salad,
      Group and Ascent). One exact literal remains in the tree — the shared
      helper's own `return`.
- [x] 2.2 Verify the edit by shape: 324 removed lines and 117 added, every one
      classified into a known kind. The exceptions the first pass surfaced were
      three multi-line `engine/draw.ts` imports collapsed to one line (one of
      them carrying `drawRecessedBorder as drawBevel`, checked by hand to
      confirm the alias survived), the eight `textOpts`/`textStyle` call sites
      renamed, and Ascent's arrow-helper body. No line in the diff is anything
      else.
- [x] 2.3 Verify every render snapshot passes without being re-recorded, and that
      no game's own tests change. 314 test files, 9138 tests, zero `.snap` files
      modified.

## 3. Close

- [x] 3.1 Run the full gate.
- [x] 3.2 Archive the change.
