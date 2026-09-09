# sixteen — deltas for fix-sixteen-endgame-stranding

## ADDED Requirements

### Requirement: Sixteen's hint SHALL finish the swapped-pair endgames

Sixteen's hint SHALL return a plan from a board whose only fault is one or two
pairs of tiles sitting in each other's cells, and SHALL NOT refuse on it.

These boards are where the collection's strongest hint guarantee actually broke.
They are a strict local minimum of the distance measure — every slide makes the
picture worse — and they are **nine moves** from finished while reading as two or
four cells out, which is one move past what a search that stores every board it
visits can afford at this size. Walking forty games of each preset one recomputed
hint at a time, the hint stopped on twelve of forty 5×4 games and five of forty
5×5 ones, telling the player "No move here would get you closer." on a solvable
board after they had followed thirty-odd hints. Sixteen SHALL therefore configure
the planner's depth-bounded deep search, and its reach SHALL cover nine moves at
its largest preset.

The guard for this SHALL name the boards rather than sample for them, and SHALL
assert the **plan length** and not merely that a plan came back: the
state-bounded search never returns more than eight moves at this size, so only a
plan longer than eight proves the deep search ran. A test that asked for any plan
at all would keep passing if the deep search were disabled and the board happened
to be reachable another way.

#### Scenario: A single swapped pair

- **WHEN** a hint is asked on a 5×4 board that is solved except for two tiles in
  each other's cells
- **THEN** it returns a plan of more than eight moves that finishes the board

#### Scenario: Two swapped pairs

- **WHEN** a hint is asked on a 5×5 board that is solved except for two such
  pairs
- **THEN** it returns a plan of more than eight moves that finishes the board
