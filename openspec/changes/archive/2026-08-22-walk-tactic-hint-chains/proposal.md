# Change: walk a Tactic's chain instead of asserting its conclusion

## Why

`audit-guessing-tier-names` settled what a middle-tier deduction may be
(**design D9**): a **Tactic** — a *bounded* chain of forced consequences to a
named endpoint. It also settled what its hint owes the player (owner,
2026-08-12): **a walk**, one glanceable leg per step, the board carrying the
state so the chain is never held in the player's head.

Seven games ship a Tactic today and **none of them walks it**. Six say a version
of this:

> *"Following a chain of two-candidate cells, placing 5 here would force a
> contradiction further along — so we must cross out 5."*

Which names no contradiction, points at no cell, and shows no chain — it is a
claim the player can only check by redoing the deduction, which is exactly what
`docs/games/hints.md` § "The forcing boundary" calls **not allowed**. Clusters is
better and still short of the bar: it marks every forced cell and names the rule
that breaks, but delivers the whole thing as one step.

The measurements that make this tractable are already taken
(`audit-guessing-tier-names/audit.md`): a Latin forcing chain is **3–12
implication links, median 4–5**, and Clusters' is **2–3 forced cells**. These are
walks of a handful of legs, not proofs.

## What Changes

- **Record the chain, not just its conclusion.** `latin.ts`'s `forcing()`
  currently emits only the elimination; the BFS knows the path and throws it
  away. Capture it (parent pointers are already there) and carry it on the
  reason.
- **Narrate it as a multi-leg journey.** The `continuesPrevious` machinery
  exists and Sixteen already uses it; a Tactic becomes one journey whose legs
  are "suppose…", "then this must be…", "…which forces…", "…impossible, so
  strike".
- **Mind the case split.** A Latin forcing chain concludes from *both* branches
  — "if the origin is `a` the target loses `a` by line; if it is `b`, the chain
  makes some cell `a` and the target loses it that way". The walk has to say
  that, or its last leg does not follow from its own premises (the Palisade
  lesson).
- **Per-game vocabulary.** Towers speaks of heights, Group of elements, Salad of
  letters or numbers; `LatinVocab` already exists for exactly this.
- **Retire the `PENDING_WALK` entries** in `src/engine/hint-quality.test.ts` one
  per game as each lands. That list is shrink-only and is the change's progress
  bar.

## Impact

- Affected specs: `ts-engine` (the Hint System requirement gains the Tactic walk
  bar).
- Affected code: `engine/latin.ts`, `engine/latin-hint.ts`, and the hint paths of
  Towers, Keen, Unequal, Group, Salad, Solo and Clusters.
- **No generator or solver behaviour changes**, so no board moves and no
  differential is touched: this is narration and recording only. The recorder is
  hint-path-only by construction (`latin.ts` leaves it unset on the
  generator/solve path).
- Clusters is the cheapest first target — its chain is the shortest, its data is
  already captured, and it already renders the cells — so it is the one to
  establish the pattern on.
