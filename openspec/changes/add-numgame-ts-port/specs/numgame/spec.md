# numgame Specification Delta — add-numgame-ts-port

## ADDED Requirements

### Requirement: Numgame is designed as a game over the ported solver

The engine SHALL provide `src/native/games/numgame/` implementing the `Game`
interface for a Countdown-style number puzzle: the player is given a multiset of
source numbers and a target, and combines numbers with addition, subtraction,
multiplication and division to reach the target. Because upstream ships only a
command-line solver and no game, this capability is **designed**, not
transcribed, and its rules (operators allowed, whether fractional intermediate
results are permitted, how many times each source may be used) SHALL be fixed
explicitly before implementation.

The exhaustive breadth-first solver SHALL be ported from `numgame.c` as the
reusable core that the generator and any hint build on; its `tree234` dedup
SHALL be replaced by an idiomatic value-keyed map, since the ordering is a pure
lookup.

#### Scenario: The solver enumerates reachable values faithfully

- **WHEN** the ported solver is run on a source multiset
- **THEN** it reports exactly the values reachable under the fixed rules, with
  the count of distinct derivations of each, matching the C utility's arithmetic

#### Scenario: A generated puzzle is reachable at the requested difficulty

- **WHEN** a new game is generated at a difficulty
- **THEN** its target is reachable from its sources, is not trivially reachable,
  and meets the chosen difficulty heuristic

### Requirement: Numgame play and presentation are invented, not ported

Numgame SHALL present source numbers and the numbers derived from them, let the
player express one arithmetic operation at a time as a move that combines two
available numbers into a new one, support undo, and report the puzzle solved
when a derived number equals the target. Because no upstream user interface
exists, this presentation and move model SHALL be specified by this change
rather than matched against C, and SHALL be covered by behavioural and render
tests rather than a game-level differential.

#### Scenario: Combining two numbers produces a new one

- **WHEN** the player selects two available numbers and an operator whose result
  is legal under the fixed rules
- **THEN** a new derived number appears and the two operands are consumed for
  that branch, recorded as one undoable move

#### Scenario: Reaching the target wins

- **WHEN** a derived number equals the target
- **THEN** the game is reported solved
