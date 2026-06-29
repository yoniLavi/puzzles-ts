# Proposal: Share the generic-LatinReason narration arms

**Status**: Proposed — **conditional / lower-priority** (follow-up to
`extract-candidate-hint-plan`). Do this only when a concrete narration fix would otherwise
have to touch the same arm in 2+ games; otherwise the variance risk outweighs the gain.

## Why

The `narrate` functions in Keen, Unequal and Solo each handle the *generic* Latin
techniques — `single`, `set`, `forcing`, and (for the row/col games) `hiddenSingle` /
`forcedSingle` / `dup` — with near-identical prose. E.g. all three emit, verbatim for
`single`: *"Every other number has been ruled out in this cell, so it can only be N."* When
a future tweak improves one of those sentences, the others silently drift.

## What Changes

- **A shared `narrateLatinReason(reason, ns)`** (likely in `engine/latin-hint.ts`) covering
  only the *generic* arms whose prose is genuinely shared.
- **Each game keeps its game-specific arms** (Keen's cage / Unequal's greater-lesser /
  adjacent / Solo's intersect / cage*) and delegates the generic ones to the shared
  narrator.

## The caveat (why this is conditional, not a clean win)

Narration is *meaning*, which `extract-candidate-hint-plan` deliberately kept per-game.
The generic arms are shared **between the row/col games (Keen, Unequal)**, but **Solo's
diverge**: its `forcedSingle` says "row, column **and block**", its `dup` names "row,
column **or block**", and its `hiddenSingle` uses a region name (block/diagonal), not
`row|column`. So the shared narrator fits Keen+Unequal cleanly and Solo needs overrides —
the moment a "shared" narrator carries per-game overrides for half its arms, it can become
*less* readable than the duplication it replaced. **Decide during implementation** whether
the shared set is big enough (after Solo's overrides) to be worth it; a documented
"not worth it, left duplicated" is an acceptable outcome (same discipline as the withdrawn
tier-2 driver in `extract-candidate-hint-plan`).

## Impact

- **Affected specs:** `ts-engine` (ADDED — a shared narrator for the generic Latin
  reasons, if adopted).
- **Affected code:** `engine/latin-hint.ts` + the `narrate` of keen/unequal/solo. Gated by
  the per-game hint suites (they assert exact narration strings) — **no snapshot change**.

## Out of scope

- Towers (its `narrate` shares fewer arms and its strike-split is by-height — evaluate but
  don't force).
- Any wording *change* (this is a pure de-dup; a wording improvement is a separate change).
