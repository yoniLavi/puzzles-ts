## 1. The type and the pilot

- [ ] 1.1 Add `GridDrag` (a class, so the midend can find one by `instanceof`)
      and `newDrag` / `startDrag` / `moveDrag` / `endDrag` to
      `engine/pointer.ts`, beside `GridCursor`.
- [ ] 1.2 Write its own test, and prove it fails: break each helper in turn
      (`startDrag` not setting `live`, `moveDrag` always reporting a change,
      `endDrag` not clearing) and record how many assertions go red for each.
- [ ] 1.3 Convert **Tents** — the smallest of the six, and its spelling is
      Boats' too. No draw call should move; verify against its snapshots.
- [ ] 1.4 Say what the pilot taught before converting anything else: whether
      `moveDrag`'s "did it change" predicate is the one Tents wanted, and
      whether the four helpers are the right four.

## 2. The rest of the six

- [ ] 2.1 Boats and Pattern (a `dragOk` and a `dragging`, both plain grid).
- [ ] 2.2 Tracks and Rect — Rect's pair is **half-grid**, so this batch is the
      one that proves the type does not assume a coordinate space.
- [ ] 2.3 Bridges last: it carries a boolean *and* a `-1` sentinel, so it is the
      only one where liveness has two sources to reconcile.

## 3. The engine cancels it

- [ ] 3.1 Have `Midend`'s `changedState` path cancel every `GridDrag` it finds
      on the `Ui`, derived by `instanceof`, with no declaration anywhere.
- [ ] 3.2 Settle the behavior question the design defers: for each of the six,
      confirm canceling on *every* state replacement is what that game wants,
      and record any game that justifies keeping its own `changedState` instead.
- [ ] 3.3 Remove the `changedState` bodies that existed only to put a gesture
      down, where the game is now covered by the engine.
- [ ] 3.4 Add the cross-game guard: a game carrying a `GridDrag` has it canceled
      across a committed move, driven through a real `Midend`. Prove it fails by
      removing the midend's cancel.

## 4. The three that are shaped differently

- [ ] 4.1 Assess Pegs (grid anchor + pixel current), Sixteen (a pixel pair and a
      cell pair) and Slide (single indices) against the contract the six
      produced. Record the verdict per game — a conversion, or a no-go with its
      reason — rather than leaving them unmentioned.

## 5. Close

- [ ] 5.1 Run the full gate, then play a drag in each converted game in the
      running app, including an undo mid-drag.
- [ ] 5.2 Archive the change.
