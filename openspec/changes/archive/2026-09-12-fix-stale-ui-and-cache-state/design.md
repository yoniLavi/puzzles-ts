# Design

## Why the two are one change

They share a failure mode and a fix shape: something derived is kept, its input
changes, and nothing invalidates it. Pegs keeps an armed jump across an undo;
Crossing keeps a cache key that never mentioned the held clue. Fixing them
together keeps one statement of the rule — **a cache key names every input its
output reads** — rather than two unrelated bug reports.

## Pegs: use the hook that exists

`Game.changedState(ui, oldState, newState)` is the engine's answer and upstream's
(`game_changed_state`). Pegs' `Ui` holds `dragging` and `curJumping`, and both
describe the board as it was. Clearing them both on any state replacement is the
conservative reading: a drag or an armed jump that survives an undo, a redo or a
restart has no claim to still be valid.

Rejected: validating the armed jump at fire time instead. That leaves the Ui
lying between the undo and the next key, and the same stale value still reaches
`interpretMove`, which is where the throw comes from.

Re-deriving at fire time *is* a legitimate answer in general — it is how Bridges
stays safe without the hook — but only when the fire recomputes everything it
uses, in the call that uses it. Pegs' fire recomputes the direction and not the
source, which is precisely the half-measure that produced the throw.

## Crossing: delete the label with the class

`CLASS_COLOR`'s entry 3 is unreachable and still labeled `held`, left behind
when held became a box. Keeping it would leave the key's comment claiming the
coverage the key had just been given back by other means, so the entry and the
label go and the remaining classes renumber. The colors emitted are unchanged
(class numbers are private to one function and to an in-memory cache), which the
render snapshots confirm.

## Crossing: widen the key, do not drop the cache

The panel cache exists because repainting every clue on every frame is visible
work. The fix is to include the held clue in `panelState`, not to remove the
skip. `heldNumber` is a single number, so one extra term keyed off `l ===
ui.heldNumber` is enough, and the cache keeps doing its job.

Rejected: repainting the panel whenever `ui` changes at all. That would repaint
on every cursor move, which is the cost the cache was added to avoid.

## What proves it

Both fixes are cheap; the regression tests are the deliverable. Each test must
fail on `main` and pass after:

- Pegs: drive a `Midend`, arm a jump, undo, press an arrow, expect no throw.
- Crossing: paint twice on one draw state and assert the held box appears on the
  second paint, then disappears when the clue is put back.

The Crossing test is the one that matters most, because it is the first test in
that file to reuse a draw state. Every existing test builds one per frame, which
is precisely why this survived.
