## 1. Pegs

- [x] 1.1 Add a failing test: arm a keyboard jump, undo the move that placed the
      peg, press an arrow, and expect no throw. Verify it fails on `main` with
      "Grid contents were invalid for this move".
- [x] 1.2 Add `changedState` to the Pegs game object, clearing the drag and the
      armed jump, and verify 1.1 passes and Pegs' own tests are unchanged.
- [x] 1.3 Re-baseline `capability-surface.test.ts`'s snapshot: Pegs gains
      `changedState`, which is one added line under `"id": "pegs"` and nothing
      else. That test exists to make a capability change a reviewable diff
      line, so the move is the intended outcome rather than noise.

## 2. Crossing

- [x] 2.1 Add a failing test that paints twice on one draw state: with nothing
      held, then holding a clue. Verify it fails on `main`, where the second
      paint emits no `COL_HELD` op while a fresh draw state emits four.
- [x] 2.2 Include the held clue in `panelState`, and verify 2.1 passes, the
      clue's box is erased when it is put back, and the render snapshots are
      unchanged.
- [x] 2.3 Delete `CLASS_COLOR`'s unreachable `3 held` entry and its label, left
      behind when held stopped being a color class — the label is what made the
      key read as complete.

## 3. The rule, past the two games

- [x] 3.1 Sweep the collection for Pegs' shape: list every game with no
      `changedState`, read the ones that arm a gesture across separate presses,
      and record the verdict per game. Result: six such games, all safe, no
      second fix.
- [x] 3.2 Write both rules where the next game meets them — the test for needing
      `changedState` in its own doc comment, and the armed-gesture and
      cache-key shapes in `docs/games/rendering.md`.
- [x] 3.3 Record the fuzz that could not catch this in `docs/test-strength.md`
      § 7, with the control that disproved it.

## 4. Close

- [x] 4.1 Run the full gate, open Pegs and Crossing in the running app, and
      verify the armed jump survives an undo without throwing and that picking a
      clue up and putting it back paints and erases its box. Both confirmed in
      Chrome with an empty console: the armed ring clears on the undo and the
      next arrow only moves the cursor; the held box paints and erases on a
      draw state that has already painted. The renumbered panel classes were
      checked in the same pass — across-fit blue, down-fit amber, nowhere gray.
- [x] 4.2 Archive the change.
