# Fix two places where state outlives the thing that invalidated it

## Why

The tidy pass (`archive/2026-09-12-tidy-the-code-after-the-port`) put an agent
on every game with instructions to plant a defect and check that a test goes
red. That found no behavior change to report, which was its job. It also
surfaced two defects that were already there, both reported with a repro, and
both reproduced against `main` before this change was written.

**Both are the same shape**: a value is computed, then the thing it was derived
from changes, and nothing tells the holder. One holder is a `Ui`, the other a
draw-state cache key.

### 1. Pegs throws at the player after undo

Pegs declares no `changedState`. It is one of 55 games that don't; the two that
do, do so for exactly this reason. Arm a keyboard jump, undo the move that put
the peg there, then press an arrow: the armed jump fires from a cell the undo
emptied and the midend throws.

    Error: Grid contents were invalid for this move

Upstream cancels this in `game_changed_state`. The engine documents the hook
(`game.ts`: "A game whose Ui tracks the current state … derives it here").
Reproduced on `main`; the repro drives a real `Midend` through
`7x7cross:OOPPP…`, three drags, four cursor keys, select, undo, arrow.

### 2. Crossing never paints a held clue on a warm draw state

`redraw` repaints the clue panel only when a number's class changed:

    const panelState = (l) => colorClass(l) | (hintClass(l) << 4);

Neither term reads `ui.heldNumber`, so picking a clue up changes no class, the
panel is judged clean, and the held box is never drawn — nor erased when the
clue is put back. Measured on `main`: a fresh draw state paints **4** held ops,
a draw state that has already painted once paints **0**.

Every test misses it because they all build a draw state per frame, which is
also why the tidy pass's plants in that file stayed green.

## What changes

- Pegs gets a `changedState` that clears the drag and the armed jump, with a
  test that undoes under an armed jump and expects no throw.
- Crossing's panel cache key gains the held clue, with a test that paints twice
  on one draw state.
- Both games get the regression test the defect needs, which is the part that
  keeps them fixed.

## What this change does not do

The tidy pass also reported **uncovered** code — places where an agent planted
a defect and the whole suite stayed green. Those are gaps, not defects, and
each needs its own test before its shape can safely change:

- Pegs: the pointer press and all of `render.ts` (8 simultaneous render plants
  passed 3,156 tests).
- Guess: `render.ts` drawing and the hit test (7 plants survived).
- Pearl: nothing asserts that a click or drag lays a line; a plant that ignored
  mouse release passed all 3,142 tests.
- Twiddle: the undo-direction animation, the orientation triangle and the
  old-cursor repaint. Nothing renders an orientable board.
- Crossing: `errFlags`, the `drawMarks` layout.
- Fifteen: the border and the first-frame background.
- Mosaic: light clue text on black cells.
- Solo: the Check & Save mistake outline.
- Undead: pencil entry, count-block clicks, clue clicks, ASCII rendering.

Two further reports are recorded but **not verified here**, so they are
findings rather than claims:

- A paired-timing A/A control that loads HEAD once and times it twice may warm
  its own JIT, making the control optimistic; two agents independently reported
  a phantom ~5% slowdown that vanished against a separately loaded HEAD copy.
  If it holds, it belongs in `docs/test-strength.md` § 7, which exists for
  exactly this kind of instrument error.
- Under vitest's SSR transform an imported constant is a property lookup, so
  hoisting a hot loop's direction table into a sibling module measured 1.4–1.6×
  slower in Range. That would make a shared direction table costly in the
  suite, though not necessarily in the browser build.

Generator give-ups are also recorded and not addressed: Separate's `6x6n6` and
Group's `5x5` Hard both exhaust their attempt cap on some seeds, identically at
HEAD, which a player meets as a preset that fails to deal.
