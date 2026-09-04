# declare-params-and-presets

Realizes: `docs/framework-rdd/game-definition.md` § "Params and presets".

**Readiness: needs exploration first.** The strategy is settled (params before
gestures before board model, owner 2026-09-04); the design is not. Task 0 is an
`/opsx:explore`, not an implementation.

## Why

**Params are the declaration with the strongest existing evidence and the
lowest risk, which is why the game-definition work starts here.** `paramConfig`
is *already* declarative — a game states its fields and the Custom dialog is
built from them — so unlike the board model or the gesture table, this is not a
new abstraction over hand-written code. It is finishing one that already
half-exists.

What the vision asks for beyond today: the params **codec** derived (the
`WxH`-style prefix forms via a shared parser), the type-menu summary derived,
and the difficulty contract projected from the ladder. The last of those is
already split out as `derive-difficulty-from-the-technique-ladder`, which is
ready and should land first — it is the piece with an existing lever.

**The friction this addresses is real and documented.** AGENTS.md carries the
trap: *"A new port must wire `paramConfig` — or its Custom dialog ships blank."*
That is a per-game step that a declaration should make impossible to forget, in
the same way declaring `hint()` now enrolls a game in six guards
(`derive-hint-enrollment`) and declaring `Game.difficulty` enrolls it in the
difficulty guards.

## What to explore first

- **How much of the codec is genuinely shared?** Count it. A shared `WxH` parser
  that serves ten games and is escaped by twenty is not a win, and
  `game-definition.md` already concedes a bespoke hatch (Blackbox's
  `w<W>h<H>m…M…`). The number decides whether this change is worth its risk.
- **What does a params codec promise a player?** Params appear in game IDs and
  shared links. `migration.md` is explicit: *"Existing games keep their
  byte-stable codecs permanently — a shared game ID is a promise to players."*
  So a derived codec is for **new** games, and any change to an existing game's
  encoding is a compatibility break that goes to the owner *before* it is
  written, not after.
- **Is a "declares `paramConfig` iff it has varying params" guard buildable?**
  That would close the blank-dialog trap directly and cheaply, possibly without
  any of the rest of this change. If so it may deserve to be split out and
  shipped first, the way the difficulty projection was.

## Impact

- Affected specs: `ts-engine` (params), `ts-migration` (codec stability).
- Affected code: `src/engine/params.ts`, `custom-params`, per-game codecs.
- **Compatibility-sensitive.** Anything that changes an existing game's encoded
  params changes its shared IDs. That is the owner's call, raised beforehand
  with the cost stated (AGENTS.md, "Nothing is sacred": player-visible and
  data-visible changes are proposed, not just done).
