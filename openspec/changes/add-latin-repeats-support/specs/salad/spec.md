# salad Specification Delta — add-latin-repeats-support

## ADDED Requirements

### Requirement: Salad reasons about the empty square directly

Salad's solver SHALL express the empty square as a shared-cube symbol carrying a
per-line multiplicity, rather than translating between holes and candidates at
the game's edge. The translation layer that stood in for that support SHALL be
removed.

The solver SHALL implement the techniques the direct representation makes
expressible, so that Salad's difficulty tiers reflect real deductive depth, and
the Number Ball generator SHALL gate on that solver — its boards are only as
interesting as the reasoning available to reject a dull one.

Because the solver's strength decides which boards the generator produces,
Salad's descriptions no longer match the C reference byte for byte, and the
differential that rested on that match is retired. Assurance SHALL rest instead
on every generated board being uniquely solvable at exactly its stated
difficulty, with the frozen C fixtures retained as solver-verdict checks — the
board's *description* is no longer reproduced, but the solver's verdict on a
recorded board still is.

#### Scenario: The empty square is reasoned about directly

- **WHEN** the solver deduces a placement that turns on where empty squares can
  and cannot go
- **THEN** that deduction is expressed over the shared cube's repeatable symbol,
  with no translation step at the game boundary

#### Scenario: A generated board is uniquely solvable at its stated tier

- **WHEN** a board is generated at any tier
- **THEN** the solver finds exactly one solution, and finds it at that tier and
  not at the tier below

#### Scenario: A recorded C board still gets the recorded verdict

- **WHEN** the retained C fixtures are replayed through the rewritten solver
- **THEN** each board is still judged solvable at the difficulty recorded for it
