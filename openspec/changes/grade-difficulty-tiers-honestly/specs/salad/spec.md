# salad Specification Delta — grade-difficulty-tiers-honestly

## ADDED Requirements

### Requirement: Salad grades its difficulty tiers honestly

A Salad board generated at Extreme SHALL NOT be soluble at Normal.

This diverges from upstream, which has no difficulty gate at all: it strips clues
while the board still solves at the target tier and publishes the result. The
setting therefore did not bind — **12 of the 13 Extreme boards in this game's own
frozen reference fixtures are soluble at Normal**, as were 71 of 80 freshly
generated boards, and in the Number Ball mode at 5×5 and 6×6 it was every board
sampled.

Because generation is solver-gated at every clue removal, the correction changes
every Extreme description; the byte-for-byte differential SHALL retain a way to run
upstream's original gate, used by that differential alone.

Extreme boards are genuinely rare in the Number Ball mode — a median of 486
candidate boards per success at 5×5, and a worst measured case of 4,419 — so the
generation retry bound SHALL be set high enough that a legal seed cannot exhaust
it. Exhaustion is a failure a player sees.

#### Scenario: An Extreme board genuinely needs the Extreme tier

- **WHEN** a board generated at Extreme is solved at Normal
- **THEN** the solver does not reach a solution
- **AND** solving the same board at Extreme does
