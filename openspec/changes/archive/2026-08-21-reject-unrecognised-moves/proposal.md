# reject-unrecognised-moves

## Why

**A move a game cannot play is currently handled three different ways across the
collection, and none of them says so.** Found by an owner bug report (ABCD threw
on load, 2026-08-21) and the cross-game sweep written to chase it
(`save-round-trip.test.ts`, shipped in `0d097c2`).

`executeMove(state, move): State` looks total. It is not, because a save is
**untrusted input**: `SaveEnvelope.moves` is `unknown[]`, *cast* to `Move` on
replay rather than parsed. So a move written by a different build arrives
looking perfectly well-typed and reaches a dispatcher that has no arm for it.
The 53 games that implement `executeMove` then split three ways:

| shape | example | what an unrecognised move does |
|---|---|---|
| exhaustive `switch`, no `default` | ABCD, Galaxies | falls off the end ⇒ **returns `undefined`** |
| `if (move.kind === "solve") … else …` | Clusters, Bricks | takes the `else` branch and **misreads the move**, then throws somewhere downstream on a missing field |
| tolerant catch-all | 20 games (measured) | **silently does nothing** — the save loads, and the board quietly differs from the one saved |

The first was the reported crash: `undefined` entered `history`, so `changedState`
threw, and then **every subsequent repaint** threw on a state that was not there.
`0d097c2` stopped the corruption at the engine — `commitMove` refuses a non-state,
`loadGame` rewinds and reports, and an unplayable autosave is dropped rather than
rethrown — so the safety net is already in place and this change does not restore
it.

**What is still wrong is honesty**, and it is worth fixing on its own terms:

1. **The third row is silent data loss.** Twenty games accept a save containing a
   move they cannot play and present a board that is not the one the player saved,
   with no indication. That is the outcome the owner's own rule rejects: *cleanly
   rejecting saved games that are no longer valid* is fine; quietly returning a
   different board is not.
2. **The second row reports the wrong thing.** The error a player's console shows
   names a missing field on some later line, not "this move is not one I can
   play". A confusing error costs the next investigation what it cost this one.
3. **The type is lying, and only convention holds it up.** Nothing stops a
   fourth shape appearing in game 54.

## What Changes

- **An unrecognised move is rejected explicitly, at the point of dispatch, in
  every game that has one.** Owner's call (2026-08-21) and the right one: a
  supposedly-exhaustive dispatch gets a catch-all that **throws "this should be
  impossible"**, rather than anything more accepting. There is no forward-compat
  case to be lenient for — this is a PWA, players run the current build, and a
  save from an older one should be refused cleanly, not half-applied.
- **The mechanism is `assertNever`, not a bare `throw`** — see design D1. A bare
  `default: throw` would *trade away* a compile-time guarantee the switch games
  currently have; `assertNever(move)` keeps it and adds the runtime one.
- **A shared `assertNever` helper** in `src/engine/`, since the repo has none
  today (checked) and 53 games would otherwise each spell it themselves.
- **The `if/else` and tolerant games are converted to a discriminated dispatch**
  where their move type is a union, so they gain the compile-time exhaustiveness
  they have never had. Where a game's move is genuinely not a union (Cube's
  single move shape), it validates and throws instead — the requirement is the
  behaviour, not the syntax.
- **The cross-game guard is tightened to match**: `save-round-trip.test.ts`
  currently accepts *either* camp, because both are safe. Once every game
  rejects, it asserts rejection — the two-camp allowance in it is temporary
  scaffolding and its comment says so.

## Impact

- Affected specs: `ts-engine` (a new requirement on `executeMove`'s contract).
- Affected code: `src/engine/assert-never.ts` (new), the 53 games implementing
  `executeMove`, `src/engine/save-round-trip.test.ts`.
- **A behaviour change players can see, and the reason to keep it in one change:**
  in those 20 games, a save containing an unplayable move currently loads (wrong)
  and will afterwards be rejected (an autosave is then dropped and a fresh board
  dealt). That is the owner-endorsed behaviour, applied consistently — but it is
  the kind of thing that should land once, deliberately, rather than game by game.
- No change to any board, desc, or game ID. Nothing here touches generation.
