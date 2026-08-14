# Design

## Context

The guess-free policy has one sanctioned exception — a tier explicitly named
`Unreasonable` — and one test for whether a technique needs it. The test was
sharpened twice, and the second sharpening has never been applied to the code
it was about:

- **Sticks** (`hints.md` § "The forcing boundary") established that *a
  contradiction that does not propagate is exempt*: place one value, ask the
  validator once, take the other answer on INVALID. One inferential step.
- **Galaxies** (`add-galaxies-hint`, 2026-08-11) established the far side:
  hypothesise, run the whole deduction fixpoint, take the survivor. That is
  guessing, it is not a technique a player can learn, and its hint rung was
  deleted rather than moved to a harder tier.

Between them sits the shape nobody has ruled on, and it is the one the Latin
family uses.

## Goals / Non-Goals

- Goals: classify every trial-based rung by the propagation test; correct the
  tiers whose names promise more than they deliver; leave the rule enforced by
  something other than prose.
- Non-Goals: strengthening any solver; changing which boards generate at tiers
  that are correctly named; a collection-wide rename sweep for tidiness. If a
  tier's name is honest, it does not move.

## Decisions

- **D1 — The criterion is the owner's, not a proxy for it.** *Guessing rather
  than checking*, where checking means the player can look at a particular
  potential placement and see the contradiction without thinking more steps
  ahead. Read each rung's code and answer that question about the *player's*
  work, not about how the solver is factored — the same trial-and-oracle
  shape appears on both sides of the line.
- **D2 — Chain-following is the open question, and it is decided by length,
  not by mechanism.** `latin.ts`'s `forcing` walks a BFS over two-candidate
  cells: no solver run, but a chain. A two-link chain is arguably one glance;
  a nine-link chain is plainly not. Measure the distribution of chain lengths
  actually used on shipped boards before ruling — this is the same
  measure-then-decide the Undead forcing narration used (measured 130 chars,
  kept) and the Spokes look-ahead did not.
- **D3 — Prefer moving the *rung* over renaming the *tier*, where both are
  open.** A rename is player-visible and costs everyone who knows the game;
  gating a tier's generation to what its name promises costs only the boards
  that were mis-graded. Where the rung is load-bearing for the tier to exist
  at all, the rename is the honest move.
- **D4 — A hint that would have to narrate a search does not get to narrate
  it.** Galaxies' precedent stands as collection policy: refuse, and say what
  the position is. Any rung this audit finds on the wrong side and cannot move
  should lose its hint narration, not gain a euphemism.

## Risks / Trade-offs

- **The audit may find nothing**, and that is a good outcome to be able to
  state — a paragraph recording that each rung was read and classified is
  worth more than the silence it replaces.
- **A rename churns muscle memory** for players who know a game's tiers by
  name; weigh per game, and note that game IDs are unaffected.
- **Chain-following may split** — legitimate for a short chain, not for a long
  one — in which case the fix is a bound on the rung, not a verdict on the
  tier.

## D9 — the definition that supersedes D5 and D8 (owner, 2026-08-12)

**The line is not "was a search involved?" — it is "can the reasoning be laid
out as a bounded run of individually glanceable steps?"**

D5 enforced the propagation test literally and D8 extended it to narration. Both
were too blunt, and the owner caught it on the right grounds: **Fifteen and
Sixteen are hinted by search too** — A\* over slide moves — and nobody objects,
because what the player is asked to accept is not the search but *"this move
serves the stated goal"*, which they can see. The collection already had two
hint contracts and D5/D8 collapsed them.

| | shape | tier | hint |
| --- | --- | --- | --- |
| **Check** | place, look, one rule breaks | Easy / Normal | narrate directly |
| **Tactic** | a **bounded** chain of forced consequences to a named endpoint — walkable leg by leg | Tricky / Hard / Extreme | narrate as a multi-leg `continuesPrevious` walk |
| **Search** | run the whole solver from a hypothesis, or branch and backtrack | **`Unreasonable`** | refuse |
| **Strategy** | no deduction at all: a stable subgoal + the next move serving it, justified by a monotone potential | untiered | narrate imperatively (`hints.md` § "Hold a stable subgoal") |

**Why this is the right line rather than a convenient one: it retro-predicts the
Galaxies decision.** `refuteAssoc` ran the entire deduction fixpoint from its
hypothesis and settled *dozens* of cells — unbounded, unwalkable, Search — and
deleting it was already owner-accepted before any of this. The same rule spares
Clusters, whose chain is a median of **2–3** forced cells and is already drawn on
the board. A definition that agrees with a call made independently, months
earlier, on a game not under discussion, is doing real work.

**Where the measured rungs land:**

- **Tactic** — the Latin family's `forcing` (median 4–5 links, max 12), Clusters'
  lookahead (median 2–3 forced cells), Map's forcing-chain BFS.
- **Search** — Undead's `forcingPass` (full arc+counting fixpoint), Bricks'
  `solverRecurse` (solves the rest of the board), Dominosa's `deduceForcingChain`
  (closure over all placements), Spokes' `spokesSolverAttempt` (full sub-solve),
  and every true recursion tier.

**Consequences, applied.** D5's rung moves are reverted for the Tactic rungs and
stand for the Search ones; D8's narration removal likewise. **The Tactic bar is
the walk** (owner, same day): one glanceable leg per step, the board carrying the
state. The six Latin games and Clusters are below it today and
`walk-tactic-hint-chains` is the change that fixes them —
`hint-quality.test.ts` carries their exact sentences in a shrink-only
`PENDING_WALK` list so the guard stays live on everything else they say.

## Decisions taken on the audit's evidence (2026-08-12)

Full sweep and measurements: [`audit.md`](./audit.md).

- **D2 resolved — chain-following is propagation, and the length split it
  proposed does not exist.** Across 517 firings in thirteen configurations, a
  `latin.ts`-shaped forcing chain is **never shorter than 3 implication links**,
  and the reason is structural rather than statistical: a one- or two-link chain
  *is* a naked pair, and set elimination — a cheaper rung — has already fired on
  it. What reaches the forcing rung is by construction only what the cheaper
  rungs could not. On top of the chain the conclusion needs a **case split** on
  the origin cell. There is no short-chain sub-case to exempt.
- **D5 (new) — the rule is enforced literally** (owner, 2026-08-12, taken with
  the cost table in view). Every propagating rung ends under a tier named
  `Unreasonable`. Which of the rule's three remedies applies is *determined*, not
  a per-game preference:
  - a tier named `Unreasonable` already above ⇒ **the rung moves up to it**
    (Towers, Keen, Group, Solo, Map, and Unequal/Mathrax once renamed);
  - the rung's tier is the game's **top** tier ⇒ **that tier is renamed**
    `Unreasonable` (Salad, Dominosa, Bricks, Undead, Clusters, Spokes);
  - **never delete a tier.** Gating to nothing is not one of the three remedies,
    and a tier that vanishes teaches the player nothing.
  This **overrides D3's preference for gating over renaming** where the rung's
  tier is the top one: D3 assumed a rename was the expensive option, and it is
  the *cheap* one when the alternative is a tier ceasing to exist.
- **D6 (new) — a moved rung needs a viability measurement before it ships.**
  The `unsolved w/o forcing` column is the share of the tier's boards that go
  away, and it ranges from 0% (Group 8x8, Mathrax 6x6) to **98%** (Solo 3x3
  Extreme). A move is not done when the config line changes; it is done when the
  old tier is shown to still generate in acceptable time.
- **D7 (new) — `Recursive` is renamed `Unreasonable`** in Unequal and Mathrax
  (owner, 2026-08-12). The encoded difficulty character is untouched (`r`), so
  game IDs, saved games and shared links survive; only the menu label moves.
  It is also a prerequisite for D5's first bullet in those two games — a rung
  cannot move up to a tier that is not called `Unreasonable`.

- **D8 (new) — two rules in the same spec disagree about Clusters, and the
  narration rule is the one that should bend.** The `ts-engine` delta says a hint
  SHALL NOT narrate a propagating trial *on any tier*, and SHALL refuse instead.
  `docs/games/hints.md` § "The forcing boundary" says the **compliant** answer to
  a shipped forcing tier is to *externalise it as a guided what-if walk* —
  tentative marks the player watches accumulate — and calls that the full answer
  rather than a stopgap. **Clusters does exactly that**, and is the only game in
  the collection that does: its hint marks every forced cell with the colour the
  hypothesis gives it and names which of three rules breaks, and where.

  Applying the refusal rule to it was tried and reverted: it broke 7 of its 52
  tests, because the chain *is* Clusters' hint, and an `Unreasonable` board needs
  the lookahead at least once by construction — so the hint would refuse
  somewhere on every board of its top tier. Deleting the collection's one correct
  treatment of a propagating rung, in the name of a rule written because the
  *other* treatments were bad, is the wrong outcome.

  The distinction that actually carries the rule's reason is **not whether the
  trial propagates but whether the player can see the propagation**. The Latin
  family said *"would force a contradiction further along"* — no classification,
  no anchor, chain invisible — which asks the player to run it in their head, and
  that is what § "The forcing boundary" forbids. Clusters asks them to read it.

  **Settled by the owner, 2026-08-12: consistency wins, and the rule does not
  bend.** A multi-step search with backtracking is non-deductive wherever it
  appears, so no hint narrates one — Clusters included, its rendering of the
  chain notwithstanding. Applied to Clusters, Undead, Bricks and Dominosa.

  **What implementing it turned up, which the argument above had missed.**
  Clusters' `hint` refuses unless the plan's verdict is `COMPLETE`, because that
  is what proves no already-placed tile is wrong — so removing the rung outright
  made it refuse from **move one**, not at the stall. The fix separates the two
  jobs the rung was doing: the walk still runs the lookahead to reach a verdict,
  while the recorder stops at the first stall. **A search may certify a
  position; it may never teach one.** That distinction is the durable part of
  D8, and it is not what either side of the original argument was about.

  Measured cost on the affected tiers: the hint covers **61–74%** of the blanks
  (median 67–80% per board), never solves one to completion, and refuses
  immediately on ~3%. `Easy` tiers are entirely unaffected.

  Two corrections to figures quoted while arguing this, both the same mistake:
  "loses its hint" was wrong (the deductive rung keeps working), and the "94–96%
  covered" that replaced it was also wrong — it measured the share of *full-plan
  steps* that were direct, not how far a plan truncated at the **first** stall
  actually gets. 61–74% is the honest number.

## D10 — Spokes: one function, two tiers, two rungs (task 2c.6)

The survey deferred Spokes because *"the trial is at **both** Tricky and Hard,
and two tiers cannot share a name"*. That premise is wrong, and reading the two
call sites rather than the function is what shows it. `spokesSolve` calls
`spokesSolverAttempt` **twice**, with different sub-tiers:

```
if (copy && diff === DIFF_TRICKY && spokesSolverAttempt(b, copy, s, DIFF_LIMITED)) continue;
if (diff < DIFF_HARD) break;
if (copy && spokesSolverAttempt(b, copy, s, DIFF_EASY)) continue;
```

`DIFF_LIMITED` is `DIFF_EASY - 1`, and the only thing it changes is that the
sub-solve stops at `ACTION_LIMIT`. So under D9 they are **a Tactic and a
Search**, and each takes its own remedy: Tricky keeps its name, the top tier is
renamed `Unreasonable`.

**Measured before deciding** (30 boards per configuration, §6): the two are
indistinguishable on a typical board — median 2 deductions each — and differ
entirely in the tail. The capped one reaches at most 9; the uncapped one has a
p90 of 11 and a **max of 35 hubs on a 36-hub grid**, i.e. it finishes the puzzle
from the hypothesis. That is Galaxies' `refuteAssoc` in another game's clothes.

**The transferable rule: classify a trial rung by the bound it guarantees, not
by the depth it typically reaches.** Had this been settled on the median it
would have called both rungs the same thing, and either name would have been
wrong for one of them. A hint can only promise what is guaranteed.

Consequences, all applied:

- `DIFF_NAMES` is `Easy · Tricky · Unreasonable`. The internal key `"hard"` and
  the difficulty character `h` are untouched (the D7 precedent), so game IDs,
  saved games and shared links survive.
- The hint's `nextSpokesFiring` loses its `diff >= DIFF_HARD` arm and
  `deduceSpokesPlan` defaults to `DIFF_TRICKY`. The *solver* keeps the rung, so
  the generator still grades on it and **no board moves** — the differential is
  untouched, as it was for Clusters/Undead/Bricks/Dominosa in 2d.3.
- **The guarantee had to be structural, because the guard cannot see this one.**
  Both rungs are the same function and emit the *same sentence*
  (*"Drawing this line would over-fill the ringed hub — so rule it out."*), which
  is the anchored, classified form the audit praised — so
  `hint-quality.test.ts`'s vocabulary check passes either way. This is exactly
  the blind spot that check's own doc comment names. `spokes-hint.test.ts` now
  asserts that planning at the top tier yields the *same plan* as planning at
  Tricky, with a control asserting Tricky does add firings Easy lacks, so the
  equality is a live fact rather than a vacuous one.

## D11 — Bricks: rename the rung's tier, and drop the name that has no boards (task 2c.3)

`solverRecurse` places a colour and then runs `solveGame(…, maxdiff - 1)` — the
whole solver — so it is a Search, and it ships at **Normal**. The survey deferred
this one because renaming Normal gives `Easy · Unreasonable · Tricky`, an
ordering no player can read.

The way out is that **Bricks does not have three tiers**; it has two, and a third
name left over. `Tricky` is the same rung one level deeper,
`grade-difficulty-tiers-honestly` measured that depth 2 never decides anything
depth 1 has not, and it has been *refused at generation* ever since. The
dropdown entry could only ever produce an error message.

**Owner decision, 2026-08-12, taken with that in view: `Easy · Unreasonable`.**

- `DIFF_NAMES` has two entries, and `difficulty.tiers` and the custom-params
  `choices` now **read it** instead of hand-copying it — the same defect 2a.3
  found in Unequal, in a game nobody had checked.
- `DIFFCOUNT`, `DIFF_CHARS` and `DIFF_TRICKY` are untouched, so `10x8dt` still
  decodes, still round-trips, and is still refused *with its reason* by
  `validateParams` (which is now the only place that knows the tier exists).
- **This does not weaken D5's "never delete a tier".** Nothing that ships boards
  is removed; what is removed is a *label* for a tier retired by an earlier
  change on a measurement. The distinction that matters is that a player loses
  no configuration they could previously play.
- The guarantee `difficulty-contract.test.ts` used to provide for that tier — it
  iterates the *declared* tiers — moves into `bricks.test.ts` as an explicit
  round-trip assertion. **A name dropped from a list silently drops the
  cross-game guard that iterated the list**, which is the thing to check whenever
  a declared set shrinks.
- `help/games/bricks.md` said *"Choose Easy or Normal"* — already a two-tier
  description — and now says what each tier means for the Hint button, which is
  the player-visible consequence of the rung being a search.

## D12 — the two remaining 2c items dissolve under D9, and saying so is the deliverable

- **Map (2c.7).** D9 classifies Map's forcing-chain BFS as a **Tactic**, so the
  rung does not move and Hard is not renamed. The whole of 2c.7 — *build a new
  deductive rung, re-grade, then move the chain* — was demanded by D5's literal
  reading and is withdrawn with it. What survives is a finding rather than a
  task: **a tier can BE its rung** (Map's solver has exactly three gates and the
  chain is the Hard one, so emptying it makes Hard identical to Normal and the
  preset generates 0 of 20). The coverage gap the same investigation found —
  Map's own suite generates `DIFF_NORMAL` boards only — needs no new test:
  `difficulty-contract.test.ts` generates every declared tier of every tiered
  game, and it is what caught this in the first place.
- **Group 12x12 Extreme (2c.8).** The 8.5 s / 63 s figure was caused by the rung
  move, and the rung move is reverted. What remains is the pre-existing
  4.2 s median / 15.6 s max at upstream's placement — marginal, custom-params
  only (Group's presets stop at 8x8 Hard and 12x12 Normal), and **not introduced
  by this change**. Owner decision, 2026-08-12: record it measured and move on.
  Recorded here so it is owned rather than forgotten, not deferred silently.

## Open Questions

- ~~Does `latin.ts`'s `forcing` count as checking?~~ Resolved by D2.
- ~~Does the hint-refusal rule admit an externalised what-if walk?~~ **No**
  (D8, owner, 2026-08-12). The rule holds as written.
- Should the guard be a declaration on the `Game` (a rung that trials must say
  so) or a per-game test? A declaration is checkable cross-game; a test is
  cheaper and does not widen the interface. **Leaning: neither is new** —
  promote `galaxies-hint.test.ts`'s speculative-vocabulary check into
  `src/engine/hint-quality.test.ts`, where every hinting game is already
  enrolled. It exists, it is cheap, and it currently guards one game out of
  thirty (audit §4).
