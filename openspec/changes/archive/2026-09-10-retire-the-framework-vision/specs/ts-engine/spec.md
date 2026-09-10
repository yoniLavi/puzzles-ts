## MODIFIED Requirements

### Requirement: The difficulty tier list is not a projection of the technique ladder

A game's tier list SHALL NOT be derived from its declared deduction techniques,
and a change proposing to do so SHALL be answered with this requirement rather
than by re-surveying the games. The framework vision (`docs/framework-rdd/`,
retired by `retire-the-framework-vision`) proposed the projection — *"if your
techniques carry tiers … there is no hand-written `DifficultyContract`; it is a
projection of the technique ladder"* — and `declare-deduction-techniques` appeared
to supply the lever by giving every technique a declared `tier`. It does not, for
three independent reasons, each sufficient on its own.

**A ladder declares tier *indices*; a tier list is *names*.**
`DeductionTechnique.tier` is a `number`. "Easy" and "Unreasonable" are strings a
player reads in the Custom dialog, and no projection invents them from integers.

**The projection runs the wrong way.** `runDeductionFixpoint` *receives*
`maxTier`, derived from a tier index — it is downstream of the tier list, not
upstream of it. Every ladder in the collection is an array literal built inside a
solve, closing over board state, so there is nothing to interrogate at module
load, which is when `paramConfig` and the params codec need the list.
`engine/latin.ts` makes this concrete: it synthesizes its rungs as `0..maxdiff`,
so asking that ladder for its tiers returns the cap it was handed.

**A tier is not always a rung.** Towers, Keen, Group, Unequal and Mathrax put
their top tier on `latinSolverRecurse`, outside the fixpoint entirely — and the
latin ladder still synthesizes a rung for it that can never fire, because no
built-in technique maps to that level and the game's `usersolvers` slot is
`null`. Dominosa's "Ambiguous" is a relaxation of what the puzzle promises rather
than a technique. Undead's only ladder on the shared runner is its *hint
recorder*, whose two techniques both sit on tier 0 while the game offers three
tiers. A ladder-derived list is short for every one of them.

The scope this was measured over SHALL be recorded rather than re-estimated:
14 games run a solver on the shared fixpoint runner (Group, Keen, Mathrax, Salad,
Towers and Unequal through `engine/latin.ts`; Clusters, Filling, Magnets,
Pattern, Singles, Spokes, Undead and Unruly directly), 29 declare a difficulty
contract, and the overlap is 12 — Filling and Pattern are untiered. Boats and
Loopy name `runDeductionFixpoint` only in doc comments explaining why they do not
use it, so a name-keyed scan over-counts them.

#### Scenario: A change proposes deriving tiers from techniques

- **WHEN** a change proposes projecting the difficulty contract from the
  technique ladder
- **THEN** it is refused with the three reasons above, which do not depend on
  which games are currently on the shared runner
- **AND** the reasons are re-derived only if `DeductionTechnique` starts carrying
  a tier *name*, the ladder becomes declarable without a board, and every tier a
  game offers becomes a rung — all three, since any one of them left standing
  defeats the projection on its own

### Requirement: The generator accept loop's correctness case SHALL be argued from measurement

A proposal to move a game's generate-and-strip loop into shared machinery SHALL
argue **economy**, and SHALL NOT argue that it is needed to make guess-free or
on-tier generation reliable.

Measured 2026-09-08 by `assert-that-tiers-bind`: across 285 preset cases in every
tiered game, **282 boards needed exactly the tier their preset claimed**, with
all three exceptions in one game and contradicting that game's own spec. The 39
hand-written generators comply; what was missing was a guard, not a driver.

The framework vision (`docs/framework-rdd/`, retired by
`retire-the-framework-vision`) argued the opposite — that a framework-owned
strip/accept loop would make guess-free generation *"not a policy to comply with
but the only thing the driver can do"*. That argument was fiction, and this
requirement records why it is also unnecessary: the compliance it promised
already exists, and the 39 migrations it would cost buy a property one derived
sweep now asserts.

The figure carries its date and its change id because it is a measurement, not a
claim (`AGENTS.md` § "A count written in prose is a census nobody re-runs"); a
later proposal SHALL re-run the sweep rather than quote it.

#### Scenario: A proposal argues the framework should own the accept loop

- **WHEN** a change proposes moving generate-and-strip loops into shared
  machinery
- **THEN** it argues from the per-game surface removed, and does not claim the
  move is needed for guess-free or on-tier generation
- **AND** it re-runs the on-tier sweep rather than quoting the recorded figure

#### Scenario: A generator regresses after the loop is shared

- **WHEN** a game adopts shared generation machinery
- **THEN** the on-tier guard still asserts its boards need the tier their preset
  claims, because that property is asserted of the boards and not of the loop
  that produced them
