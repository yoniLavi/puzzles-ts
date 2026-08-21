# audit-vestigial-contract-surface

## Why

**A parameter that is only ever passed one value is not a parameter — it is a
latent bug with a plausible name, and this repository has now shipped one that
reached a player.**

`Game.validateParams(p, full)`'s `full` means *"these params are about to
generate a board"*. It is how a game expresses a bound that only generation is
subject to. All four production call sites passed a literal `true`
(`bound-abcd-generable-sizes`, 2026-08-21), so:

- **Sixteen games gated a bound on a constant.** Every `if (full && …)` in the
  collection was `if (true && …)`.
- **Three of them — Bricks, Mathrax, Clusters — carried a comment asserting the
  behaviour that was not happening**, e.g. *"a saved game or a game ID carrying
  its own description still loads at any size, because `full` is false there."*
  Three authors independently documented the intent; nothing implemented it.
- **It broke a real user path.** Bricks deliberately keeps its retired third
  difficulty decodable *"so an old game ID or saved game reaches here"*; such a
  link was being refused.
- **Nothing caught it for months**, because the symptom only appears for params
  someone has since bounded — and until ABCD, nobody had. The flag was dead in a
  way that was *invisible until the day it mattered*.

That is a shape, not an incident. Its ingredients are ordinary: an interface
copied faithfully from upstream C, where the distinction was live; a caller in
our own engine that collapsed it; and per-game code written against the
*documented* contract rather than the *actual* one. Every one of those is present
elsewhere in a 57-game collection ported from a C original.

**The generalisation worth acting on:** wherever this codebase offers a
capability — a flag, an optional hook, a discriminant, a return value that can
signal something — the offer may have no live consumer, and the code written
against it is then decoration that reads as protection.

## What Changes

An audit, producing a table with a verdict per finding, in the shape
`audit-author-known-issues` used (its `audit.md` is the model, and the reason
that change is worth imitating is that its artefact survived the sources it was
drawn from).

Four shapes to sweep:

1. **Parameters with one live argument.** Every boolean/enum parameter on an
   engine-facing contract, checked against its actual call sites.
   `encodeParams(p, full)` is the immediate sibling to check — same name, same
   provenance, and it *is* live (`full=false` drops generation-only params from
   a shared id), but that should be established rather than assumed.
2. **Optional `Game` hooks with no implementer**, or with implementers but no
   caller. The `Game` interface has grown a lot of optional surface
   (`supersededDesc`, `encodeUi`/`decodeUi`, `deserialiseMove`, `changedState`,
   `hintKeepTrack`, `wantsStylusModifier`, `canMarkAll`, `paramConfig`,
   `prefs`, `reference`, …). Each should have at least one implementer and one
   caller, or be removed — the repo already deleted `PointerAction` on exactly
   this ground (`refactor-pre-port-tidy`).
3. **Return values whose meaningful cases are never produced or never
   distinguished.** A function typed `X | null` whose `null` arm no caller
   branches on is the same defect wearing a different hat.
4. **Comments asserting behaviour no test covers**, restricted to comments that
   make a *checkable claim about control flow* — the Bricks/Mathrax/Clusters
   trio is the exemplar, and it is the cheapest possible detector: three authors
   wrote down the truth, and the code disagreed.

Each finding gets one of: **live** (with the call site that proves it), **dead —
remove**, **dead — wire it up** (the `full` verdict: the capability was wanted,
the engine just never delivered it), or **equivalent** (unreachable but kept,
with the argument, as `feedback-probe` does).

## Impact

- Affected specs: `ts-engine` (a requirement that the `Game` contract carries no
  vestigial surface, enforceable rather than aspirational).
- Affected code: potentially `src/engine/game.ts` and any game implementing a
  hook found dead; a mechanical guard if one of the four shapes turns out to be
  cheaply checkable.
- **Expected to be mostly "live"**, and that is a fine result — the point is the
  three or four that are not, and the standing check that stops the next one
  accumulating silently.
- Explicitly **not** a licence to delete a hook that has one implementer. One is
  a consumer; zero is the finding.
