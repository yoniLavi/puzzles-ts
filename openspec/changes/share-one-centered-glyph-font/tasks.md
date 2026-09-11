## 1. The helper

- [ ] 1.1 Add `glyphFont(size)` to `src/engine/draw.ts`, returning the centered
      variable-font options, and name it in `docs/games/engine-catalog.md`.
      Verify the engine-catalog check passes.

## 2. The call sites

- [ ] 2.1 Replace the 60 inline literals across the 43 game files, including
      Salad's local helper, and verify the count of remaining inline copies is
      zero.
- [ ] 2.2 Verify the edit by shape: every removed line is one of the two known
      literal forms, every added line is a `glyphFont(` call, and read the
      exceptions.
- [ ] 2.3 Verify every render snapshot passes without being re-recorded, and that
      no game's own tests change.

## 3. Close

- [ ] 3.1 Run the full gate.
- [ ] 3.2 Archive the change.
