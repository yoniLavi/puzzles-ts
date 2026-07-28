# replace-seismic-region-generator

> **Implemented 2026-07-28, with one goal dropped by owner agreement.** The
> headline defect is fixed: Seismic 7×7 went from **24.9 s to 108 ms** and the
> 28-fixture byte-match oracle survived intact. **But consequence 2 below is only
> half-met — 10×10 is reachable in *Tectonic* mode and is NOT reachable in
> *Seismic* mode**, which is the mode the author's "10x10 is a common size for
> Hakyuu puzzles" refers to. Nine region-size distributions were measured against
> it; the best managed 34 fills per 100 partitions, and only by changing what the
> puzzle looks like at every size. The reason is structural (Seismic's keep-apart
> rule scales with the number's value, so the packing stays near capacity at every
> board size) and lifting it needs a different fill algorithm, not a tuned
> constant. See `design.md` F4 for the measurements, and F5 for the bounds that
> did move: `MAX_CELLS` 49 → 72 (Seismic) / 100 (Tectonic).

## Why

**Seismic's board generator does not scale, and its own author says so.**
`puzzles/unreleased/docs/seismic.md` reads: *"This puzzle is playable on lower
sizes, but has a near-zero chance of generating sizes higher than 7x7. The
generator step that creates randomly filled regions needs to be completely
replaced with a different approach."* The `.c` repeats it as the first TODO in
the file, and adds the size that matters: *"10x10 is a common size for Hakyuu
puzzles."*

The TS port (`add-seismic-ts-port`, accepted 2026-07-27) reproduced that
algorithm faithfully and **measured** what it costs. The region-growing stage
merges across randomly-ordered borders and then demands, post hoc, that every
resulting region hold exactly `1..k` for its size — a test it can only pass by
luck. Success rate of that stage, 200,000 attempts per shape:

| cells        | 16   | 25    | 36      | 48       | 49        | 56 | 64 |
|--------------|------|-------|---------|----------|-----------|----|----|
| success rate | 1/22 | 1/191 | 1/4,167 | 1/66,667 | 1/200,000 | 0  | 0  |

Two player-visible consequences follow, and both are live today:

1. **The 7×7 presets take 12–28 seconds to appear.** (The C is worse — 42.9 s on
   the same seed where the port takes 27.8 s — so this is the algorithm, not the
   port. It is nonetheless what a player waits through when they pick a preset
   from the menu.)
2. **Nothing above ~50 cells can be generated at all**, so the port has to reject
   it: `MAX_CELLS = 49` in `validateParams` turns what would be an unbounded
   freeze into an immediate, explained refusal in the Custom dialog. Correct
   handling of a real limit — but it means **10×10, the size the puzzle is
   normally played at, is unreachable**.

`audit-author-known-issues` — the planned sweep of every unreleased game's
author-stated faults — anticipated this one and deliberately scoped itself to
*proposing* a Seismic generator change rather than attempting one. This is that
proposal, opened early because the port already did the measurement and it would
otherwise have to be redone. The audit still records the item; it now has a change
to point at.

This is squarely the fork's licence to diverge: an upstream *defect the author
identified and asked to have fixed*, not a difficulty curve deliberately shipped
(playbook §4 rule 3, and §1.0 on treating an author's Status section as a scoping
fact). It was deferred out of the port so the port could land byte-matched; this
change is where it gets done.

## What Changes

- **A constructive region generator** in `src/native/games/seismic/generator.ts`:
  partition the grid into connected regions of a chosen size *first*, then fill
  the numbers into that partition by propagating search, so a region holds
  `1..k` **by construction** instead of by luck. Design D1 works the approach
  through; the key reuse is that `solver.ts`'s `placeNumber` **already is** the
  propagation the fill needs (place `n`, strike it from the keep-apart cells and
  from the rest of the region), so the fill is a randomised search over the
  existing engine rather than new machinery.
- **The size ceiling lifts.** `MAX_CELLS` is re-derived from measurement of the
  new generator and raised or removed; `validateParams` keeps whatever bound the
  measurement actually justifies, with its reason (playbook §4: reject the
  precise thing you measured).
- **Larger presets**, once the sizes are reachable — 10×10 at least, in both
  modes, since that is the size the puzzle is normally played at.
- **The byte-match differential is preserved, not sacrificed** — the
  `upstreamDirtyGate` shape from `add-spokes-ts-port`: upstream's fill-then-merge
  survives behind a `upstreamRegionGrower` option that **only the differential
  sets**. The 28 frozen fixtures keep matching the C byte-for-byte, so the
  solver, the codec and the clue-stripping loop keep their oracle; only the new
  grower sits outside it, and it gets behavioural + property tests instead.
  Paired with a test asserting the flag still *changes* the outcome, so the
  oracle cannot silently decay into testing the shipped path (design D3).
- **Property tests for the new grower** — every generated board's regions are
  connected, hold exactly `1..k`, and satisfy the mode's keep-apart rule; every
  generated board is uniquely soluble at exactly its requested difficulty band.
  These are the guarantees the byte-match was standing in for.

Explicitly **not** in this change:

- **The clue-stripping and difficulty-grading stages** (`genClues`, `genDiff`) are
  untouched. They are not the bottleneck, they are what makes the puzzle *a
  puzzle*, and they stay inside the byte-matched path.
- **The solver.** Its deductive strength decides which puzzles exist at each
  difficulty; changing it would change the difficulty curve on top of changing
  the boards. Out of scope, and its own change if ever wanted.
- **An explained hint.** Still a separate change, as for every game.

## Impact

- Affected specs: `seismic` (the generation and the parameter-validation
  requirements are modified).
- Affected code: `src/native/games/seismic/generator.ts` (the new grower + the
  upstream one behind the option), `state.ts` (`MAX_CELLS`, presets),
  `seismic-differential.test.ts` (sets the option), `seismic.test.ts` (the new
  property tests).
- **Shared game IDs change.** A `params#seed` ID generates a *different* board
  after this lands, because the RNG is consumed differently. A `params:desc` ID
  — the form the Share dialog produces — is unaffected, as is every save. The
  exposure is small (Seismic has been TS-served since 2026-07-27 and C/WASM
  before that, and `#seed` IDs are the rarer form), but it is a real, deliberate
  break and should be stated when the change is accepted rather than discovered.
- No icon work, no catalog change, no CMake change: Seismic is already
  `TS_PORTED` with its C deleted.
