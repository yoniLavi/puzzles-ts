# spokes Specification

## Purpose
TBD - created by archiving change add-spokes-hint. Update Purpose after archive.
## Requirements
### Requirement: Spokes explains why each hinted move is forced

Spokes SHALL implement the hint hooks, and each hint SHALL narrate the argument
that forces the move, not merely the move. The narration SHALL state the premises
it rests on before its conclusion, and every claim it makes SHALL be one the
implementation has checked.

The hint SHALL be derived from the same deduction engine as the solver, so that no
hinted move is reachable by reasoning the solver does not perform, and no shipped
board can require a step the hint cannot explain.

Where a single deduction forces several spokes at once — a hub with exactly as
many free spokes as it still needs lines, or one that already has all of them —
those SHALL be emitted as one multi-leg journey rather than as separate hints, and
all of its legs SHALL be rendered in the same colour, because they share a fate.

A hint plan SHALL be stable across recomputation: re-requesting a hint after the
player has followed a step SHALL continue the same line of reasoning rather than
propose a different or contradictory one.

A hint SHALL be goal-oriented: it SHALL prefer a forced connection (a line) over a
rule-out, and it SHALL NOT propose ruling out a spoke unless doing so helps a hub
that still needs lines. A forced rule-out whose two hubs are both already
satisfied advances nothing and SHALL NOT be hinted.

#### Scenario: A useless rule-out is never hinted

- **WHEN** a spoke could be ruled out but both of its hubs already have all the
  lines they need
- **THEN** the hint does not propose ruling it out, because it advances nothing

#### Scenario: A saturated hub is explained by the count that forces it

- **WHEN** a hub still needs as many lines as it has spokes left that could carry
  one, and the player asks for a hint
- **THEN** the hint states that the hub's remaining count and its remaining places
  are equal, and concludes that every one of those spokes is a line
- **AND** all of those spokes are presented as one hint in one colour

#### Scenario: The two-ones rule names the connectivity constraint

- **WHEN** two adjacent hubs each still need exactly one line and the spoke
  between them must be ruled out
- **THEN** the hint states that joining them would finish both and seal them off
  from the rest of the board, which the one-connected-group rule forbids
- **AND** concludes that the spoke between them is ruled out

#### Scenario: A contradiction hint states its hypothesis

- **WHEN** a spoke is forced only because the opposite value leads to an
  impossible board
- **THEN** the hint states the hypothesis it is refuting and the impossibility it
  reaches, and only then the conclusion

### Requirement: Spokes refuses to hint from a position it cannot vouch for

Spokes SHALL refuse a hint, with an explanation, when the board is already solved,
when the board contradicts the unique solution, when the board already breaks a
rule the game marks, or when no deduction applies. It SHALL NOT present a move as
forced when that move follows only from a mistake the player has made.

#### Scenario: A wrong board is corrected rather than hinted

- **WHEN** the player asks for a hint on a board carrying a line the solution
  forbids
- **THEN** no hint step is offered, the offending lines are highlighted, and the
  player is told to resolve them first

### Requirement: A diagonal line automatically rules out its crossing

Spokes SHALL rule out a diagonal's crossing automatically, because a drawn
diagonal visibly blocks the other diagonal of the same square and asking the
player (or a hint) to mark it is noise. Drawing a diagonal line SHALL mark its
crossing spoke; erasing that line SHALL clear the mark it placed; and a crossing
so blocked SHALL be inert to input while the line stands. The rule-out SHALL be a
real mark, so the solver and the hint count it, and the hint SHALL therefore never
propose it.

#### Scenario: Drawing a diagonal blocks its crossing, erasing it unblocks

- **WHEN** the player draws a diagonal line across a square
- **THEN** the crossing diagonal of that square becomes ruled out without any
  further action, and the player cannot toggle that mark while the line remains
- **AND WHEN** the player erases the diagonal line
- **THEN** the automatic mark on the crossing is removed

