# declare-params-and-presets

Realizes: `docs/framework-rdd/game-definition.md` § "Params and presets".

**Readiness: explored, designed and implemented (2026-09-05).** The exploration
that task 0 called for moved this change's premise — the shared parser it set
out to build already existed and was already adopted, and the unshared half was
the *encoder* and the encoder/decoder pairing. `tasks.md` § "Findings" is the
measurement; the sections below are what the change was scoped as before it,
kept because the reasoning still holds and the "shape of the win" test is what
the result was judged against.

**What shipped**: a byte-stability guard over all 57 games (612 derived cases),
a declared codec grammar, and 19 games converted as the proving set. The
remaining 34 convertible games are a sweep, and a sweep belongs to
`re-express-the-collection` by this ladder's own ordering — *"a premature sweep
multiplies every contract change by 57"*.

## Why

**Params are the declaration with the strongest existing evidence and the
lowest risk, which is why the game-definition work starts here.** `paramConfig`
is *already* declarative — a game states its fields and the Custom dialog is
built from them — so unlike the board model or the gesture table, this is not a
new abstraction over hand-written code. It is finishing one that already
half-exists.

What the vision asks for beyond today: the params **codec** derived (the
`WxH`-style prefix forms via a shared parser), the type-menu summary derived,
and the difficulty contract projected from the ladder.

> **The difficulty half has landed, and it changed this change's ground**
> (`derive-difficulty-from-the-technique-ladder` + `adopt-conventional-tier-names`,
> both archived 2026-09-04). Two things to carry in rather than re-derive:
>
> 1. **It is not projected from the ladder.** That turned out to be impossible
>    for three independent reasons, now a requirement in the `ts-engine` spec so
>    the survey is not repeated. Do not re-open it.
> 2. **`paramConfig` is now load-bearing in a way it was not when this was
>    scaffolded.** The difficulty item is the *only* definition of a game's tier
>    names — `difficultyTiers(game)` reads it, and the tier names, the preset
>    menu and the Custom dialog all descend from it. So anything this change does
>    to `paramConfig` has a consumer it did not have before, and task 0's
>    exploration should establish that consumer's needs before proposing a shape.
>
> The pattern this change hoped to follow *did* hold: the difficulty piece
> shipped first, on an existing lever, and removed per-game surface rather than
> adding framework surface.

**The friction this addresses is real and documented.** AGENTS.md carries the
trap: *"A new port must wire `paramConfig` — or its Custom dialog ships blank."*
That is a per-game step that a declaration should make impossible to forget, in
the same way declaring `hint()` now enrolls a game in six guards
(`derive-hint-enrollment`) and declaring `Game.difficulty` enrolls it in the
difficulty guards.

## The decision this removes

Judged by AGENTS.md § "Convention over configuration": *which decision does this
take off the porter's desk, and would two games ever legitimately answer it
differently?*

- **"Did I remember to wire `paramConfig`?"** — not a decision at all, a
  *forgetting*, and the documented cost is a Custom dialog that ships blank. A
  declaration that cannot be omitted removes it outright.
- **"How do I spell this params codec?"** — the `WxH`-style prefix grammar is the
  same in most games and hand-written in each. Two games differ here only when
  the grammar genuinely differs (Blackbox's `w<W>h<H>m…M…`), which is what the
  escape hatch is for.
- **Already removed, by the difficulty work**: "what shall I call my tiers?"

**What must stay free to differ**: the params *record* itself, the validation
predicates, and any encoding an existing game already ships — a shared game ID is
a promise to players (C1 below), so a derived codec is for new games and for
games that opt in with the owner's say-so.

**The shape of the win to look for is per-game surface removed**, not framework
surface added. Row 1 of the vision's order deleted 29 hand-written tier lists and
shipped one function; if this change's design adds more than it deletes, that is
the signal to re-read it.

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
