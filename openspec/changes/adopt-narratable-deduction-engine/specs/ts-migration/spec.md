# ts-migration Specification (delta)

## ADDED Requirements

### Requirement: Narratable-deduction generation policy

Every board a **logic** game generates for a non-`Unreasonable` tier SHALL be
solvable by the *same* narratable techniques that game's explained hint teaches.
The deductive solver and the hint SHALL be two projections of one deduction
engine: the generator runs the technique rungs to a fixpoint with the recorder
off (accepting a board only when the rungs fully solve it — deductive completion
implies uniqueness, so no separate uniqueness pass is required, and the highest
rung used is the difficulty grade), and the hint runs the same rungs with the
recorder on. A hint SHALL NOT fall back to a generic, unexplained step for a
deduction its techniques do not cover (the `ts-engine` Hint-System companion
rule).

A game SHALL meet this by either **narrating every deduction it accepts**
(promoting any catch-all into an honest technique) or **rejecting at generation**
the boards whose solution needs an un-narratable deduction. The choice is
per-game, made against a measured cost:

- A generation gate that rejects boards SHALL be adopted only after measuring
  that its rejection rate does not make a size or difficulty tier unfillable or
  materially slow "New Game."
- Redefining "solvable" as "narratably-solvable" MAY shift a difficulty tier's
  character; a game's tiers SHALL be re-graded after such a flip.

The one sanctioned exception is an explicitly-named `Unreasonable` tier, which MAY
require guess-and-backtrack, MAY keep a minimized backtracking oracle for
uniqueness, and whose hint MAY be non-deductive on those boards. Movement /
objective games (no deductive "why") are out of scope: their hints are heuristic
or `aux`-walks and there is no solver to unify.

Adopting a generation gate MAY change which boards a game generates; where a game
has a byte-match differential against the C reference, that differential MAY be
retired as a consequence (boards are expendable post-pivot; C is a reference, not
a byte-oracle).

#### Scenario: A generated board is solvable by the taught techniques

- **WHEN** a non-`Unreasonable` board is generated for a logic game that has
  adopted the policy
- **THEN** the game's narratable techniques solve it to completion with no
  guessing and no un-narrated fallback deduction

#### Scenario: A costly rejection gate is measured before adoption

- **WHEN** a game would adopt a generation gate that rejects non-narratable boards
- **THEN** its rejection rate and difficulty-tier grades are measured first
- **AND** if rejection would thin a size/tier or materially slow generation, the
  game narrates the deduction honestly instead of rejecting

#### Scenario: Unreasonable is exempt

- **WHEN** a game ships an explicitly-named `Unreasonable` tier
- **THEN** that tier MAY require guessing and its hint MAY be non-deductive there,
  without violating this policy
