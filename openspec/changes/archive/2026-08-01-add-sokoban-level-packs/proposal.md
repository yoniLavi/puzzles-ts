# add-sokoban-level-packs

> **WITHDRAWN 2026-08-01 — nofix. Owner decision: this collection stays entirely
> procedurally generated.** No authored level data exists anywhere else in the
> collection, and introducing a hand-curated pack for one game would make Sokoban
> the exception to the property that defines the whole thing — every board comes
> from a seed. **No code was written and the `sokoban` spec delta was NOT
> applied** (archived with `--skip-specs`; the delta below records what was
> proposed, not what shipped).
>
> **The author's complaint stands and is accepted as-is.** Sokoban ships the
> levels upstream's reverse-play generator produces, which its author calls "too
> simplistic to be credible". That is the same experience the C build gave, and it
> is honest rather than hidden.
>
> **The one alternative the owner was open to — reverse-engineering known-good
> levels into a better *procedural* generator — was examined and is not cheap.**
> The reframing is worth keeping if it is ever revisited:
>
> - Upstream's technique is not the deficiency. `sokobanGenerate` already uses the
>   standard method — start from a solved position and play *backwards*, pulling
>   barrels rather than pushing them — which is why every level is solvable by
>   construction and needs no solver to gate it.
> - What it lacks is **selection**. It makes N inverse moves and emits whatever
>   position it lands on. There is no scoring, no candidate pool, no rejection.
>   Level quality in Sokoban lives almost entirely in that step: how far the
>   barrels end up from their targets, whether the solution forces a non-obvious
>   ordering, whether the corridors are trivial.
> - So the cheap-sounding version — generate N, score, keep the best — needs a
>   **Sokoban solver**, to know a candidate's minimum push count at all. That is
>   precisely the component the reverse-play design exists to avoid needing, and
>   Sokoban solving is PSPACE-complete (tractable at these sizes, but a real
>   piece of work). The cheap version is not cheap, which is what makes the
>   owner's high-effort-low-value instinct correct rather than merely cautious.
>
> Recorded in the audit archived with `audit-author-known-issues`.

## Why

**Sokoban is the one game in the collection whose author says, in the first
paragraph of its source, that the boards it serves are not good enough.**
`unfinished/sokoban.c` opens:

> *"An implementation of the well-known Sokoban barrel-pushing game. Random
> generation is too simplistic to be credible, but the rest of the gameplay works
> well enough to use it with hand-written level descriptions."*

That is not a porting note — it is the reason the game sat in `unfinished/` for
years with everything *except* its levels finished. `add-sokoban-ts-port`
(2026-07-21) weighed exactly this and took option (A), shipping the faithful
reverse-move generator, with option (B) — curated hand-authored levels — recorded
as *"a compelling, separate, owner-greenlit follow-up"*. It was never filed. This
is that change.

The author's own sentence names the fix: the gameplay is good enough **to use it
with hand-written level descriptions**. Good Sokoban is authored, not generated,
and this is the one puzzle in the collection where that is true.

## What Changes

- **Ship a set of authored levels** as descriptions the existing engine already
  understands, chosen so difficulty ramps.
- **Add the level-selection surface this collection does not yet have.** Every
  other game maps `params#seed` to a freshly generated board; a curated pack is a
  *fixed enumerated list* of levels of differing sizes, which does not fit "pick a
  size, get a random board". Designing that seam is the real work here, and it is
  why this is its own change.
- **Keep random generation available**, so nothing regresses and a player who
  wants an endless supply still has one.

## Risks and constraints

- **Licensing is the gating constraint, not a detail.** Many well-known Sokoban
  sets are explicitly *not* freely redistributable. The design must name the
  source and its licence before any level is committed, and this fork's layered
  MIT notice (`LICENSE.md` / `CREDITS.md`) has to be extended to cover it.
- **No byte-match oracle** — there is no C reference for authored levels. Verify
  instead that every shipped level is solvable by the ported solver, and that its
  recorded minimum push count matches.

## Impact

- Affected specs: `sokoban` (a level-source requirement), `app-shell` if the
  level-selection surface is general rather than game-local.
- Affected code: `src/native/games/sokoban/`, plus wherever level selection lands.
- Affected docs: `LICENSE.md` / `CREDITS.md` if third-party levels ship.
