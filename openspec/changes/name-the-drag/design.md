# Design

## The shape, and what it deliberately leaves to the game

    export interface GridDrag {
      /** Whether a drag is in progress. */
      live: boolean;
      /** Where it started, in the game's own coordinate space. */
      sx: number;
      sy: number;
      /** Where it is now, in the same space. */
      ex: number;
      ey: number;
    }

**The coordinate space stays the game's.** Five of the six hold grid cells and
Rect holds half-grid coordinates (0..2w, 0..2h) because its rectangles are
edge-aligned; that is a real per-game decision and the type does not know about
it. What the type fixes is only what nobody could answer differently: that there
are two positions, which is the anchor, and how you ask whether a drag is
running.

**`live` replaces three different idle signals**, and this is the part that makes
each conversion a small refactor rather than a rename: `dragOk` (boats, tents),
`dragging` (pattern, tracks, bridges) and a bare `-1` sentinel (rect, and
bridges as well as its boolean). Every `ui.dsx === -1` becomes `!ui.drag.live`.
Sizing the batches around that, not around the field rename, is the point of
converting one game first.

Helpers, mirroring `newCursor`/`showCursor`/`hideCursor`:

    newDrag(): GridDrag
    startDrag(d, x, y): void   // anchor and current both to (x, y), live
    moveDrag(d, x, y): boolean // current to (x, y); reports whether it changed
    endDrag(d): boolean        // clears live; reports whether one was running

`moveDrag` returning "did anything change" is not decoration: several of these
games already suppress a no-op repaint by hand (Bridges' comment says so
explicitly), and that predicate is the same one every time.

## Why a class, not an interface, for the engine's half

`GridCursor` is a plain interface and that is right for it: nothing outside the
game reads a cursor. A drag is different, because the payoff below requires the
**midend** to find one on a `Ui` it knows nothing else about.

Duck-typing that — scanning for an object with `live`/`sx`/`sy` — is a scan keyed
on names, which this repo has been burned by repeatedly. So `GridDrag` ships as a
class and the midend asks `instanceof`. A game joins by *having* one; there is no
manifest, nothing to forget, and nothing a new game must declare.

Rejected: a `Game.cancelsDragOnStateChange` flag. That is the manifest shape the
collection has reversed three times (eighteen `needsRightButton` declarations
deleted, the gesture table withdrawn, the hint list derived).

**The assumption `instanceof` rests on, checked rather than assumed:** a class
instance loses its prototype across a structured clone or a JSON round-trip, so
this only works if a `Ui` is never replaced by a deserialized copy. Verified
2026-09-12 — the `Ui` does not cross the Comlink worker boundary (neither
`worker.ts` nor `worker-adapter.ts` mentions one), and the three games that
persist Ui state (Ascent, Mines, Net) do it through `encodeUi`/`decodeUi`, where
`decodeUi(ui, encoded)` **mutates the object the midend already holds** rather
than returning a new one. If either of those ever changes, the midend's sweep
goes silently blind, which is why `grid-drag.test.ts` asserts the `instanceof`
directly.

## The midend's half, and the one behavior question in it

After the pilot, `Midend`'s `changedState` path walks the `Ui`'s own enumerable
values once and calls `endDrag` on every `GridDrag`. Cost is a handful of
`instanceof` checks per committed move, on a path that already rebuilds state.

**The behavior question to settle at the pilot, not now:** does canceling on
*every* state replacement match what these six do today? Signpost (not in this
set) cancels only on completion, and the archived audit argued a drag surviving
an undo has no claim to be valid — but that was reasoning about Pegs, and it
should be checked against each of the six as they convert rather than assumed.
Where a game genuinely wants to keep a drag across a transition, it keeps its own
`changedState` and the engine's cancel is the one that has to be justified away.

## Staging: type and pilot, then batches

Owner-chosen. The pilot is **Tents** — the smallest of the six, a plain
grid-coordinate pair with a `dragOk` liveness flag, and it shares its exact
spelling with Boats, so converting it says something about a second game
immediately. Bridges is deliberately *not* the pilot: it carries both a boolean
and a `-1` sentinel, which is the hardest case and the wrong thing to design
against first.

Per `rendering.md` § "Sharing a *primitive* is a different, smaller move": land
the type and the pilot with nothing else moving, then batch. And its second
lesson applies directly — **break the helper deliberately and see what goes red
before believing a green suite**. The previous change in this session found that
a shared drawing helper's most important line was covered by *zero* tests across
nine games; there is no reason to assume the drag helpers start out better
watched.
