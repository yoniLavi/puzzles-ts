# subsets Specification Delta — add-subsets-hint

## ADDED Requirements

### Requirement: Subsets provides an explained hint

Subsets SHALL implement the hint hook, computing a full narrated plan from the
player's current marks (continuing from the position, not restarting from the
givens) using exactly the deductions of the shipped solver — the hint SHALL
NOT deduce more than the generator's uniqueness gate vetted.

Each hint step SHALL be a letter-level move whose narration states the premise
and the conclusion of the deduction that forces it — a horseshoe containment,
a missing-arrow incomparability, an exactly-once count, or a
candidate-collapse — never a bare instruction. A single deduction that decides
several letters SHALL be presented as one journey whose subsequent letters are
continuation steps, and all of a journey's marks SHALL render in the same hint
colour. The hint SHALL highlight the acted-on cell and shade the evidence
cells its narration relies on.

The hint SHALL refuse with an explanatory message on a board whose marks are
mistaken — whether flagged by the rule validator or contradicting the unique
solution while locally clean — and on a solved board.

#### Scenario: A hint narrates an arrow deduction

- **WHEN** a hint is requested and the next deduction propagates a letter
  across a horseshoe arrow
- **THEN** the step targets that letter's slot, shades the neighbour the
  arrow connects, and its narration states the containment premise and the
  forced conclusion

#### Scenario: One deduction deciding several letters reads as one journey

- **WHEN** a single deduction decides more than one letter of a cell
- **THEN** the letters are emitted as one journey whose later steps are
  flagged as continuations, and auto-hint plays them as one coherent hint

#### Scenario: A mistaken board is refused honestly

- **WHEN** a hint is requested on a board with a mark that contradicts the
  unique solution, whether or not a local rule is yet violated
- **THEN** no plan is shown and the player is told a mark must be wrong
