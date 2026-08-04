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

- **Four games reject a board solvable one tier below the requested one** —
  Bricks and Mathrax as proposed, **plus Salad and Ascent**, which the survey
  found to be the two worst offenders in the collection (Salad's Extreme setting
  gave a Normal board 92% of the time). See `design.md` D1 for the full table.
- **All four keep their differentials** by retaining upstream's original
  acceptance check behind a test-only flag, as Spokes does. No fixture was
  re-founded and none had to be.
- **Two tiers turned out to be empty, and are refused rather than downgraded** —
  Bricks' Tricky at every size (its lookahead depth 2 decides nothing depth 1
  does not), and Mathrax at order 3 for Normal and Recursive. Refusal applies to
  generation only; existing game IDs still load.
- **Make it a cross-game requirement** in `ts-migration`, so a future game cannot
  ship a tier that does not bind — including the rule that an unbindable tier is
  *refused, not silently downgraded*, which four existing games currently
  violate deliberately and are recorded as known deviations.

The survey's own instrument was wrong first: enumerating tiered games by their
`DIFF_*` constants missed **Bridges**, which spells its tiers differently. It
grades honestly, so the defect list is unchanged — but the count is 27, not 26,
and `add-game-difficulty-contract` inherits the same blind spot (`design.md` D1).

Explicitly **not** in this change: inventing new difficulty tiers for games that
have none (Clusters, Sticks, Subsets — separate changes), and re-balancing what
the existing tiers *mean*. This makes the labels true, not the curve different.

## Impact

- Affected specs: `bricks`, `mathrax`, `salad`, `ascent`, `ts-migration` (three
  new cross-game requirements).
- Affected code: the generator acceptance gate in each of the four games, plus
  its differential; `validateParams` in Bricks and Mathrax; four help pages.
- **Every Salad, Ascent and Mathrax board above the easiest tier changes**, and
  Bricks loses its Tricky tier. Existing game IDs carrying a description still
  load; a bare `params#seed` produces a different board. **Bricks' Normal boards
  are bit-identical to before** — for Normal, "the tier below" already *was* Easy.
- Generation cost, measured by the tail over 30 boards per configuration: Ascent
  and Mathrax stay under 130 ms worst case, Bricks is unchanged, and only Salad's
  Number Ball Extreme is genuinely expensive (1.6 s median, 6.9 s worst) because
  Extreme boards are genuinely rare there — a median of 486 candidates and a worst
  of 4,419, which required raising Salad's retry bound so a legal seed cannot
  exhaust it.
