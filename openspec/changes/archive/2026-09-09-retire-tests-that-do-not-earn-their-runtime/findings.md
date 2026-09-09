# Findings — what the suite costs, and what it buys

> **CORRECTION, same day, and the interesting part is *why*.** Every absolute
> second below is **~1.7× too high**. Two files that no change had touched
> re-measured at 22.4 s and 14.8 s against the 40.5 s and 25.2 s recorded here,
> and the true full-suite figure at the time was ~**482 s CPU / 123 s wall**,
> not 715.8 s.
>
> **This document picked its instrument to escape contention and did not escape
> it.** It reasons that wall clock measures the box and CPU measures the code —
> true of *CPU* contention, and false here. The owner's box has **16 GB of RAM
> and was 23.9 GB into swap with ~65 MB free**. The scarce resource was never
> cores; it was memory. Under paging, `sys` time *is* page-fault time, so
> `user + sys` quietly re-imports the very contention the switch to CPU was
> meant to remove. Load average was a *proxy* for the real variable and a poor
> one.
>
> That is the same error three times in one session, each time one level
> deeper: summed wall duration (5× off), per-file CPU (1.7–1.8× off), and the
> belief that "quiet box" meant low load rather than low memory pressure.
> `docs/test-strength.md` §7 is about checking an instrument's *unit*; the unit
> was right each time. **What went unchecked was which resource was scarce.**
>
> **What survives:** every *ratio* and every *share*, because each before/after
> pair was measured under comparable conditions — the −67% and −33% per-file
> cuts, the differentials' 10.1%, the per-game attribution, and therefore every
> decision made here. **What does not:** the absolute seconds and the derived
> 836.4 s before-total.
>
> Recoverable only because the conditions were recorded alongside the figures,
> which `build-pipeline` now requires as a SHALL — extended to name memory
> pressure, not just load.

Measured **2026-09-09** on the owner's box (8 logical cores, deliberately busy —
other users' jobs held load average between 40 and 108 throughout). Every
*seconds* figure below is **CPU (`user + sys`)** from `/usr/bin/time` on a
single-file `vitest run`, because wall clock on this box measures the
contention: the same file showed 109 s CPU against 408 s wall, and the inflation
factor is not even uniform across files (`spokes-hint` 5.2×, `touch-input`
1.6×), so contended wall distorts the *ranking* and not merely the totals.

Wall clock is used for one thing only — **locating** cost, as a relative
measure, which is all `right-size-the-test-gate` ever claimed for it.

## 0. The census (task 0.6's vacuity guard)

| | |
| --- | --- |
| test files ranked | **301** (all of them: `find src vite-plugins -name '*.test.ts'` agrees) |
| tests executed | 8,504 passed + 6 skipped = **8,510** |
| `__fixtures__` JSON files | 51, of which **0 orphaned** (nothing unread) |
| `-differential.test.ts` files | 51 = 48 games + 2 grid + the helper's own test |
| slow-tier sites | 9 — but see §3, they are two different mechanisms |

## 1. The differentials are not where the cost is

The proposal's central worry — that retiring the frozen `c-reference` corpus
would remove the strongest net under solver refactoring — **never has to be
adjudicated**, because the corpus is cheap:

| category | files | share of suite time |
| --- | ---: | ---: |
| per-game (non-differential) | 138 | 47.6% |
| engine, incl. cross-game guards | 77 | 40.4% |
| **differential** | **50** | **10.1%** |
| app shell / build | 36 | 1.8% |

The heaviest single differential file is `slide-differential.test.ts` at
**11.5 s CPU**; `spokes` is 11.0, `seismic` 7.7. **Verdict: keep all 50.** The
`differential.ts` header's argument for them stands, and it costs a tenth of the
suite to honor it. This is the loud decline task 1.2 asks for: *the expensive
thing and the porting-era thing are not the same thing*, and retiring by
category would have cut the cheap half.

## 2. The cost is search-based hints, amplified by the cross-game guards

Attributing each cross-game guard's per-game `it` to the game it names (the
guards title their cases `"<gameId>: …"`, which is the join key):

| game | share of suite time |
| --- | ---: |
| **sixteen** | **30.1%** |
| netslide | 13.4% |
| spokes | 8.5% |
| salad | 5.6% |
| galaxies | 4.3% |

**Three games are 52% of all test time.** 93% of suite time attributes to some
game, so the "engine" category above is mostly games wearing an engine file's
name — which is exactly why attribution by *directory* had to be rejected:
Sixteen reads as 17% by directory and 30% once its cases inside `hint-resume`
and `hint-quality` are counted. (`AGENTS.md` § "A scan that keys on a name",
aimed at a cost model.)

The mechanism is specific and worth stating: **a hint that plans by searching
pays for board size twice over** — one full search per move, and more moves to
make on a bigger board — and the cross-game guards recompute a hint after *every*
move. The single most expensive test in the collection was one walk of one
Sixteen 5×5 board inside `hint-resume.test.ts`.

## 3. The slow tier is six tests, and could not be invoked on its own

`npm run test:slow` sounds like "run the deferred work". It is not:

| | count |
| --- | ---: |
| tests the gate runs | 8,504 |
| tests skipped in the gate — i.e. **the entire deferred tier** | **6** |

Six tests, in three files: 4 Seismic fixtures, 1 Bricks, 1 Pearl. The other six
"slow" sites are `seedBudget` dials, which **add no tests** — they make tests
already in the gate do 3–7.5× more work. So the command re-runs the whole gate
suite *and* multiplies its heaviest files, and there was no documented way to
run only the part you care about.

`vitest list` reports 8,504 and the JSON reporter 8,510; reconciling that
disagreement is what produced this finding, because **the gap is the tier**. A
"tests: 8,510" figure quoted without the status breakdown would have hidden that
the tier is six tests.

Targeted invocation does work and is now documented (`slow.ts`,
`docs/games/testing.md`): `npm run test:slow -- src/games/pearl` was verified to
run all 37 including the deferred fixture.

## 4. What changed, and what it saved

Both changes are **deferrals, not retirements**, and both derive their
population rather than listing it. `SEARCH_PLANNING_GAMES`
(`engine/testing/hint-games.ts`) reads each game's own comment-stripped source
for a call to the shared slide planner — the derivation already existed inside
`hint-resume.test.ts` for an unrelated reason, and it resolves to exactly
`["netslide", "sixteen"]`, the two most expensive games in the suite.

| file | before | after | saved |
| --- | ---: | ---: | ---: |
| `engine/hint-resume.test.ts` | 149.5 s | **49.3 s** | −100.2 s (−67%) |
| `engine/hint-quality.test.ts` | 61.8 s | **41.4 s** | −20.4 s (−33%) |
| | | | **−120.6 s CPU** |

Against the whole suite: **715.8 s CPU measured after** (`/usr/bin/time` on
`vitest run`, 817.9 s wall even at load ~100 — the suite parallelizes, so wall
and CPU converge here where they diverged 4× per file). The before figure is
**836.4 s**, which is 715.8 + 120.6 rather than a second measured run: only two
files changed, both were measured before and after by the identical method, and
the saving is *work removed* rather than boot amortized, so it transfers
unchanged into a parallel run. **A −14.4% suite saving**, stated as derived
because that is what it is.

The figure is a sanity check on itself: `AGENTS.md` records the gate at 13–18
minutes of CPU, and 836 s of vitest sits inside that band with `tsc`, biome and
`vite build` still to add.

- **`hint-resume`** — a searching game walks its *smallest* preset in the gate,
  every preset in the slow tier. Previously first-and-last, and "last" is a 5×5
  board planned by exact search.
- **`hint-quality`** — a searching game walks its three smallest presets. The
  property under test is the *wording* of an explanation, and a planner's
  narration vocabulary does not vary with board size. Three is what reaches
  every mode Netslide varies (three barrier/wrapping modes at each of three
  sizes, ordered smallest-first).

### What still covers the large boards, on every commit

Recorded per member in `hint-resume.test.ts`'s `SEARCH_REACH` ledger, so a
future third member of the derivation cannot be demoted silently — the existing
equality assertion fails until someone writes the sentence.

- **sixteen** — `sixteen.test.ts` walks recomputed hints to solved on five
  hand-picked 5×5 boards: the tangles and swapped pairs the hint actually gave
  up on. **Strictly sharper evidence than one random 5×5.**
- **netslide** — `netslide-reconstruct.test.ts` walks **every** preset (5×5
  wrapping included) to completion on recomputed hints, with no `aux` at all.

### Verified to still discriminate

`build-pipeline` § "A test is made cheaper" requires breaking the code and
watching it fail, not reasoning about it. Two probes, both on the tree as
shipped:

1. **`TANGLE_COST` term zeroed** in `sixteen/index.ts` → `sixteen.test.ts` fails
   on "four tangles — the board the hint refused on", *in the gate*, without
   `hint-resume`'s 5×5 walk. This is the probe the whole deferral rests on.
2. **`TANGLES_IN_REACH` mistuned** 2 → 4 → the same test fails.

Both restored; the tree is clean of them.

## 5. Declines — recorded as loudly as the cuts (task 1.2)

- **All 50 differential files stay.** §1. Cheap, and each validates generator,
  solver and codec together.
- **`sixteen.test.ts`'s three-case tangle walk stays** (109 s CPU, now the
  single most expensive file). It is the deterministic regression evidence for a
  defect fixed the day before this audit (`7b45ce86`), *and* §4 just made it the
  sole gate cover for Sixteen at 5×5. Probe 2 confirms case 1 alone catches a
  mistuned constant, but the test aborts on first failure so it cannot say
  whether cases 2–3 are redundant — and the change that added them did so
  explicitly for "the class around it", i.e. to stop the fix being overfit to one
  board. Speed alone is not a reason (`AGENTS.md`: tidiness is not a benefit).
- **Nothing was deleted outright.** The proposal hunted three shapes; the
  measurement found the expensive tests are, with the above exception,
  legitimate guards whose *assertions* earn their keep. What they did not earn
  was being paid at full board size on every commit — which is a deferral
  question, not a retirement one. **Reporting that plainly is the result**, not a
  failure to find anything.
- **`.gitkeep` in 28 populated `__fixtures__` directories** is vestigial and
  costs nothing at runtime. Noted, not swept, to keep this change's diff to one
  shape.

## 6. Instrument log — what was checked before it was believed

`docs/test-strength.md` §7. Every instrument here was validated against
something outside itself:

| instrument | checked by | outcome |
| --- | --- | --- |
| vitest JSON reporter | run on one file, inspected shape | per-assertion durations present |
| `/usr/bin/time` on vitest | does it capture *worker* CPU? measured a file known to be heavy | 96.8 s user vs a 0.9 s boot floor — yes |
| summed per-test duration | `hint-resume`'s own recorded 69 s at load 4.7 vs 752 s here | wall is 6–10× inflated; **ranking only** |
| `vitest list` vs JSON count | reconciled the 6-test gap | the gap *is* the slow tier (§3) |
| per-game attribution | directory-based vs `it`-title-based | directory hides 13 points of Sixteen's cost |
| fixture orphan sweep | counted inputs (51) before trusting "0 orphans" | vacuity guard passed |
