# ts-engine — deltas for assert-that-tiers-bind

## ADDED Requirements

### Requirement: A generated board SHALL need the tier its preset claims

A board dealt from a preset whose difficulty the game can read SHALL be solvable
by the game's capped solver at that tier and **not** at any lower one. A
cross-game guard SHALL assert it over a population derived from the registry,
with no enrollment list.

This is the property `ts-migration` named as the replacement for the byte-match
oracle when byte-parity was released — *every generated board is uniquely
solvable at exactly its stated difficulty* — and until this requirement nothing
asserted it. `difficulty-contract.test.ts` computed the lowest solving cap and
used it only as the floor of a monotonicity sweep, so a generator that quietly
downgraded a tier passed every guard in the collection. That is the defect shape
`AGENTS.md` § "Method" opens with: an assertion sitting beside the value that
would have proved the point, measuring a neighbor of it.

**The guard SHALL be keyed on the presets a player can pick**, reading each
preset's own tier through the difficulty contract — never on a tier written onto
some other preset. The distinction is not pedantic: applying a hard tier to the
collection's smallest preset asks a question no generator can answer (a 4×4 Solo
board cannot be Hard however its params are labeled), and a guard written that
way reported ten violations across four games where there were three across one.
`validateParams` accepting a params record is not evidence that a board can carry
the tier in it.

**Exceptions SHALL be derived from a declaration the game already makes**, never
from a roster. A tier listed in `nonUniqueTiers` promises the opposite of unique
solvability and is exempt automatically; a contract declaring `nonMonotone` has
no well-defined lowest cap and is exempt for the same reason it is exempt from
the monotonicity sweep. A game that genuinely cannot generate a declared tier at
a given size SHALL refuse it from `validateParams` with a reason — the shape
already required by "either generates every declared tier, or refuses it with a
reason" — rather than being added to an exemption list.

**The guard SHALL carry a vacuity count.** It iterates presets whose tier is
readable; a contract that stopped reporting one would make every assertion pass
over nothing. The count of asserted preset cases SHALL be asserted above a floor.

**Cost SHALL be tiered rather than paid per commit.** The full matrix over every
preset of every tiered game is expensive; the per-commit slice samples seeds
through the shared budget helper and the full matrix runs in the opt-in slow
tier, with the doc comment stating what the gate slice still covers.

#### Scenario: A generator downgrades a tier

- **WHEN** a game's generator accepts a board its lower cap already solves, for a
  preset the menu labels with the higher tier
- **THEN** the cross-game guard fails, naming the game, the preset and the caps
  it found

#### Scenario: A tier is unreachable at a size

- **WHEN** a declared tier cannot be generated at some preset's size
- **THEN** the game refuses those params from `validateParams` with a reason,
  and the guard asserts nothing about a board that was never dealt

#### Scenario: A new game joins

- **WHEN** a game is registered that offers a difficulty choice
- **THEN** it is asserted by this guard from its first commit, with no line added
  anywhere to enroll it

### Requirement: The generator accept loop's correctness case SHALL be argued from measurement

A proposal to move a game's generate-and-strip loop into shared machinery SHALL
argue **economy**, and SHALL NOT argue that it is needed to make guess-free or
on-tier generation reliable.

Measured 2026-09-08 by `assert-that-tiers-bind`: across 285 preset cases in every
tiered game, **282 boards needed exactly the tier their preset claimed**, with
all three exceptions in one game and contradicting that game's own spec. The 39
hand-written generators comply; what was missing was a guard, not a driver.

`docs/framework-rdd/deduction.md` argues the opposite — that a framework-owned
strip/accept loop would make guess-free generation *"not a policy to comply with
but the only thing the driver can do"*. That argument is fiction and this
requirement records why it is also unnecessary: the compliance it promises
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
