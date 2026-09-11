## 1. Pegs

- [ ] 1.1 Add a failing test: arm a keyboard jump, undo the move that placed the
      peg, press an arrow, and expect no throw. Verify it fails on `main` with
      "Grid contents were invalid for this move".
- [ ] 1.2 Add `changedState` to the Pegs game object, clearing the drag and the
      armed jump, and verify 1.1 passes and Pegs' own tests are unchanged.

## 2. Crossing

- [ ] 2.1 Add a failing test that paints twice on one draw state: with nothing
      held, then holding a clue. Verify it fails on `main`, where the second
      paint emits no `COL_HELD` op while a fresh draw state emits four.
- [ ] 2.2 Include the held clue in `panelState`, and verify 2.1 passes, the
      clue's box is erased when it is put back, and the render snapshots are
      unchanged.

## 3. Close

- [ ] 3.1 Run the full gate, open Pegs and Crossing in the running app, and
      verify the armed jump survives an undo without throwing and that picking a
      clue up and putting it back paints and erases its box.
- [ ] 3.2 Archive the change.
