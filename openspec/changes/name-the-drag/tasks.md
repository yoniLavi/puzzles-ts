## 1. The type and the pilot

- [x] 1.1 Add `GridDrag` (a class, so the midend can find one by `instanceof`)
      and `newDrag` / `startDrag` / `moveDrag` / `endDrag` to
      `engine/pointer.ts`, beside `GridCursor`.
- [x] 1.2 Write its own test and prove it fails. Six mutations, all caught:
      `startDrag` not setting `live` (5 failures), anchoring only the far end
      (2), `moveDrag` always reporting a change (1), moving a drag that is not
      running (1), `endDrag` not clearing (1), and `GridDrag` ceasing to be a
      class (8 — the `instanceof` the midend will depend on).
- [x] 1.3 Convert **Tents**. Nothing moved: typecheck clean, all snapshots
      unchanged.
- [x] 1.3a Two cross-game guards caught the rest, and both were right.
      `capability-surface`'s snapshot records each game's `Ui` field names, so
      Tents' four loose coordinates collapsing to one `drag` is a one-line diff
      there — re-baselined, and the line reads exactly that, with `dragButton`
      and `dragOk` correctly staying. And `emittable-keys` found that
      **Galaxies already had a private `startDrag`**, which the new engine
      export now shadows. It is a genuinely different function (it remembers a
      source, a dot and a target, not an anchor and a current), so Galaxies is
      rightly not in the six; it is renamed `enterDrag`, which is what its own
      doc comment already called it. Expect this per batch: the engine claiming
      a generic verb collides with whatever a game called its own.
- [x] 1.4 **What the pilot taught, and it changes the plan.** Three things:

      (a) **The drag path had no test at all.** Swapping the two arguments of
      Tents' drag anchor passed all 27 of its tests. Its one "drag model" test
      does press→release on a single cell and never moves the pointer, so no
      motion, no axis snap and no off-grid release was exercised. So a drag
      test is **part of** each conversion, not a nicety: without one, converting
      a game's drag is a refactor with no net. Four plants in the converted
      code are now caught (anchor axes swapped, `moveDrag` never called, release
      not ending the drag, `dragOk` ignored).

      (b) **`dragOk` is not liveness and must not move into `GridDrag`.** In
      Tents and Boats it means "the pointer is over a valid cell right now" —
      false when the drag leaves the grid, true again when it returns, and a
      release while false commits nothing. Only the two line-drag games have it.
      The proposal's table said otherwise and is corrected.

      (c) **The four helpers are the right four, but `dragButton` stays.** Tents
      needs the button past the press (left paints tents, right paints grass),
      so the payload it picked at press time is its own; `drag.live` answers
      liveness and nothing else moved.

## 2. The rest of the six

**Each conversion ships a drag test, per 1.4(a), and each is checked by planting
in the converted path rather than by a green suite.** Before converting a game,
plant in its *existing* drag code first and record what survives — that number is
what the batch is actually buying.

- [ ] 2.1 Boats and Pattern (Boats has the `dragOk` shape Tents just proved;
      Pattern is a plain `dragging`).
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
