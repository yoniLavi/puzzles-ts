# Design

## The snapshot is an instrument, not a rule

`capability-surface.test.ts` works because it asserts nothing about *which*
capabilities a game should have. It derives the set, snapshots it, and lets a
change to that set show up as a reviewable line in a text diff. Its own comment
says why a declared list would be weaker: the edit that drops a capability drops
its manifest entry too.

The draw-state half must be built the same way. **No approved vocabulary, no
naming rule, nothing a game can fail.** The value is that
`pencilModeShown × 9` would have been one glance rather than a grep nobody ran —
and that the next such field is visible the day it lands.

That also decides the failure mode to avoid: a snapshot that moves for reasons
other than a game's vocabulary is noise that trains people to re-baseline without
reading. So the field *names* are snapshotted and nothing else — not sizes, not
values, not types.

## Building the draw state is the one real cost

`builtGames()` memoizes one board per game because generating 57 is the expensive
part. `newDrawState(state)` is cheap by comparison and needs no tile size — every
game's is a plain allocation — so it can join the same memoized pass.

**The one thing to check before trusting the output**: a draw state built without
`setTileSize` may leave fields unset, and `Object.keys` on an object whose
constructor assigns conditionally would then under-report. Sizing it first
(`freshDrawState` pairs the two for exactly this reason) removes the question
and costs nothing.

## The three fixes, and which is not cosmetic

**Bricks `dragtype` → `dragType`** is a rename: one game, one spelling, matching
the two it shares a model with and the guide that documents it.

**`aiming`** is a rename too, and it is mine to undo: `name-the-drag` took a word
Inertia was already using. Bridges' means "the pointer has left the source
island", so `steering` or `aimedAway` says it without the collision — the pilot's
own criterion applies, name the narrower thing for what it is.

**The pixel drag position is the one with a real trap in it.** Ascent's
`dragx`/`dragy` hold a **grid cell**; Map's and Guess's hold **pixels**. Renaming
Guess's `dragX` to match Map's `dragx` would make the collision *worse* — three
games sharing one name for two units. So the unit has to lead: the two pixel
games converge on a spelling that says pixels, and Ascent's grid pair takes a
name that says cells. Which spelling wins is a per-game reading, not a
find-and-replace, and it is the reason this is not a bulk edit.

## What proves it

- The widened snapshot: **break it deliberately** — remove a field from one
  game's draw state and confirm the snapshot moves — before believing an
  unchanged one. The session that wrote this found a guard that passed while
  asserting the wrong thing, twice.
- The three renames: the suite is the check, and each must move **no** recorded
  draw call. A rename that re-baselines a render snapshot is not a rename.
