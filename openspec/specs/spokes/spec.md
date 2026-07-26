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

### Requirement: Spokes game implements the Game interface

The engine SHALL provide `src/native/games/spokes/` implementing the `Game`
interface for Spokes, registered so the puzzle is served by the TypeScript engine.

Parameters SHALL be a width, a height, and a difficulty (Easy, Tricky or Hard).
Validation SHALL require width and height each at least 2, matching upstream, with
no upper bound. A game ID SHALL encode the width, height and difficulty and
round-trip through decode.

Spokes SHALL be a uniquely-solvable line-drawing puzzle and SHALL declare a
`findMistakes` hook, so that Check & Save flags a wrong board rather than saving it
silently.

#### Scenario: Every preset produces a soluble board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose hubs can be connected into one satisfied,
  fully connected group, deducible at the requested difficulty

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and difficulty are recovered

### Requirement: Spokes descriptions use one clue character per cell

A Spokes description SHALL encode the board as exactly width times height
characters in row-major order: each character is a clue digit from `0` to `8` (the
number of lines that hub must carry, where `0` marks a cell that holds no hub), or a
marker for a hand-authored hole. The description SHALL NOT use run-length
abbreviation.

Validation SHALL reject a description that carries fewer characters than the board
has cells, that carries more, or that contains a character that is neither a clue
digit nor the hole marker, distinguishing a too-short description from a too-long
one.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of characters is rejected

- **WHEN** a description carrying more or fewer characters than the board has cells
  is validated
- **THEN** it is rejected with a message distinguishing too short from too long

### Requirement: Spokes ports the tiered deductive solver and solver-gated generator

Spokes SHALL provide a solver that draws the forced lines and marks for a board, or
reports the board invalid or incomplete, at a requested difficulty of Easy, Tricky
or Hard. The solver SHALL apply hub saturation and exhaustion, diagonal-crossing
marks, and the two-ones rule; the Tricky and Hard tiers SHALL additionally apply
bounded contradiction look-ahead. The solver SHALL determine board validity by
connectivity, treating a set of hubs that can draw no further line to the rest of
the board as invalid and a fully connected, fully satisfied board as solved.

The contradiction look-ahead SHALL be deterministic and exhaustive, not a guessing
tier: a value is committed only when the opposite value provably leads to an invalid
board.

The generator SHALL use the solver to keep every board uniquely soluble: it SHALL
start from every horizontal and vertical line plus a random diagonal per cell, then
remove lines in a randomised order, keeping a removal only while every hub retains at
least one line and the board stays uniquely soluble at the target difficulty and no
easier. Generation from a given seed SHALL be reproducible.

#### Scenario: The solver deduces the unique solution

- **WHEN** a generated board is solved at its difficulty
- **THEN** the solver reaches a single fully connected, fully satisfied
  configuration of lines and marks

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Spokes grades its difficulty tiers honestly

A Spokes board generated at a difficulty above the easiest SHALL NOT be soluble at
the tier below it. The acceptance check that decides this SHALL run from an empty
position, so that its verdict describes the board being offered rather than any
state left over from an earlier candidate.

This deliberately diverges from upstream, whose equivalent check re-solves a scratch
board whose lines still carry the previous candidate's solution, and which therefore
both rejects boards for reasons unrelated to difficulty and admits boards an easier
tier can crack. Because generation is solver-gated, the divergence changes every
Tricky and Hard description, so the byte-for-byte differential against the C SHALL
retain a way to run upstream's original check, used by that differential alone.

#### Scenario: A Hard board genuinely needs the Hard tier

- **WHEN** a board generated at Hard is solved at Tricky
- **THEN** the solver does not reach a solution
- **AND** solving the same board at Hard does reach one

#### Scenario: The differential still compares against upstream's generator

- **WHEN** the frozen C-reference fixtures are regenerated by the TypeScript
  generator running upstream's original acceptance check
- **THEN** each description matches the C byte for byte

### Requirement: Spokes marks hubs whose spoke count is met

Rendering SHALL distinguish a hub that already carries as many lines as its clue
requires from one that does not, by a fill colour clearly separated from the board
background in both light and dark presentation. The distinction SHALL be visual
only: a marked hub remains fully editable. A preference SHALL let the player turn
the marking off.

Upstream nominally fills such a hub with pure white, which is indistinguishable
from the background the application supplies in either colour scheme; that is
treated as a defect of presentation, which this project's display code is free to
correct.

#### Scenario: Meeting a clue marks the hub

- **WHEN** a hub's drawn lines reach the number its clue requires
- **THEN** that hub is filled in the satisfied colour, and hubs that have not
  reached their clue are not

#### Scenario: The marking can be switched off

- **WHEN** the satisfied-hub preference is turned off
- **THEN** no hub is filled in the satisfied colour, whatever its line count

### Requirement: Spokes input, movement and completion

Spokes SHALL be played by dragging between two adjacent hubs, or with a keyboard
cursor. A left drag SHALL toggle a line between the hubs, and a right drag SHALL
toggle a ruled-out mark; a keyboard cursor on the half-grid SHALL draw a line on
select and place a mark on the alternate select. A line SHALL NOT be drawable along a
diagonal that would cross an existing diagonal line. A drag or key that resolves to no
valid change SHALL leave the board unchanged.

Rendering SHALL draw each hub as a circle carrying its available spokes and clue,
SHALL draw lines between connected hubs, SHALL highlight the hub being dragged from,
SHALL colour an over-filled or isolated hub as an error, and SHALL flash on
completion. There SHALL be no interpolated line-drawing animation.

`findMistakes` SHALL flag every line the player has drawn that the unique solution
forbids, and every mark the player has placed where the solution requires a line; a
line the solution requires but the player has not yet drawn SHALL NOT be flagged.

#### Scenario: Dragging between two hubs draws a line

- **WHEN** the player left-drags from one hub to an adjacent hub with a free spoke
- **THEN** a line is drawn between them, or removed if one was already present

#### Scenario: A crossing diagonal line is refused

- **WHEN** the player tries to draw a diagonal line whose crossing diagonal already
  carries a line
- **THEN** no line is drawn and the board is unchanged

#### Scenario: Completing the connected, satisfied board wins

- **WHEN** every hub carries exactly its clue's lines and all hubs form one connected
  group with no crossing lines
- **THEN** the game is reported solved and flashes

#### Scenario: A wrongly drawn line is flagged as a mistake

- **WHEN** the player has drawn a line the unique solution does not contain and asks
  to check the board
- **THEN** that line is reported as a mistake, while lines merely not yet drawn are
  not

