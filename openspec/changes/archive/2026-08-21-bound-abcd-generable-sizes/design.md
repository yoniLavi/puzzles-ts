# Design — bound-abcd-generable-sizes

The sweep harness is throwaway (the Clusters precedent did the same); **this
file is the artefact that survives it**. Every constant in
`MAX_GENERABLE_AREA` traces to a row here.

## D1: The measurement

139 configurations, in four passes. One "attempt" is the generator's loop body —
a random legal fill, then `solveAbcd`'s verdict on the resulting clue counts —
and the *acceptance rate* is what decides whether a board exists to be found.
`removenums` is irrelevant to the rate (clue-hiding happens after acceptance);
`diag` is not (it changes `placeLetter`'s legality rule).

**The instrument was checked before the finding.** The harness transcribes the
loop body so it can be interrupted, which risks measuring a different population
than the one that ships. So it asserted that its first accepted grid produces
byte-for-byte the desc the real `newAbcdDesc` returns from the same seed, over
12 (config, seed) pairs including a `diag` one. That passed before any number
below was believed.

**Expected time, not attempts, is the decision-relevant unit** — and it is the
*mean of a geometric distribution*, so p90 ≈ 2.3× and p99 ≈ 4.6× the mean. A
bound set at "5 s expected" is a 23-second frozen worker for one player in a
hundred. That is why the tolerance below is ~2.5 s and not "a few seconds".

Per-attempt cost turned out to be roughly flat (0.02–0.14 ms) rather than
scaling with area, because most attempts are rejected early. The proposal's
assumed 0.065 ms/attempt was a fair average after all — recorded because it was
worth checking rather than assuming.

### The frontier (selected rows; shorter side ≥ 6)

| letters | largest generable | rate | slowest refused |
|---|---|---|---|
| n3 | 11×11 (121) | 1 in 3,965 → 296 ms | 12×12 (144) 6.0 s; 9×20 (180) never |
| n4 | 9×9 (81) | 1 in 18,586 → 1.2 s | 9×10 (90) 5.0 s; 10×10 (100) **0 in 454,144** |
| n5 | 8×9 (72) | 1 in 30,788 → 2.0 s | 7×11 (77) 5.0 s; 9×9 (81) 30 s |
| n6 | 8×8 (64) | 1 in 6,549 → 500 ms | 8×9 (72) 7.5 s; 9×9 (81) never |
| n7 | 8×8 (64) | 1 in 8,107 → 667 ms | 8×9 (72) **0 in 344,832** |
| n8 | 8×8 (64) | 1 in 5,932 → 581 ms | 8×9 (72) 7.5 s |
| n9 | 8×8 (64) | 1 in 4,215 → 489 ms | 8×9 (72) 15 s |
| n5 diag | 10×10 (100) | 1 in 8,194 → 735 ms | 11×11 (121) 10 s |
| n6 diag | 9×9 (81) | 1 in 22,067 → 2.0 s | 10×10 (100) never |
| n7 diag | 8×8 (64) | 1 in 1,073 → 102 ms | 9×9 (81) 5.0 s |
| n8/n9 diag | 8×8 (64) | 1 in 928 / 654 | 9×9 (81) 15 s / never |

Two facts worth stating outright:

- **`diag` makes a board markedly EASIER**, despite adding a restriction. A more
  constrained board is more deducible, so the solver reaches a unique solution
  more often. 9×9 n5 never generates; with `diag` it takes 34 ms. Any bound that
  ignored `diag` would have barred a large family of working boards.
- **"0 accepts in N" is not "never" until N is large.** Pass 1's failing configs
  were all "0 in ~86,000", whose 95% upper bound on the rate is ~1 in 28,600 —
  a two-second wait, not an impossibility. Pass 2 spent 30 s per config to get
  10× the attempts, which is what turns 10×10 n4 into a real result. Task 1.1's
  "enough attempts to separate *rare* from *never*" was doing statistical work.

## D2: Both obvious closed forms are wrong, and the second one had to be tested

The proposal expected an `(area, letters)` table and flagged that area alone
might not suffice. It does not — and neither does the better candidate that
replaced it.

**Area alone dies immediately.** Same area, four orders of magnitude apart:

| config | area | rate |
|---|---|---|
| 10×10 n4 | 100 | 0 in 454,144 |
| 2×50 n4 | 100 | 1 in 2,558 → **195 ms** |
| 9×10 n4 | 90 | 1 in 77,781 → 5.0 s |
| 3×30 n4 | 90 | 1 in 1,528 → **199 ms** |

**Clue density looked right and is also wrong.** Generation accepts only when
`(w+h)·n` clues uniquely determine `w·h` cells, so the information ratio
`n(w+h)/(wh)` — equivalently the harmonic mean of the sides, scaled by `n` —
falls straight out of the mechanism, and it ordered every pass-1–3 point
monotonically within each `n`. It is still false:

| config | `n(w+h)/wh` | measured |
|---|---|---|
| 8×10 n4 | 0.90 | 859 ms |
| 5×40 n4 | 0.90 | **0 in 78,592** |
| 4×100 n4 | 0.72 | **0 in 79,360** |

**Why this was caught rather than shipped: the model was tested out of sample.**
Every "never" point in passes 1–3 is near-*square*, so `min(w, h)` and the
harmonic mean move together throughout the data the model was fitted to, and the
fit cannot tell them apart. Pass 4 was eleven deliberately elongated configs
chosen so the two disagree, with the prediction written down first. Four of
eleven predictions were wrong, all in the same direction — elongated boards are
*harder* than the density model says. Had the model been shipped on its
in-sample fit, `4×100 n4` and `5×40 n4` would have been offered to players as
generable and frozen the worker.

This is the Clusters lesson in its sharper form. There it was *"a guessed
constant would bar boards that work or admit boards that never will"*; here even
a **mechanistically derived** predicate that fits 100+ measurements did exactly
that. A formula over a measured frontier is still a guess until it is tested
somewhere the data did not already constrain it.

## D3: What ships, and why it is two rules rather than one

Since no single scalar orders the frontier, the predicate splits the space where
it genuinely behaves differently — at the shorter side:

- **Shorter side ≥ 6** — a measured maximum area per `(letters, diag)`.
- **Shorter side < 6** — a single generous area cap of 160. A short line is
  nearly pinned by its own clues, so thin boards stay easy far past where a
  squarer one dies (2×50 n4: 195 ms; 5×30 n3, area 150: 2.5 s). 160 is the
  largest thin area measured generable plus margin; 5×40 n4 at area 200 never
  generates and is refused.

**Verified against all 139 rows in both directions**: zero configurations
measured generable within ~2.5 s are refused, and zero configurations measured
slower or hopeless are admitted. Both directions matter — a bound checked only
for "does it refuse the bad ones" is half a bound.

`abcd.test.ts` asserts the shipped presets pass, nine measured-generable configs
are admitted (including the thin ones and a `diag` one), ten measured-hopeless
configs are refused, and the refusal costs under 100 ms. The repo's rule that
*an optimised artefact needs its bounds asserted* applies to a fitted one too.

### The cap is a backstop, not the mechanism

`retry-limit.ts` states the doctrine: a cap exists to catch a **porting
divergence**, and *"params that provably admit no puzzle"* are supposed to be
refused by `validateParams` up front. So the fix is the bound; the cap is only
sized to agree with it. 5,000,000 → **250,000**, which is ~8× what the slowest
admitted configuration (8×9 n5, 1 in 30,788) needs, leaving it ~0.03% chance of
spuriously exhausting the budget. A firing still means what the module says it
means.

## D4: The bound could not be added until a dead engine flag was revived

`validateParams(p, full)`'s `full` means *"these params are about to generate"* —
it is how a game says "this bound is generation-only", so an already-described
board is unaffected. **It did not work.** All four production call sites passed
a literal `true`, including `newGameFromId`, which validates *before* it branches
on `:desc` versus `#seed`. Upstream passes exactly `desc == NULL` there
(`midend.c:1956`).

So the flag was dead: **sixteen games gate a bound on it and every one was
gating on a constant.** Three — Bricks, Mathrax and Clusters — carry a comment
asserting the behaviour that was not happening, e.g. Clusters' *"a saved game or
a game ID carrying its own description still loads at any size, because `full`
is false there."* Three independent authors documented the intent; nothing
implemented it, and no test covered it, because the symptom only appears for
params someone has since bounded — and until this change, nobody had.

Bricks is the concrete casualty: its retired third difficulty is deliberately
kept decodable *"so an old game ID or saved game reaches here"*, and an old
`…dt:<desc>` link was being refused.

Fixed in `midend.ts` (`full = id[sep] === "#"`), with `midend.test.ts` proving
the desc arm loads while the seed and `setParams` arms still refuse. The test was
**watched to fail first**. Saved games were never affected — `loadGame` does not
call `validateParams` at all.

Without this, ABCD's bound would have retired every shared 10×10 game ID, and
the change's own spec scenario ("An existing game ID outside the bound still
loads") could not have held.

## D5: The 1×N Clusters residual — left standing (task 4.3)

The proposal asked whether this change should establish a general rule for
"configurations a game should decline to offer even though they generate", with
1×N Clusters as its first candidate. **It should not, and this change is
evidence against it rather than for it.**

The two cases are not the same shape. ABCD's bound refuses configurations that
produce **no board at all** within any tolerable time — a correctness-adjacent
fact about the generator, measured. The 1×N Clusters board **generates fine and
plays**; refusing it would be a *taste* judgement that a degenerate-but-working
board is not worth offering, and it would remove something that ships today.

One data point is not a rule, and a rule invented here would be applied by
future changes to boards nobody measured. The note stays a note.
