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

**Measured first, 2026-09-12** — one plant per game, swapping the two
coordinates written at its drag anchor, run against that game's own tests:

| game | tests failed | reading |
| --- | --- | --- |
| tents | **0** of 27 | none (the pilot; now 4 plants caught) |
| pattern | **0** of 38 | none |
| rect | **0** of 32 | none |
| bridges | **0** of 72 | none |
| boats | 2 of 125 | some |
| tracks | 3 of 88 | some |

**Four of the six have no drag coverage at all**, and the worst of them is
Bridges — the most intricate drag in the set (a cone search, `updateDragDst`,
an `nlines` count) and 72 tests that all pass with its anchor's axes swapped.

So the rule for this change, stronger than 1.4(a): **where a game has no
coverage, the drag test lands _before_ the conversion, against the unconverted
code.** A test written afterward proves the new code self-consistent; one
written first and kept passing is an actual refactoring net. Tents got away with
the other order only because the plants stood in for it.

- [x] 2.1 **Pattern** — test first, then convert, and the order paid off: the
      four new tests passed against the unconverted code and kept passing
      across the conversion, which is a real refactoring net rather than a
      self-consistency check. Anchor plant 0 → 2 failures before the conversion
      even started; four plants in the converted code all caught (axes swapped,
      `moveDrag` never called, release not ending, axis snap inverted).

      **Why its existing drag tests missed it**, worth knowing for the rest:
      three of them call `executeMove` with a hand-built `fill`, and the one
      that reaches `interpretMove` **bypasses the press** — it `Object.assign`s
      the anchor onto the `Ui` and sends only the release. The press handler
      that writes the anchor was executed by no test at all. A test that starts
      from a hand-set `Ui` cannot see the code that builds one.

      **And a second name collision.** Pattern's `drag` was a `number` holding
      the drag's button code — which is what Tents calls `dragButton`. Renamed
      `dragButton`/`releaseButton` so `drag` can be the `GridDrag`, which
      unifies a second piece of vocabulary the two games had spelled apart.
- [ ] 2.2 **Boats and Tracks** — the two that already have some coverage, so
      these are the cheap ones. Boats shares Tents' `dragOk` shape.
- [ ] 2.3 **Rect** — no coverage, and its pair is **half-grid**, so it is the
      one that proves the type assumes no coordinate space. Test first.
- [ ] 2.4 **Bridges** last and most carefully: no coverage, two sources of
      liveness (a boolean *and* a `-1` sentinel), and the most logic behind the
      drag. Test first, and expect the test to be the larger half of the work.

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
