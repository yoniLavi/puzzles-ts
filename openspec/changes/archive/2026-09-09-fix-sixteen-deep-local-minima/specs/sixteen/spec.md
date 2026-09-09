# sixteen — delta for `fix-sixteen-deep-local-minima`

## ADDED Requirements

### Requirement: Sixteen's hint SHALL count the tangles its distance measure cannot see

Sixteen's hint SHALL measure a board by the distance its tiles must travel
**plus** the number of *tangles* it is tied in — non-trivial cycles of the tile
permutation — and SHALL return a plan from a tangled board rather than refusing.

Travel distance alone is blind to a tangle. Two tiles in each other's cells read
as two squares from home and are nine moves away, because nothing short of
taking other tiles out and putting them back unwinds them; four such tangles is
thirteen-odd moves out while reading as eight. Every slide from such a board
therefore makes the measure worse, which makes it a strict local minimum that no
forward budget escapes — and it is past both exact searches, so nothing else
answered either. The hint refused on one at move 33 of a 5×5 game the player had
reached **by following its own hints**.

Reaching further is not available and SHALL NOT be attempted with this
machinery: each further ply costs about 40× at a branching factor of 40, and
crossing nine moves already needed a kept endgame database and a five-ply walk.
Counting the tangles is what escapes, and it costs one O(n) pass.

**The count SHALL be priced only past the number of tangles the exact searches
can unwind on their own** — two, because a tangle is about four and a half moves
and the deep search reaches nine. On any board at or under that the measure
SHALL be plain travel, so the boards those searches own are measured exactly as
before. This is not tuning: the deep search is gated on the fallback finding
nothing better than standing still, which is a statement about the measure, so a
measure sharpened everywhere stops that gate opening and turns the complete
nine-move plan the previous change bought into a five-move partial one.

**The guarantee SHALL be asserted by walking recomputed hints to solved, not by
the length of a single plan.** A plan that comes back proves nothing if the next
recompute undoes it, and the first arrangement of this fix did exactly that: the
tangle measure was armed only where travel was helpless, so consecutive
recomputes steered by different measures and the named board ran 400 recomputed
hints without ever solving.

**The boards a guard names SHALL be even permutations.** Every slide on a square
board of odd side is an even permutation, so an odd board — three swapped pairs
on a 5×5, the obvious next test case after two — is unreachable and unsolvable.
It looks exactly like this class and would convict the hint of a defect it does
not have.

#### Scenario: The board the hint refused on

- **WHEN** recomputed hints are followed from the 5×5 board whose only fault is
  four pairs of tiles in each other's cells
- **THEN** each one returns a plan, and the board reaches solved

#### Scenario: Tangles beyond a pair count

- **WHEN** the same is asked of a board of three tangles, and of one of five
- **THEN** both reach solved, rather than stopping partway

#### Scenario: A one- or two-tangle endgame is untouched

- **WHEN** a hint is asked on a board whose only fault is one or two swapped
  pairs
- **THEN** the deep search still answers it with a plan of more than eight moves
  that finishes the board, exactly as before

### Requirement: Sixteen's hint SHALL refuse only by saying its search ran out

Where Sixteen's planner returns nothing, the hint SHALL refuse with the
collection's constant for a search out of reach, and SHALL NOT claim that no
move would get the player closer.

Its planner reports an empty plan for exactly one reason — every search it ran
came back inside its budget without a route — and that is a fact about the
search, not about the board. The message this replaces asserted the second, and
on the board that prompted the change it was false: most moves did get the
player closer, and the hint simply could not find one.

#### Scenario: A refusal that has to be true

- **WHEN** Sixteen's hint cannot plan from a sound, unsolved board
- **THEN** it says it could not find a way home, and points at what still works

