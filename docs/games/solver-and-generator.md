# Solver & Generator Guide

How a game's deduction engine, difficulty tiers, generator, `solve()` and
`findMistakes` fit together. This file is the followable *how*; the normative
*what* lives in the specs — chiefly the
[`ts-migration`](../../openspec/specs/ts-migration/spec.md) requirements
**"Narratable-deduction generation policy"**, **"A difficulty-capped solver is
monotone in its cap"**, **"A difficulty tier binds the board it generates"**
and **"An unbindable tier is refused, not silently downgraded"**, and the
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) requirement **"A hint
step always names a technique — no un-narrated fallback"**.

Related guides: [hints.md](./hints.md) (narration and plan mechanics),
[testing.md](./testing.md) (the frozen differentials and what a red one
means), [engine-catalog.md](./engine-catalog.md) (the shared helpers named
here, one entry each), [mechanics.md](./mechanics.md) (where the hooks sit on
the `Game` interface).

---

## One engine, two projections

**A logic game has one deduction engine, consumed twice: the generator/grader
runs it with the recorder off, and the hint runs the same engine with the
recorder on.** This is the narratable-deduction doctrine
(`adopt-narratable-deduction-engine`), and it is the load-bearing idea of this
whole guide: the techniques that decide which boards *exist* are the same
techniques the hint narrates, so the hint can always name the technique that
forces a move — because no board was ever accepted on the strength of a
technique the hint cannot explain.

Consequences, each expanded below:

- Generation is **guess-free** at every shipped tier (see
  [Guess-free generation](#guess-free-generation)).
- Difficulty is graded by **which technique rung a board needs**, and a tier
  means exactly that rung (see [Difficulty tiers](#difficulty-tiers)).
- A hint never emits an un-narrated catch-all (see hints.md; the standing bar
  is restated under
  [No un-narrated fallback](#no-un-narrated-fallback)).
- `findMistakes` and `solve()` reuse the same solver rather than growing a
  second opinion (see [findMistakes](#findmistakes)).

## The deduction fixpoint

**New logic games build their solver/hint loop on
[`engine/deduction-fixpoint.ts`](../../src/engine/deduction-fixpoint.ts)
(`runDeductionFixpoint`) rather than hand-rolling it.** The loop is an ordered
ladder of technique rungs, easiest first, that restarts from the top the
moment any rung fires ("return after first firing", which keeps one firing =
one hint group), stops when nothing fires or the board is solved, and reports
the highest rung that fired as the grade. The runner owns:

- the **rung contract** — each rung applies its technique once and returns
  `> 0` (fired), `0` (nothing to do), `< 0` (contradiction proved);
- the **`maxRung` grading cap** — while grading a tier, don't pay for rungs
  the tier can't use (this alone cut Undead's 7×7 Normal generation ~6×);
- the **recording-path step budget** — pass a
  [`stepBudget`](../../src/engine/step-budget.ts) on the hint call and omit it
  on the generator call, so a rung that reports progress without changing the
  board fails loud on the hint path and the generator path stays byte-for-byte
  unchanged (see hints.md on the budget guard);
- the optional `solved` early-out and the `beforeRung` hook (used by
  `latinSolverTop` to bump the firing-group id so one firing's records share a
  `group`).

Converged call sites to read as exemplars:
[`engine/latin.ts`](../../src/engine/latin.ts) (`latinSolverTop`, and through
it the Latin family),
[`filling/solver.ts`](../../src/games/filling/solver.ts) (`FillingSolver.run`),
[`undead/solver.ts`](../../src/games/undead/solver.ts)
(`recordUndeadDeductions`),
[`pattern/solver.ts`](../../src/games/pattern/solver.ts) and
[`magnets/solver.ts`](../../src/games/magnets/solver.ts).

### Where the fixpoint does not fit

**The ladder *shape* is near-universal; the bookkeeping wrapped around it is
per-game — and that bookkeeping is often what decides which puzzles exist. A
solver whose loop *looks* like this one is not evidence that it *is* this
one; the differential is.** This module's own header used to overclaim ("the
one loop every logic game hand-rolled") and the claim did real damage: it
turned "does this game fit?" into "why has this game not been adopted yet?"
and produced two separate handoffs asserting Loopy fits when it does not.
The audited no-gos (`adopt-shared-deduction-fixpoint`), each read rather than
inferred:

| Game | Why it is not this runner |
| --- | --- |
| Loopy | its `(thresholdDiff, thresholdIndex)` bookkeeping is not this runner's grade bookkeeping |
| Unruly | grades by difficulty constant, not rung index |
| Singles | drains an op queue once per iteration; signals contradiction by a flag, not a `< 0` return |
| Spokes | its tier is an accumulated action count, not "which rung fired" |
| Clusters | its early-out is three-valued, not boolean |
| Lightup | its rungs are fused into one pass in upstream's scan order, load-bearing for generation |

Do not "adopt" one of these onto the runner to tidy the codebase: a
refactor that changes any solver verdict changes which boards exist, and the
frozen differentials will say so (see
[Solver-gated generation](#solver-gated-generation)).

## Guess-free generation

**An explained hint can exist only if the board is solvable by pure deduction
— so guess-freedom is a *generation* policy, not merely a hint policy**
(owner decision, 2026-06-24; normative home: the `ts-migration`
**Narratable-deduction generation policy** requirement). A hint that falls
back on the known solution or a backtracking search isn't teaching a *why*;
it's revealing the answer.

- **Every difficulty tier a logic puzzle ships MUST be solvable by its
  deductive solver with zero guessing**, enforced at generation time: a board
  is accepted only if the deductive solver (no recursion/backtracking) solves
  it uniquely. Exemplars:
  [`range/solver.ts`](../../src/games/range/solver.ts) (keeps a board "only
  if uniquely solvable without any guessing") and
  [`unequal/generator.ts`](../../src/games/unequal/generator.ts) (caps
  assembly below the recursive level).
- **The one sanctioned exception is a tier explicitly named "Unreasonable".**
  An Unreasonable preset MAY require guess-and-backtrack, and its hint is
  correspondingly allowed to be non-deductive on those boards
  ([`towers/index.ts`](../../src/games/towers/index.ts),
  [`keen/index.ts`](../../src/games/keen/index.ts)). No other tier name
  (Easy/Normal/Hard/Tricky/Extreme/…) may require guessing.
- **Movement / objective games are out of scope.** Fifteen, Sixteen, Flood and
  Untangle are always solvable and carry no deductive "why"; their hints are
  imperative/heuristic by design (hints.md § "Non-deductive (heuristic) hints"), and
  Untangle's `aux`-walk is the sanctioned non-deductive form.

**The deduction/guessing line** (owner, sharpened 2026-08-11): **if it
requires *guessing* rather than *checking*, it is Unreasonable.** The test is
whether the rejected trial has to **propagate** before the contradiction
appears:

- **Checking** — put a value in and *look*: one clue, one count, one
  neighbour breaks immediately, without thinking a step ahead. That is plain
  deduction and belongs at any tier. Sticks' `sticksTry` (one tentative
  orientation, one validator call, no fixpoint) is the exemplar; so is
  Galaxies' "only one dot could own this cell", which tests each dot against
  conditions that are true or false on sight.
- **Guessing** — put a value in and *run the solver from it*, then take the
  contradiction it eventually reaches. Galaxies' Unreasonable rung is this
  shape: `refuteAssoc` runs the whole deduction fixpoint from its hypothesis
  and can settle dozens of cells before the board breaks. Sound, narratable,
  and **Unreasonable-only**.
- *Nested* speculation (assume A, then within that assume B, …) is guessing
  twice over and stays Unreasonable-only for the same reason.

The two shapes look identical in a solver — `try one value, ask the oracle,
take the other on INVALID` — and land on opposite sides of the line, so read
the call, not the technique's name (`hints.md` § "The forcing boundary" has
the same test from the cognitive-load side).

**Open question this sharpening raises, not yet settled:** the Latin family's
`Extreme` tiers were described here as single-level forcing and therefore
deduction. If their forcing *propagates* before the contradiction, they are
guessing under a name that may not require it, and either the rung or the
tier name needs to move. Nobody has read `latin.ts` against this test yet.

**Practical consequence before writing a hint:** confirm the generator can't
emit a board the deductive solver can't crack at the shipped tiers. If it
can, you have three moves: gate generation to deduction-only, strengthen the
deductive solver so the hard tier survives guess-free, or move the guessing
boards under an explicitly-named Unreasonable tier.

### No un-narrated fallback

**A displayed hint step must name the technique that forces it; a game's hint
must never emit an unexplained catch-all** (e.g. *"only one arrangement
fits"*) for a deduction its technique set doesn't cover. The two compliant
ways to guarantee that, chosen per game **by measured cost**:

1. **Narrate everything the gate accepts** — promote any catch-all into an
   honest technique, even a non-local or tedious one (Filling narrates its
   global candidate-elimination honestly; Pattern's old generic `forced`
   fallback was promoted into a named single-line-intersection bottom rung,
   `remove-pattern-hint-fallback`). Keeps every generated board — and any
   byte-match differential — intact.
2. **Reject at generation** — accept a board only if the narratable
   techniques solve it to completion; retry away the rare board that needs an
   un-narratable deduction. This shrinks the generated set, so **measure the
   rejection rate first** (a teachable set materially weaker than the full
   solver can thin or empty a size/tier or slow "New Game") — and **re-grade
   the tiers** after the flip.

### Strengthening a solver instead of shipping guesswork

**When a game's shipped tiers turn out to need guessing, the usual right move
is to build the missing deductive rungs, then re-grade** — not to add an
Unreasonable tier on a hunch. The worked example is Undead
(`strengthen-undead-deduction`), which originally graded by *how much brute
force a board needs* and now ships a genuine ladder; it generalises to any
non-Latin candidate game:

- **Exact counting** (Hall-type deductions off a global tally that is an
  equality): a type whose full count is placed is struck everywhere; a type
  whose candidate cells equal its remaining need forces them all; too few
  candidate cells is a contradiction
  ([`undead/solver.ts`](../../src/games/undead/solver.ts) `countingPass`).
- **Depth-1 forcing** (`forcingPass`): hypothesise one candidate, run the
  arc-consistency + counting fixpoint, eliminate on contradiction — deduction,
  per the line above, because the inner fixpoint never forces.

Then re-grade by which rung is needed, and accept a board only when the
deductive ladder solves it uniquely with zero recursion — verified
independently against the brute-force oracle. Two lessons that transfer:

- **Cap the ladder at the tier's rung while grading** (`maxRung`): forcing is
  the expensive rung and a board the tier can't use is rejected anyway.
- **Measure the recursion-only residual before deciding to ship an
  Unreasonable tier.** Undead's came out exactly zero — every
  uniquely-solvable board is cracked by the ladder, and the boards the ladder
  can't solve are precisely the non-unique ones the uniqueness oracle rejects
  anyway. The data may say the ladder already suffices.

## Difficulty tiers

### The difficulty contract

**A game with tiers declares
[`Game.difficulty`](../../src/engine/difficulty.ts) — a
`DifficultyContract`: its tier names, `tierOf`/`withTier` accessors, and a
`solveAtCap` that runs its solver from a fresh state with the ladder capped.**
Declaring it enrols the game in the cross-game guards
(`difficulty-contract.test.ts`) the moment the field exists; an untiered game
omits it, exactly as a game without a solver omits `solve`. Read the module
header of `difficulty.ts` for why it is accessor-shaped (eight games don't
hold a numeric tier field at all) and why the verdict is the discriminated
`"solved" | "unsolved" | "impossible"` rather than the solvers' private
integers.

**Freshness of `solveAtCap` is load-bearing.** Reusing a live scratch is how
`grade-difficulty-tiers-honestly`'s first Ascent gate under-rejected — a
retained field deliberately weakened that solver and left side effects behind
for the next caller. A tier probe runs on state uncontaminated by earlier
candidates (the `ts-migration` requirement of that name).

### A tier means exactly its rung

**The generator-acceptance rule that makes a tier mean what it says: a board
is accepted for tier `t` only if it solves at `t` and does *not* solve at
`t − 1`.** That rule is written once, as
[`solvableAtExactlyTier`](../../src/engine/difficulty.ts) — use it instead of
re-spelling it (`grade-difficulty-tiers-honestly` had to spell it out four
separate times because there was nowhere to put it). Notes:

- **It asks the cheap question first** (solve at `t − 1` before `t`), which a
  retrying generator pays for far more often than the deep solve —
  `add-clusters-difficulty-tiers` measured this making the whole generator
  *faster than before it had tiers* (10×10 Tricky worst case 25.0 s → 10.9 s).
- **It takes a closure, not a `Game`** — a generator cannot import its own
  `index.ts` without a cycle, but it can always close over its solver
  (`cappedSolveFor` when you do hold a contract).
- **A tier that cannot bind is refused, not silently downgraded** — the
  `ts-migration` requirement of that name; two tiers were *removed* rather
  than left generating boards of a different difficulty than their label.

### Cap-monotonicity, and the game that broke it

**A difficulty-capped solver must be monotone in its cap: a board solvable at
cap `d` solves at every cap above `d`** (normative:
`ts-migration` § "A difficulty-capped solver is monotone in its cap"). This
is not theoretical — Boats disproved the reflex "solve at the maximum cap;
more techniques can only help": its unfinished-boat dsf check runs only from
Normal upward and counts a partial run of length `k` as a *finished* size-`k`
boat, so it reports a contradiction the board doesn't have and the solver
stops. Measured: 13–17 of 20 Easy boards stuck at the maximum cap while
solving fine at Easy.

- **The consequence is severe and silent**: `findMistakes` re-solves, gets
  stuck, returns `[]` — `canFindMistakes` stays true while Check & Save
  checks nothing and blesses a wrong board (the exact failure the
  [solvable-game contract](#the-solvable-game-contract) exists to prevent).
- **Fix at the call site, not in the solver.** A false *abort* only makes a
  solver weaker, never wrong, and a solver-gated generator re-verified every
  board with the same solver — so the boards that exist are all correct.
  Repairing the check would change every intermediate verdict, hence every
  desc, hence the byte-match oracle, to fix something generation never got
  wrong. Boats asks each cap in ascending order and takes the first that
  solves ([`boats/solver.ts`](../../src/games/boats/solver.ts)
  `solveAtAnyTier`); it declares `nonMonotone` on its contract, which **swaps**
  the monotonicity guard for the workaround guard rather than skipping the
  game — a skipped game is an untested game wearing a comment.
- **Tell:** generate boards at the *lowest* tier and solve them at the
  *highest*; if that ever fails you have this bug, and a port that only tests
  "solves at its own difficulty" will never see it. You no longer write that
  check by hand — declaring `Game.difficulty` runs it for every tiered game
  at once.

### Tiers that promise ambiguity

**A tier is not always a rung of the deduction ladder — it can be a
relaxation of what the puzzle promises.** Dominosa's fifth menu entry is
literally "Ambiguous", and its generator branches on it to skip the
uniqueness search entirely. The contract's `nonUniqueTiers` declares this,
and declaring it **swaps** the guard: the board must actually come out
non-unique, so if a change ever made Ambiguous generate unique boards the
tier would have stopped meaning what it says — worth failing over. (Found by
the contract's own guards, not anticipated.)

## Divergence and what it costs

**Byte-parity with upstream was a porting tool, and the owner released it on
2026-08-01**: *"it was only a temporary one for the porting, but now that
we've finished porting, I'm very happy to diverge in favour of a better play
experience, wherever it's worth it."* Matching the C is no longer a reason
not to improve a game, and "it would change every board" is a cost to weigh,
not an objection that ends the discussion. Display code was never in scope at
all (owner, 2026-07-04): rendering, layout, geometry, animation and colours
target neat visuals and clean code, and deliberate visual improvements are
the point of the fork. The full doctrine lives in
[`AGENTS.md`](../../AGENTS.md) § "TS port style" and the
[`ts-migration`](../../openspec/specs/ts-migration/spec.md) spec; the
followable form is this section.

Three rules govern every divergence decision:

- **"Wherever it's worth it" is the whole test.** A divergence still needs a
  stated player-visible benefit; tidiness is still not one.
- **Say what replaces the oracle.** The byte-match was the strongest
  assurance available; dropping it leaves a hole that is filled deliberately —
  normally "every generated board is uniquely solvable at exactly its stated
  difficulty" as a property test, stated in the change
  (`replace-seismic-region-generator` and the Mathrax Recursive divergence
  are the copies to follow).
- **Try to keep both.** You often need not choose — see § "Keep the oracle
  and ship the fix" below.

And four decision rules, learned on `add-loopy-ts-port`, for reading a quirk
before paying or refusing it:

1. **Divergence is free where C had no defined behaviour.** Upstream aborts
   on a degenerate Penrose patch (`dsf_new(0)`); retrying with a fresh desc
   diverges only on seeds where C crashed, so there is nothing to match —
   take it.
2. **Price the quirk before paying or refusing.** "Bug-compatibility" sounds
   expensive and usually isn't: one preserved quirk cost a single line plus a
   comment, another cost literally nothing (TS's `%` truncates exactly like
   C's). Don't narrate a sacrifice you aren't making.
3. **Diverge for a genuine player-visible defect, not for tidiness.** A
   solver that deduces *falsely* can generate a non-unique puzzle — fix it
   and record it. Since the 2026-08-01 release, a merely *weaker*-than-
   intended solver is also fair game **when the stronger one makes the game
   better to play** — the clearest case being a difficulty tier that does not
   mean what it says (see § "A tier means exactly its rung"). Strengthening a
   solver *because you can* remains tidiness.
4. **Diverge where the C shape doesn't fit a browser.** `gridTrimVigorously`'s
   C original used a dense `O(numDots²)` matrix — ~576 MB at 50×50. Structure
   is not behaviour: an exact replacement costs no fidelity at all, and the
   trap would have been transcribing it faithfully *because* it was the C's
   shape.

## Generators

### Every retry loop is bounded

**A "generate until it works" loop takes a
[`retryLimit`](../../src/engine/retry-limit.ts) guard.** Generators are
synchronous, so an unbounded loop that never succeeds owns its thread
outright — test timeouts can't fire and vitest workers orphan to init.
Exhaustion **throws** (`RetryLimitExceeded`) rather than returning a
fallback, so no seed that used to converge can quietly produce a different
board. Where the algorithm has a natural recovery path, prefer recovering
into it and let an outer `retryLimit` bound the recovery (Net's `shuffle`
reshuffles on a stalled tie rather than throwing). Read the module header —
it also explains why the bound is a guard call, not a `for…of` iterator.

### Unlucky, impossible, and load-bearing validation

**A `validateParams` that does real work is load-bearing — port it before
anything that depends on it.** Param validation is usually a few bound
checks, so it is tempting to leave for last — but Boats' last check *places
the entire fleet* with the RNG-free first-fit, and it is the only thing
standing between the player and an infinite loop: generation retries fleet
placement unboundedly, so an unfittable fleet (the default 3,2,1 fleet in
5×4 — measured) spins for ever. No retry budget is the right answer there;
the *feasibility check* is. **Tell:** a `validate_params` that allocates,
calls a generator helper, or builds a board.

**Measure a "rare failure" before you design the recovery for it.** A
generator failing on some inputs invites the reflex "retry, it's just an
unlucky seed" — check, because the two failure modes need opposite fixes:

- *Unlucky* ⇒ **retry**, bounded, driven by the same RNG stream so
  determinism and shared game IDs survive.
- *Impossible* ⇒ **reject in `validateParams`**, where the Custom dialog can
  show a reason — and reject the *precise thing you measured* (Loopy: a
  Penrose kite/dart **width-3** bound, because 200 draws per configuration
  showed width 3 never succeeds at any height while every neighbouring shape
  succeeds about half the time — an `amin` bump would also have forbidden
  the sizes that work).

Size the retry budget from the **worst measured success rate of a generable
configuration** (Loopy's was ~20%, so 100 attempts fail at ~2e-10), never
from a house default: a generous bound is right for a runaway guard but
turns an impossible configuration into a ten-second hang before its error.

**One game can be both failure modes, split by a parameter — measure the
boundary and apply both fixes.** Seismic's upstream region grower collapses
with board size (1/22 at 16 cells, 1/200,000 at 49, zero in 200,000 attempts
at 56+). A size cap alone would forbid shipped presets; retry-only leaves a
10×10 spinning for minutes. So it takes both: `MAX_CELLS` in
`validateParams` for the range that provably cannot generate, and a retry
budget sized from the measured worst *legitimate* case — which then also
frees the budget to be generous, since nothing hopeless reaches it. **Sweep
a grid of shapes, not a single dimension**: the ceiling tracked *cell
count*, which neither a `w` bound nor an `h` bound would have expressed.
Exemplar: [`seismic/state.ts`](../../src/games/seismic/state.ts)
(`MAX_CELLS`, measurement table in its doc comment).

### Bound a generator by its tail, not its median

**One seed per size is not a measurement.** Seismic's size bound was first
set from single-seed timings; nine seeds per size showed medians of ~5–6 s
hiding an 18.3 s worst case, and the preset was withdrawn. Note the trap
precisely: an exhaustive sweep of every accepted configuration had *zero
failures*, so every size was genuinely reachable. Reachability answers "does
this work?"; only the tail answers "should we offer this?", and a bound
exists to settle the second question. Whenever a bound is being set or
raised, repeat the sizes near it across several seeds first. Two corollaries:

- **Optimise first, then bound.** Slide's tail at its largest upstream preset
  measured 22.8 s before its visited-set hashing fix and 1.8 s after — a
  bound drawn from the first number would have forbidden a board upstream
  ships ([`slide/solver.ts`](../../src/games/slide/solver.ts)).
- **Check whether the wall is time or memory.** Slide's curve doesn't end in
  a slow generation: at 54 cells the BFS exhausts the heap. A retry budget
  assumes failure is recoverable; an OOM in the worker is a crash, so that
  boundary belongs in `validateParams`. Measure at least one size past where
  you draw the line, and note which way it fails.

### Solver-gated generation

**When a generator strips or accepts clues by re-running the solver, the
solver's verdict on every intermediate board decides which boards exist. The
verdict — including its quirks — is therefore part of the algorithm, and a
"fix" that strengthens or weakens the solver changes every board.** During
the C era this was byte-match discipline; post-C it is the *maintenance*
discipline for the same code: the 48 frozen differentials
([testing.md](./testing.md)) are the net that catches a refactor moving a
verdict. The lessons that stay live:

- **Preserved quirks are load-bearing; the code says so where it matters.**
  Filling's solver deliberately skips a square only its canonical cell can
  reach; Solo's killer-cage merger is verbatim-preserved *dead code* (its
  missing `npairs++` means no cages are ever merged — "fixing" it diverged
  the first board); Slant ports the release build's semantics, not the
  early-outs that only existed under a diagnostics `#ifdef`. Each carries a
  loud comment at the definition. Do not tidy these; the comment is the
  contract. Exemplars:
  [`filling/solver.ts`](../../src/games/filling/solver.ts),
  [`solo/generator.ts`](../../src/games/solo/generator.ts) `mergeSomeCages`,
  [`slant/solver.ts`](../../src/games/slant/solver.ts) `fillSquare`.
- **Tell — the truthiness trap:** grep a solver-gated generator for
  `if (solve(` / `if (!solve(` before trusting it. A solver that returns a
  multi-valued verdict makes bare truthiness a bug: Mathrax's verdict `2`
  means *ambiguous*, which is truthy, so its top tier stripped straight past
  uniqueness and shipped boards with several solutions — a genuine
  player-visible defect (`findMistakes` refuses a board with no unique
  answer, so Check & Save silently degraded across the tier). The fix was
  two comparisons, provably inert on the tiers whose verdict set excludes
  the ambiguous code ([`mathrax/generator.ts`](../../src/games/mathrax/generator.ts)).
- **Tell — the dirty scratch:** when a generator hands its solver a *reused*
  board, ask what state that board is in on entry — the answer is part of the
  algorithm. Spokes' acceptance gate re-solved on whatever the last
  candidate's solve left behind (often a finished board), so 31–45% of
  attempts were judged on garbage and "Hard" mostly wasn't
  ([`spokes/generator.ts`](../../src/games/spokes/generator.ts)).
- **Tell — the mutating validator:** any C-descended `validate`/`check` that
  both returns a verdict *and* writes a flag back into the board is a hazard
  the moment a later full-byte comparison reads that byte. Clusters'
  generator depends on a leaked error bit surviving into a whole-cell
  compare; the port keeps a *mutating* validate on the generator path and
  separate pure checks for play, so persisted state and the renderer stay
  clean ([`clusters/solver.ts`](../../src/games/clusters/solver.ts)).
- **Some deductions branch on the canonical-DSF-root *identity*.** The shared
  [`Dsf`](../../src/engine/dsf.ts) matches upstream `dsf.c`'s root choice for
  exactly this. A game that uses the dsf only for connectivity won't notice;
  one that reads `canonify(i)` as an *element* (an index into something)
  does. Tell: a loop bounded by a canonify result used as an index value
  rather than as an identity to compare.

### Keep the oracle and ship the fix

**When a deliberate divergence sits on an otherwise verdict-matched path,
don't choose between "keep the bug" and "lose the differential": put
upstream's exact behaviour behind an option that only the differential
sets.** Used twice, so treat it as the default technique:

- Spokes ships the corrected (cleared-scratch) acceptance gate; its
  `upstreamDirtyGate` option restores upstream's behaviour for the fixtures,
  and a behavioural test covers the four-line divergence itself.
- Seismic replaced its whole region generator (upstream's succeeded roughly
  once in 200,000 attempts at 7×7) yet keeps all 28 fixtures byte-matched
  behind `upstreamRegionGrower`
  ([`seismic/generator.ts`](../../src/games/seismic/generator.ts)).

Three rules that ride along: **comment the retained code at every definition
as deliberately-unreachable oracle** (or a later reader deletes the "dead"
branch and silently deletes the differential with it); **the retained path
may need its own constants** (Seismic's retry bound splits into shipped vs
upstream values — one shared bound would either strangle the oracle or make
a real divergence hang); and **pair the option with a test asserting the flag
still changes the outcome**, or the oracle decays into testing the shipped
path. The Spokes episode also set the doctrine boundary: *upstream being
clearly wrong is a reason to fix it* (owner), and re-measurement showed the
"cost" of fixing was negative — most of the dirty gate's rejections were
spurious, so generation got faster.

### Recover emergent parameters from the fixtures

**When you replace a generator, the thing you must not guess is the shape of
what it produced — and the frozen fixtures may already encode it.** Seismic's
region-size distribution is emergent in the C source (unreadable from the
code), but decoding the frozen descriptions and histogramming recovered it
(mean region 2.62, never above 6). That turns "invent a distribution" into
"match a measured one, and deviate deliberately". Whenever a rewrite has a
free parameter the old output implicitly fixed, check whether the fixtures
answer it.

### Reuse the solver's pruning, not just its propagation

**If a constructive generator built on a solver's propagation is backtracking
far more than ~1 node per cell, the missing piece is usually a global
feasibility test the solver already implements.** Seismic's fill used the
solver's placement propagator but not its "can every region still house
every number it owes?" check; adding it as the pruning rule cut one
configuration from 2,731 ms to 211 ms. Forward-checking alone finds out many
levels too late.

## Solve and the generator's aux

**A `solve()` that needs the generator's `aux` only works on a freshly
generated game.** The midend retains `aux` from `newDesc` and passes it to
`solve(orig, curr, aux)` — but only for a new game or a `#seed` id; a `:desc`
id or a loaded save has no aux, so Solve correctly reports "not known",
faithful to upstream. Most games re-derive the solution in `solve` and ignore
`aux`; reach for `aux` only when re-derivation is impractical (Untangle
stores the untangled layout). If you take `aux`, **test Solve through a real
`Midend`**, not just the game's `solve` directly — the threading lives in the
midend, so a direct unit test can pass while the shipped Solve is a no-op.

**Solve MUST complete the game — fix upstream's bookkeeping where the C
forgot it** (owner directive, 2026-07-21). The collection convention: the
solve move's `executeMove` arm runs the completion check (so the game reports
solved-with-help) *and* sets `cheated` (so the win flash doesn't fire on a
solver fill). Upstream Subsets did neither and stayed "ongoing" for ever
after Solve; that class of quirk is missing bookkeeping, not behaviour, and
is **not** preserved. Safe even on a verdict-matched game: the desc
differential exercises `newDesc`/solver/codec, never `executeMove`. Assert
both halves through a real `Midend` (status `"solved-with-help"`,
`flashLength` 0). Exemplar:
[`subsets/index.ts`](../../src/games/subsets/index.ts) (the solve arm, with
its divergence comment).

## findMistakes

### The solvable-game contract

**A game with a unique solution MUST ship `findMistakes` — Check & Save
depends on it.** The shell's Check & Save control
(`src/puzzle/quick-save-actions.ts`) hard-blocks a save only when
`canFindMistakes` is true, which is exactly `game.findMistakes !== undefined`.
A uniquely-solvable game without the hook silently degrades the control to a
plain Quick-save that **saves a wrong board without complaint** (shipped in
Unruly's first cut; caught on owner smoke-test). So for any game with a
unique solution, `findMistakes(state)` is part of "done": re-solve from the
fixed clues and return every player cell that contradicts the unique solution
(`[]` when the board isn't uniquely deducible — never guess). A permutation
puzzle with no notion of a wrong-but-legal state correctly omits the hook.
Exemplar: [`unruly/solver.ts`](../../src/games/unruly/solver.ts)
`findMistakes` + [`unruly/render.ts`](../../src/games/unruly/render.ts); the
overlay must be in the render diff key
([rendering.md](./rendering.md) § "Overlay sidecars"), and the refusal/banner
coupling is in [hints.md](./hints.md).

### Edge games flag set edges only

**Where the player draws walls, flag the player's edges that contradict the
solution — never "the cell looks invalid", and never a missing edge.** A
*missing* solution edge is merely incomplete; only an edge the player has
**set** that the solution forbids is a definite mistake. A 2×2 box drawn
around no number *looks* wrong, but if each wall is a real solution boundary
it is legitimate partial progress. Exemplars:
[`rect/index.ts`](../../src/games/rect/index.ts),
[`tracks/index.ts`](../../src/games/tracks/index.ts),
[`galaxies/index.ts`](../../src/games/galaxies/index.ts) (which also flags
the second way that game is played: an interior wall set inside a single
galaxy).

### Live rule errors and the re-solve are both

**When the game already draws live rule errors, ship both layers — they are
not alternatives.** Live checks (a broken row count, a collision) are a
strict subset of what the re-solve knows, and the gap is the dangerous one: a
locally-legal piece on a square the unique solution assigns otherwise breaks
no rule yet, and a live-only hook would let Check & Save bless it. Keep the
live errors (free, immediate) *and* base `findMistakes` on the re-solve —
and render them so both read (Boats recolours a wrong ship red and insets an
outline, which is what makes a wrong *water* square visible at all).
Exemplar: [`boats/render.ts`](../../src/games/boats/render.ts).

### Self-validating games run their rule checker

**Some games' violations are intrinsic to the current grid: there
`findMistakes` runs the same validity pass that decides won/ongoing and
returns the offending cells, rather than re-solving.** This is weaker than a
re-solve — a wrong-but-not-yet-rule-breaking cell won't be caught — but it is
the right choice when the game already displays those same marks live, so
Check & Save flags exactly what the board shows and both share one validity
function. Exemplars: [`bricks/solver.ts`](../../src/games/bricks/solver.ts)
`findMistakes` + [`bricks/render.ts`](../../src/games/bricks/render.ts),
[`subsets/index.ts`](../../src/games/subsets/index.ts). Contrast Galaxies,
whose mistakes are only meaningful against a re-solve.

## The Latin family

**Eleven games ride [`engine/latin.ts`](../../src/engine/latin.ts): the
generic `latin_solver` framework (candidate cube, positional/numeric and set
elimination, forcing chains, guess-and-verify recursion as the uniqueness
check) plus the RNG-faithful generator (`matching` / `latinGenerate` /
`latinGenerateRect`).** A Latin game's `solver.ts` is its own clue deductions
(`usersolvers`), a `valid` callback over completed grids, and a thin driver
mapping its difficulty levels onto the config. Towers was the first consumer;
Group is the proof of convergence — two `usersolvers` + a `valid` and zero
framework changes. Exemplars, each showing a different wrinkle:
[`towers/solver.ts`](../../src/games/towers/solver.ts) (clue heuristics),
[`unequal/solver.ts`](../../src/games/unequal/solver.ts) (two modes off
`ctx.mode`), [`keen/solver.ts`](../../src/games/keen/solver.ts) (per-cage
arithmetic in the transposed cube space),
[`group/solver.ts`](../../src/games/group/solver.ts),
[`salad/solver.ts`](../../src/games/salad/solver.ts).

Working rules, each earned:

- **The cube is indexed `(x·o + y)·o + (n−1)`.** Deductions reading a slice
  are usually cleanest as a line's cell list + `cubeGet(x,y,n)` — *but* when
  upstream's solver works in a transposed index space with dense flat reads
  (Keen), porting the flat reads verbatim with a comment is the lower-risk
  faithful choice; re-deriving them is error-prone and moves solver verdicts.
- **Tell — the transposed read in a generator:** Unequal's greedy clue
  assembly reads the candidate cube through a flat index that is a
  *transposition* of the cube's layout. It is deliberate; "fixing" it to the
  tidy accessor changes the greedy choice and hence the board
  ([`unequal/generator.ts`](../../src/games/unequal/generator.ts)). The same
  generator's second trap rides along: the numeric and inequality clue codes
  are shuffled in **two separate `shuffle` calls, in that order** — folding
  them into one tidy shuffle changes the draw sequence and the desc.
  Reproduce both.
- **A clue that constrains a cell without placing a digit needs the `seed`
  hook.** `latinSolver` seeds its cube from the working grid, which covers
  every given *digit* — but a constraint like Salad's ball/cross marks rules
  candidates out while placing nothing. `LatinSolverConfig.seed` is the gap
  upstream applies those in. It is deliberately **not** re-applied inside the
  recursion (faithful to the C) — sound only for a game that never recurses,
  so check your recursion setting before relying on it.
- **A pseudo-Latin game's solved grid is not a full square, and that is
  correct.** Salad treats symbols above `nums` as holes; *which*
  interchangeable hole symbol lands where is genuinely undetermined, so the
  cube never collapses on those cells. The acceptance test is upstream's
  hole-aware check, never "the grid is full" — expect a full-square assertion
  to fail with nothing wrong ([`salad/solver.ts`](../../src/games/salad/solver.ts)).
- **Three generator shapes in the family.** (1) Towers *derives* every clue
  from the full square, then removes. (2) Unequal (and Solo) greedily
  *assemble* clues onto a blank board, reading the solver's
  remaining-possibility counts — which is why `latinSolver` takes an optional
  `cubeOut` that receives the final candidate cube; omit it on the solve/hint
  path. (3) Keen *partitions* structurally (cages over a generated square),
  then solver-gates on exactly the target difficulty
  ([`keen/generator.ts`](../../src/games/keen/generator.ts)).
- **A cage/region game over the shared `Dsf` precomputes its minimal-element
  map** (`buildMinimal` in [`keen/state.ts`](../../src/games/keen/state.ts))
  rather than growing a min-tracking dsf variant: the minimal element is
  membership-determined, so a single ascending pass after all merges is exact
  regardless of which root union-by-size picks. But first check whether the
  algorithm needs a *minimum* at all — Rome's design assumed `dsf_minimal`
  changed what `canonify` returns (it does not; it is a separate array), and
  the correction cut both ways: the scan it planned to port was just a
  same-class test, while the root's *identity* turned out to be
  verdict-relevant elsewhere. When in doubt, reread
  [`engine/dsf.ts`](../../src/engine/dsf.ts)'s header.
- **History (C era):** a `usersolver`'s contradiction `return -1` sometimes
  sat inside `#ifdef STANDALONE_SOLVER`, so the shipped build silently
  skipped the impossible placement — the ports preserve the shipped
  behaviour, with comments at the sites (Group; `git log` the port change for
  the full account). The generalisation stays useful: what a solver *doesn't*
  do can be as load-bearing as what it does.

The shared hint-side machinery for this family (the recorder, reason
narration, populate/cleanup steps) is hints.md's subject — start at
[hints.md](./hints.md) § "Candidate-elimination games".
