# retire-the-em-dash-from-hint-narration

## Why

Two things, found together while answering a question about one Palisade hint.

**1. A narration that asserts its own deduction instead of showing it.**
Palisade's `cluesVersusRegionSize` step reads:

> *"Clues 1 and 1 can't share a region, so the edge between them must be a wall."*

The premise clause **is** the deduction, stated rather than derived. A player who
does not already know the technique cannot reconstruct it from the sentence, and
that is precisely the quality-bar defect `equivalentEdges` was fixed for in this
same file (AGENTS.md § "Hint quality bar" rule 1; the comment at
`src/games/palisade/index.ts` records the earlier fix). The reasoning it omits is
a short count, and upstream's C states it in a comment
(`solver_connected_clues_versus_region_size`): if two clued cells share a region
the edge between them is open, so each cell's walls all sit on its *other three*
sides, leaving `3 - clue` further open sides into the same region. Two
orthogonally adjacent cells share no common orthogonal neighbor, so the region
holds at least `2 + (3 - a) + (3 - b) = 8 - a - b` cells. Exceed `k` and the
sharing is impossible. The `clue 3 / clue 3` arm is the case where the bound is
*exact* rather than a lower bound (each has one open side, and it must be the
shared one, so the region is exactly those two cells).

**2. The em-dash is the collection's default narration punctuation, and the
owner has retired it.** Measured 2026-09-09 over comment-stripped string
literals in `src/games/*/` (no test files): **141 hits in 26 files**, every one
of them hint prose. It is overwhelmingly used as a dramatic pause before the
concluding `so …` clause — *"…and shaded squares can't be adjacent — so it must
be white."* — which a comma or a sentence break carries at no cost to the
teaching.

En-dashes are **not** in scope and must not be swept up: the only three in the
tree are Dominosa's `3–5` domino labels, where the dash is notation.

## What Changes

- **Palisade's `cluesVersusRegionSize` narration** gains its premise, in two
  arms (the general counting bound, and the exact-size `3`/`3` case), and
  `explain()` gains the region size `k` it needs to say them.
- **A review of Palisade's other five rules' narrations**, since they were never
  read as a set.
- **Every em-dash in every hinting game's narration is rewritten away** — 141
  literals across 26 files — without flattening any of them. Rewriting the
  sentence is the job; deleting the clause is not.
- **A cross-game guard** in `src/engine/hint-quality.test.ts`, joining the five
  narration-form rules already there and inheriting its derived enrollment, so a
  game acquires the rule by shipping a `hint()` and no roster is written.
- **`docs/games/hints.md` § "Writing the narration"** records the rule, and the
  `ts-engine` spec records it normatively.

## Impact

- Player-visible wording across ~26 games. No behavior, no move, no board
  changes; every rewrite preserves the indication → reasoning → conclusion arc
  and the necessity modal.
- Four committed hint snapshots re-baseline (`boats`, `bricks`, `crossing`,
  `sticks`), plus any per-game test asserting on narration text.
- **Not** a grandfather list. The repo refuses enrollment manifests, so the
  guard cannot ship with an allowlist of the 141 sentences it would excuse; the
  sweep is what makes the guard addable.
