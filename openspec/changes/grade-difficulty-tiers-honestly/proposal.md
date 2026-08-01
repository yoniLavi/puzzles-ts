# grade-difficulty-tiers-honestly

## Why

**You can pick Tricky and get a Normal puzzle.** Bricks' own documentation said
so — *"Selecting Tricky difficulty may generate a puzzle at Normal difficulty
instead"* — and `add-bricks-ts-port` D3 reproduced it deliberately, recording it
as an upstream quirk to preserve: the min-difficulty gate rejects only puzzles
the *Easy* solver completes, so it never guarantees the board strictly requires
the tier you chose. Mathrax has the same defect and nobody wrote it down: its
generator "gates only at `maxdiff` with maximal stripping; it does **not** reject
a puzzle that turns out solvable at a *lower* difficulty than requested."

Both were kept because correcting them changes every generated board, which used
to forfeit the byte-match oracle. **The owner released that constraint on
2026-08-01** ("happy to diverge in favour of a better play experience"), and
`audit-author-known-issues` §3c re-triaged this as the strongest item it
reopened. A difficulty setting that does not mean what it says is a plain
player-visible defect, not a difficulty curve.

**The fix is already proven in this repo, and it need not cost the differential.**
`spokes` ships exactly this correction — spec requirement *"Spokes grades its
difficulty tiers honestly"* — and keeps its byte-match fixtures by leaving
upstream's original acceptance check reachable **from the differential alone**.
Copy that shape.

The gap is a minority, not the norm: Boats, Rome, Seismic, Towers, Galaxies,
Undead, Keen and Tracks already accept only at exactly the requested tier.

## Sequencing (owner decision, 2026-08-01)

**Waits for `retire-c-engine`**, and possibly for a round or two of refactoring
after it, so this lands on a TypeScript-only codebase rather than alongside the
C teardown. Nothing here needs the C build: this game's differential imports a
frozen JSON fixture and keeps working with no C present.

Note the one-way consequence of that order — with no C build there is no
re-baselining a fixture against upstream. Where this change diverges, the fixture
is retired or re-founded on properties, not re-recorded. That is the intended
effect of the released oracle, not an accident of the sequencing.


## What Changes

- **Bricks and Mathrax reject a board solvable one tier below the requested one**,
  so every tier above the easiest means what it says.
- **Each keeps its differential** by retaining upstream's original acceptance
  check behind a test-only path, as Spokes does. If that proves impossible for a
  game, the fixtures are re-founded on "uniquely solvable at exactly its stated
  difficulty" and the loss is recorded.
- **Audit the remaining tiered games** — Ascent and Salad show no lower-tier
  rejection and must be checked rather than assumed; confirm the eight listed
  above; report anything else found. Fix what the audit turns up, or record why
  a game legitimately cannot grade (a tier whose deduction set is a superset in
  name only).
- **Make it a cross-game requirement** in `ts-migration`, so a future game cannot
  ship a tier that does not bind.

Explicitly **not** in this change: inventing new difficulty tiers for games that
have none (Clusters, Sticks, Subsets — separate changes), and re-balancing what
the existing tiers *mean*. This makes the labels true, not the curve different.

## Impact

- Affected specs: `bricks`, `mathrax`, `ts-migration` (a new cross-game
  requirement).
- Affected code: the generator acceptance gate in each game, plus its
  differential.
- **Every Bricks and Mathrax board above the easiest tier changes.** Existing
  game IDs carrying a description still load; a bare `params#seed` produces a
  different board. Generation cost rises (one extra solver run per candidate,
  plus rejections) and must be measured by the tail, not the median.
