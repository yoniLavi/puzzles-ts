# ts-engine — delta for `fix-sixteen-deep-local-minima`

## ADDED Requirements

### Requirement: A hint that plans by searching SHALL refuse honestly past its reach

A `hint()` that plans by **searching ahead a bounded number of moves**, rather
than by deducing, SHALL refuse with the collection's single constant for a
search out of reach, and SHALL NOT use the refusal that says no move would get
the player closer.

The two say different things, and only one of them is checkable. "No move here
would get you closer" is a claim about the **board**; a game may make it only
where it has established it, which is why its remaining callers are
constructions that cannot return empty on an unsolved board. A bounded search
returning empty has established nothing about the board, only about itself.
Sixteen said the first sentence on tangled endgames a dozen moves from home
where most moves *did* get the player closer, on positions they had reached by
following thirty-odd of that same hint's suggestions.

The wording SHALL name what still works from such a position rather than only
reporting the failure, and SHALL NOT name a control that will fail for the same
reason the hint just did — continuous hinting refuses wherever a single hint
refuses, so pointing at it is advice that cannot work.

**The collection's strongest hint guarantee — that a hint never gives up on a
solvable board — SHALL be relaxed for exactly this population and no other.** A
deductive game can meet it: its deduction is complete for the tier, or the
tier's own name promises that search may be needed. A searching game has a
*reach* instead, and past it no budget makes an honest answer available — each
further ply of Sixteen's search costs about 40×. Such a game passes the walk on
the seeds it is given and MAY go red truthfully on a new one, which is the guard
reporting the truth rather than a regression.

**The relaxation SHALL be derived from what the game is**, by reading which
games call the shared planner out of their own comment-stripped source, never
from a declaration a game makes for the guard's benefit. Where the derivation
cannot see *why* a member has a reach, that reason SHALL be recorded per member
and the derivation SHALL assert the ledger is exactly right — so an empty
derivation, which would silently restore the unattainable promise with every
assertion still passing, fails instead.

#### Scenario: A searching hint runs out of reach

- **WHEN** a game whose hint plans by searching finds no plan on a sound,
  unsolved board
- **THEN** the refusal is the collection's constant for a search out of reach,
  and the walk accepts it as an honest end

#### Scenario: A searching hint uses the board-claiming refusal instead

- **WHEN** such a game refuses with the message that no move would get the player
  closer
- **THEN** the walk fails, because that sentence asserts something the search
  never checked

#### Scenario: A deductive game borrows the search refusal

- **WHEN** a game that does not call the shared planner refuses with the
  search-out-of-reach message
- **THEN** the walk fails, because the relaxation is derived from the mechanic
  and that game does not have it

#### Scenario: The derivation finds nobody

- **WHEN** the source scan that derives the searching games matches nothing
- **THEN** the ledger equality fails, rather than every walk silently passing
  under the old promise

### Requirement: A plan steered by a measure SHALL be steered by one measure

Where a `hint()` plans by searching under a heuristic measure of the board,
exactly **one** such measure SHALL be in play on every board. A game SHALL NOT
apply a second, sharper measure only where the first is helpless.

This is the recompute-stability rule one level down. A plan is recomputed after
every move the player makes, so a *measure* that changes between recomputes
ping-pongs exactly as two plans do: the sharper measure walks the board out of a
position, the blunt one measures the result and walks it back, and neither is
wrong by its own lights. Measured on Sixteen — as a last-resort second pass the
named board ran 400 recomputed hints without solving; as the only measure it
solved in sixteen.

**Sharpening a measure SHALL be checked against every gate that reads it.** A
search gated on "the fallback found nothing better than standing still" is gated
on a statement *about the measure*, so a sharper measure silently changes which
boards reach it. Sixteen's deep search stopped firing on the very endgames it
was built for, turning a complete nine-move plan into a five-move partial one,
in a change whose whole intent was to refuse less. A sharpened measure SHALL
therefore differ from the blunt one only where the searches above it cannot help
anyway, so that every board they own is measured exactly as before.

#### Scenario: A sharper measure is armed only where the blunt one is stuck

- **WHEN** a game's hint measures a board one way normally and another way where
  the first way is helpless
- **THEN** the resume walk fails to converge, because consecutive recomputes
  steer by different measures

#### Scenario: A sharpened measure disarms a gate that read it

- **WHEN** a measure is sharpened and a search is gated on that measure finding
  no improvement
- **THEN** the gate stops opening, and the boards it owned lose the plans it gave
  them — so the sharpening is confined to boards past that search's reach
