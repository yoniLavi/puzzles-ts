# The sweep: every rung in the collection that reaches a conclusion via a trial

> ⚠️ **The verdicts in §4 are superseded.** This file's *sweep* and its
> *measurements* stand — they are what the change was for, and everything below
> §3 was gathered before any decision. But §0's test ("does the rejected trial
> propagate?") and §4's remedy ("enforce it literally") were replaced the same
> day by **design D9's Check / Tactic / Search taxonomy**, which splits on
> whether the reasoning is a *bounded run of individually glanceable steps*.
> Read [`design.md`](./design.md) D9 first; it lists where each rung below
> actually lands.
>
> Kept unedited rather than rewritten because the sequence is the finding: the
> propagation test condemned thirteen rungs in thirteen games, six of them in
> default preset menus, and about half of those are perfectly followable chains.

The artefact of task 1, kept the way `audit-author-known-issues` kept its table —
**the classification is the deliverable even where nothing needs fixing**, and a
no-change verdict without its argument is re-opened by the next reader.

## 0. The test being applied

The owner's line (2026-08-11), as carried by
`docs/games/solver-and-generator.md` § "Guess-free generation" and
`docs/games/hints.md` § "The forcing boundary":

> If it requires **guessing** rather than **checking**, it is Unreasonable. The
> test is whether the rejected trial has to **propagate** before the
> contradiction appears.

- **Checking** — put a value in and *look*. One clue, one count, one neighbour
  breaks immediately. Plain deduction; belongs at any tier.
- **Guessing** — put a value in and *run the deduction from it*, then take the
  contradiction it eventually reaches.

The two are **indistinguishable in a solver** (`try one value, ask the oracle,
take the other on INVALID`) and land on opposite sides of the line, which is why
this sweep reads each call rather than each technique's name.

## 1. The three shapes, and which side each lands on

| Shape | What the code does | Verdict |
| --- | --- | --- |
| **A — immediate check** | place one value, call the validator **once**, roll back | **checking**; exempt at any tier |
| **B — chain-following** | BFS/closure over forced consequences, *without* running the solver, until a contradiction or a convergence | the open question (design D2) — **settled below: propagation** |
| **C — solve-from-hypothesis** | place a value, run a deduction **fixpoint** from it, take what breaks | **guessing**; Unreasonable-only (the Galaxies precedent) |

## 2. The sweep

Every `src/games/*/solver.ts` was grepped for the trial vocabulary
(`lookahead|hypothes|tentativ|refut|recurse|trial|guess|contradiction`) and each
hit read. **The proposal's list was incomplete**: it named Spokes, Bricks,
Boats, Sticks and Undead; the sweep adds **Map, Dominosa, Clusters, Seismic,
Solo and Mathrax**, and clears Lightup, Pattern, Range, Subsets, Ascent, Pearl,
Bridges and Rome.

### 2a. Shape A — immediate check (exempt, no change)

| Game | Rung | Tier it ships under | Why exempt |
| --- | --- | --- | --- |
| Sticks | `sticksTry` | the single implicit tier | one orientation, **one** `sticksValidate`, no fixpoint. The exemplar the rule was written from. |
| Bricks | `solverTry` | Easy | one colour, **one** `bricksValidate`. |
| Boats | `attemptShipRows` / `attemptWaterRows` / `centersAttempt` | Hard | places the square, completes the line's *forced* remainder (the line needs exactly one more water, so the rest are ships — not a hypothesis), then **one** `validateState`. |
| Seismic | `solverAttempt` | Hard | one candidate, then one region-starvation scan over the dsf. No fixpoint; rolled back before the verdict. |

Boats and Seismic are the boundary cases and both stay on the exempt side: the
single step between placement and oracle is a *forced* completion, not a
propagated chain — the player sees the line fill itself.

### 2b. Shape B — chain-following

| Game | Rung | Tier it ships under | Tier above it |
| --- | --- | --- | --- |
| Towers | `latin.ts` `forcing()` | **Extreme** (a preset: 6x6 Extreme) | Unreasonable |
| Keen | `latin.ts` `forcing()` | **Extreme** (a preset: 6x6 Extreme) | Unreasonable |
| Unequal | `latin.ts` `forcing()` | **Extreme** (a preset: 5x5 Extreme) | **Recursive** |
| Group | `latin.ts` `forcing()` | **Extreme** (custom params only) | Unreasonable |
| Salad | `latin.ts` `forcing()` | **Extreme** (custom params only) | — (`diffRecursive` is `DIFF_IMPOSSIBLE`; Salad never recurses) |
| Mathrax | `latin.ts` `forcing()` | **Tricky** (presets: 5x5 and 6x6 Tricky) | **Recursive** |
| Solo | its own `forcing()` | **Extreme** (a preset: 3x3 Extreme) | Unreasonable |
| Map | the HARD forcing-chain BFS | **Hard** (a preset: 20x15 Hard) | Unreasonable |
| Dominosa | `deduceForcingChain` | **Extreme** (a preset: order 6 Extreme) | — |

### 2c. Shape C — solve-from-hypothesis

| Game | Rung | What it runs from the hypothesis | Tier it ships under | Tier above it |
| --- | --- | --- | --- | --- |
| Spokes | `spokesSolverAttempt` | `spokesSolve(copy, s, diff)` — the **whole solver** at the tier below | **Tricky** *and* **Hard** (both presets) | — |
| Bricks | `solverRecurse` | `solveGame(grid, …, maxdiff − 1)` — the **whole solver** | **Normal** *and* **Tricky** (Normal is a preset) | — |
| Undead | `forcingPass` | `arcCountFixpoint(common, trial)` — the arc-consistency + counting **fixpoint** | **Tricky** (a preset) | — |
| Clusters | `chainToContradiction` | forced single-cell consequences to a contradiction | **Tricky** (a preset) | — |

### 2d. Cleared

| Game | What the grep hit | Why it is not a trial rung |
| --- | --- | --- |
| Lightup | `F_SOLVE_ALLOWRECURSE` | enabled **only** at `difficulty >= 2`, and tier 2 is named `unreasonable`. The positive control: this is exactly what the policy prescribes. |
| Pattern | `doRecurse` | the per-line exhaustive enumeration, already ruled deduction by the narratable-deduction doctrine. Not a board-wide hypothesis. |
| Range | "deduction + DPLL guessing" | the DPLL is the *uniqueness oracle*; a board is kept only if solvable without it. |
| Subsets | a comment naming Clusters' shape | no trial rung of its own. |
| Boats | `solveAtAnyTier`'s `solveBoats` call | a cap-escalation loop over the same board, not a hypothesis. |
| Ascent, Pearl, Bridges, Rome, Mines, Magnets, Mosaic, ABCD, Unruly, Signpost | prose asserting guess-freedom | no trial rung. |

## 3. D2 settled by measurement: chain-following propagates, and the short chain does not exist

`scripts/checks/forcing-chain-measure.test.ts` (a scaffold; see §5) instruments
`latin.ts`'s and Solo's `forcing()` to record the **implication-link count** of
every firing, generates boards at the tier the rung ships under, and solves each
one there. Design D2 expected to decide by length — *"a two-link chain is
arguably one glance; a nine-link chain is plainly not"*.

**The two-link chain does not occur. The minimum is 3, in all thirteen
configurations measured.** The reason is structural, not statistical: a one- or
two-link forcing chain is a naked pair, and set elimination — a *cheaper* rung —
has already fired on it. What survives to the forcing rung is, by construction,
only what the cheaper rungs could not reach. The length split D2 hoped to make
is therefore not available.

And the chain is only half of what the player carries: the conclusion needs
**both branches** — *if the origin cell is not `n`, this chain forces `n` over
there, so the target cannot be `n`; and if the origin cell **is** `n`, the target
cannot be `n` either because they share a line.* A case split on top of a
three-to-ten-link chain.

**Verdict: shape B is propagation.** By the owner's test it is guessing, and
none of the nine tiers in §2b is named `Unreasonable`.

### The measurements (60 boards per configuration)

`fires` and `unsolved w/o` are the same 60 boards counted two ways; they agree
in every row (see the cross-check below). Chain length is **implication links**.

| Configuration | fires forcing | unsolved w/o forcing | min | median | p90 | max |
| --- | --- | --- | --- | --- | --- | --- |
| towers 5x5 Extreme | 48 (80%) | **48 (80%)** | 3 | 4 | 6 | 10 |
| towers 6x6 Extreme *(preset)* | 38 (63%) | **38 (63%)** | 3 | 5 | 7 | 9 |
| keen 6x6 Extreme *(preset)* | 1 (2%) | **1 (2%)** | 3 | 6 | 6 | 6 |
| keen 4x4 Extreme | 27 (45%) | **27 (45%)** | 3 | 4 | 6 | 6 |
| unequal 5x5 Extreme, unequal *(preset)* | 50 (83%) | **50 (83%)** | 3 | 4 | 6 | 9 |
| unequal 5x5 Extreme, adjacent | 2 (3%) | **2 (3%)** | 4 | 4 | 4 | 4 |
| group 8x8 Extreme, id shown | 0 (0%) | **0 (0%)** | — | — | — | — |
| group 8x8 Extreme, id hidden | 0 (0%) | **0 (0%)** | — | — | — | — |
| group 12x12 Extreme, id shown | 25 (42%) | **25 (42%)** | 3 | 4 | 7 | 10 |
| salad 6x6 Extreme, letters | 1 (2%) | **1 (2%)** | 5 | 5 | 5 | 5 |
| salad 6x6 Extreme, numbers | 20 (33%) | **20 (33%)** | 3 | 5 | 6 | 8 |
| solo 3x3 Extreme *(preset)* | 59 (98%) | **59 (98%)** | 3 | 5 | 8 | 12 |
| mathrax 6x6 Tricky *(preset)* | 0 (0%) | **0 (0%)** | — | — | — | — |

**The minimum is 3 in every row that has one.** Not once, across 517 firings,
did the rung produce a chain a player could take in at a glance.

### The cross-check, and the instrument error it caught

"Fired" is not "was needed", so every row was re-solved with the forcing rung
switched off and every other rung — set₁ included — still at the tier. **The two
columns agree exactly in all thirteen configurations**, which is the empirical
form of the monotonicity argument (these rungs only ever *eliminate*, so the
no-forcing fixpoint is unique and order-independent: if forcing fires once, the
board cannot be finished without it).

The first run of this probe reported **371** firings per 20 Towers boards; the
corrected one reports **88 per 60**. The probe had reset its counter before
calling a function that both *generated* and solved — and these generators are
solver-gated, re-solving the board after every clue removal, so the count was a
union of "deductions a player meets" and "the generator's hundreds of trial
solves". The same split is what makes the necessity column meaningful at all:
running *generation* under the off-flag would have produced a **different
board**, and the two columns would no longer be about the same puzzles.

## 4. What each game's numbers mean for the fix

Design D3 prefers **gating the tier's generation** over **renaming the tier**,
because a rename costs everyone who knows the game and a gate costs only the
mis-graded boards. What a gate costs is measurable, and it is the
`UNSOLVED w/o forcing` column: that is the fraction of the tier's boards that
would have to be regenerated.

**The owner's decision (2026-08-12), taken with these numbers in front of it:
enforce the rule literally.** Every propagating rung ends up under a tier named
`Unreasonable`. The rule offers three routes and the choice between them is
determined, not free:

- **Where a tier named `Unreasonable` already sits above the rung's tier, the
  rung moves up to it.** The lower tier keeps everything cheaper and is
  re-graded by what is left. Towers, Keen, Group, Solo, Map, and — once
  renamed — Unequal and Mathrax.
- **Where the rung's tier is the game's top tier, that tier is renamed
  `Unreasonable`.** Nothing is deleted: the rule asks that the tier which can
  require guessing *be called* `Unreasonable`, and a top tier with nothing above
  it is exactly that tier. Salad, Dominosa, Bricks, Undead, Clusters, Spokes.
- **Gating to nothing is never the answer.** Deleting a tier is not one of the
  rule's three remedies, and a tier that vanishes teaches the player nothing
  about why.

Two second-order consequences the numbers make concrete:

1. **A moved rung may leave its old tier ungenerable, and that has to be
   measured per game before it ships.** The `unsolved w/o forcing` column is the
   share of the tier's boards that go away. Solo 3x3 Extreme is **98%** — one
   board in sixty survives — so Solo's Extreme is on the edge of not existing,
   and a viability measurement gates that game's move. Towers 6x6 (63%) and
   Unequal 5x5 (83%) are expensive but not fatal. Keen 6x6 (2%), Group 8x8 (0%)
   and Mathrax 6x6 (0%) cost essentially nothing — **Keen's Extreme and
   Mathrax's Tricky are already set-elimination tiers that merely have the
   forcing rung switched on.**
2. **The hint must lose the narration, not reword it** (design D4, the Galaxies
   precedent, and the spec's "a search is not a technique … on any tier"). Once
   forcing is `Unreasonable`-only, a hint that reaches it refuses and says
   deduction has run out. The six Latin games' shared sentence — *"Following a
   chain of two-candidate cells, placing 5 here would force a contradiction
   further along"* — is deleted rather than improved.

## 4a. What the viability measurement found (design D6), and why it was not optional

Six of the seven rung moves landed and the whole suite was green **before** any
of this was known. The generation timings are the only thing that surfaced it —
20 boards per configuration, wall clock, with `upstreamForcingTier` supplying the
*before* column (same code, upstream's rung placement, so the difference is
attributable to the move and nothing else).

| Configuration | before | after | verdict |
| --- | --- | --- | --- |
| mathrax 5x5 / 6x6 Tricky *(presets)* | — | 2 / 7 ms median | fine |
| keen 6x6 Extreme *(preset)* | — | 16 ms median, 117 ms max | fine |
| towers 6x6 Extreme *(preset)* | 26 ms median, 70 ms max | 52 ms / 224 ms | fine |
| unequal 5x5 Extreme *(preset)* | — | 13 ms median, 35 ms max | fine |
| group 8x8 Extreme | — | 141 ms median, 299 ms max | fine |
| **solo 3x3 Extreme** *(preset)* | 24 ms median, 85 ms max | **670 ms / 1.5 s** | 28× slower; acceptable, and worth a note |
| **group 12x12 Extreme** | 4.2 s median, 15.6 s max | **8.5 s / 63 s** | **not shippable** |
| **map 20x15 Hard** *(preset)* | 17 ms median | **0 of 20 generate** | **the tier ceases to exist** |
| towers 6x6 / keen 6x6 Hard *(controls)* | — | 5 / 3 ms median | unmoved, as they must be |

### Map: the rung *is* the tier, so this remedy is not available to it

Map's solver has exactly three gates — `< DIFF_EASY`, `< DIFF_NORMAL`, and the
forcing chain at `< DIFF_HARD`. Empty the third and **Hard's technique set is
identical to Normal's**, so the generator's own "must not be solvable one tier
below" check can never pass: it retries 10,000 times and gives up. Map's Hard is
a *preset*.

That is the case D5's third bullet forbids — the tier would be deleted, not
renamed — so the move is **reverted**, and Map takes the remedy
`solver-and-generator.md` § "Strengthening a solver instead of shipping
guesswork" prescribes: build the missing deductive rung, then re-grade. Its own
change (task 2c.7).

**The guard that caught it already existed, and the run that missed it was
mine.** `difficulty-contract.test.ts`'s "either generates every declared tier, or
refuses it with a reason" fires on Map immediately — it was verified to, by
re-applying the change and watching it fail. What hid it was running only
`src/games/map`; the cross-game guard lives in `src/engine/`. Map's own suite
generates **`DIFF_NORMAL` boards only** (`DIFF_HARD` appears in one params-codec
assertion), so a per-game run could never have seen it. *A per-game test run is
not a substitute for the guard that was written to be cross-game.*

### Towers 4x4 Extreme: the same shape, one size down, also caught by the guard

The same cross-game guard then failed Towers — not at a preset, but at the
custom size `4x4 Extreme`, which my viability probe had not thought to sample
(it measured 5x5 and 6x6, both fine). On a 4x4 grid set₁ never decides anything
set₀ has not, so with forcing gone Extreme is unreachable there: 1,000
consecutive attempts fail.

Fixed the way `grade-difficulty-tiers-honestly` and Mathrax's size-3 refusal
already do it — `validateParams` **refuses with a reason**, gated on `full` so a
saved game or a desc-carrying game ID still loads. Not by extending the
generator's silent `w <= 3` dial-down: handing back a different difficulty from
the one the player picked is the defect that convention exists to stop.

### Group 12x12 Extreme: a pre-existing problem this change makes worse

4.2 s median / 15.6 s max **before**; 8.5 s / 63 s after. A minute-long "New
Game" is not shippable, and the baseline was already marginal. It is
custom-params-only (Group's presets stop at 8x8 Hard and 12x12 Normal), which
bounds who meets it but does not excuse it. Owned, not deferred silently: it is
task 2c.8, and the options are a bound on the size, a cheaper Extreme rung, or
accepting the cost with a measured note.

### Where each game's hint stands today, for the record

Not a remedy under the chosen route, but the reason the Latin family is the
worst offender is worth keeping: `hints.md` documents a pragmatic stopgap for a
shipped forcing tier — *state the hypothesis and the **classified, named**
contradiction, and **anchor it to the board*** — and six games are below it.

| Game | classified? | anchored? | chain shown? |
| --- | --- | --- | --- |
| Clusters | ✓ names which of three rules | ✓ "the ringed dot" | ✓ every forced cell marked with the colour the hypothesis forces |
| Spokes | ✓ over-fill / crossing / strand | ✓ "the ringed hub" | ✗ |
| Dominosa | ✓ "eventually repeats a domino" | ✗ | ✗ |
| Undead | ✓ names the clue families | ✗ | ✗ |
| Bricks | ✗ "a contradiction" | ✓ "(ringed)" | ✗ |
| **Towers, Keen, Unequal, Group, Salad, Solo** | **✗** | **✗** | **✗** |

Map, Mathrax and Seismic ship no `hint()` at all, so their trial rungs are a
generation-policy matter only.

### The guard that only one game was held to

`galaxies-hint.test.ts` enforces the rule with a **vocabulary shape check** —
a step's explanation may not contain `try`/`tried`/`suppose`/`if it were`/`break
the board`. It is cheap, blunt and effective, and it is applied to exactly one
game. Run cross-game today it would fail Bricks (*"Suppose this cell were
shaded"*), Clusters (*"Suppose this cell were red"*), Undead (*"If this cell
were a vampire"*) and the whole Latin family. That is this repository's recurring
shape — **a rule enforced in one place is not enforced** — and promoting the
check into `src/engine/hint-quality.test.ts`, where every hinting game is
enrolled, is what makes the policy self-guarding once the rungs have moved.

## 5. The scaffold

`scripts/checks/forcing-chain-measure.test.ts` plus the `LATIN_FORCING_CHAINS` /
`LATIN_FORCING_OFF` hooks in `src/engine/latin.ts` and
`src/games/solo/solver.ts` are a **measurement scaffold**, and this section is
here so the numbers above can be re-derived rather than trusted. They are
reverted before the change lands; recover them from this change's history with
`git log -S LATIN_FORCING_CHAINS`.
