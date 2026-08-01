# bound-abcd-generable-sizes

## Why

**ABCD's Custom dialog will accept a board its generator can never build, and
the app then freezes for minutes before giving up.** The game's author knew:
`abcd.c` opens with

> `TODO:` — *Get large puzzles to have a lower fail ratio. I haven't currently
> been able to produce a valid 10x10n4 puzzle, and a 9x9n4 puzzle can take
> _tens of thousands_ of attempts.*

The TS port reproduced the generator faithfully — correctly, it is the
difficulty curve upstream shipped — and set `ABCD_MAX_ATTEMPTS = 5_000_000` so
the shipped presets never reach it. What nobody measured is what that bound
costs when it *is* reached. `audit-author-known-issues` measured it: 30,000
generator attempts per configuration, each ~0.065 ms.

| grid | 6×6 n4 | 7×7 n4 | 8×8 n4 | 9×9 n4 | 8×10 n4 | 9×9 n5 | 10×10 n4 | 12×12 n4 |
|---|---|---|---|---|---|---|---|---|
| accepted | 1 in 9.7 | 1 in 52 | 1 in 526 | 1 in 15,000 | 1 in 10,000 | 0 | 0 | 0 |

`n = 3` tolerates a larger board (11×11 still succeeds 1 in 5,000); `n ≥ 5` dies
sooner (8×8 n5 is 1 in 4,000, 8×8 n6 is 1 in 6,700) — so this is **not** a
single area ceiling, and a guessed constant would either bar boards that work or
admit boards that never will.

The consequence today is that a player who types `10x10` with four letters gets
**5,000,000 × 0.065 ms ≈ 5.4 minutes of frozen worker** and then an unhandled
`RetryLimitExceeded`, rather than the immediate explained refusal Seismic gives
for the same class of limit (`MAX_CELLS`, `replace-seismic-region-generator`).

## What Changes

- **Refuse the un-generable configurations up front**, in `validateParams` when
  validating for generation, with a reason naming the limit — never when a
  description is already in hand, so an existing game ID stays loadable.
- **Decide the predicate by measurement, not by a guessed formula.** Two shapes
  to weigh in the design: a measured `(area, letters)` table baked in from a
  sweep, or a short trial run of the generator itself at validate time — Boats
  already validates its fleet by *running* the generator (`fleetFits`), so the
  precedent for the latter exists in this repo.
- **Bring `ABCD_MAX_ATTEMPTS` down** to a value consistent with whatever the
  predicate admits, so a residual near-miss fails in seconds rather than minutes.
- **Cover the presets explicitly with a test**, so tightening the bound can never
  bar a board the game actually ships.

Explicitly **not** in this change: making large boards *generable*. The author's
own alternatives ("force a 0 on a row/column", "introduce immutable letters")
change what an ABCD puzzle is, and would change every board the game generates,
forfeiting the byte-match differential. This change makes the limit honest; it
does not move it.

## Impact

- Affected specs: `abcd` (a new parameter-validation requirement).
- Affected code: `src/native/games/abcd/{state,generator}.ts` plus tests.
- No change to any board that generates today.
