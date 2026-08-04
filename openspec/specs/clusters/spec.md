# clusters Specification

## Purpose
TBD - created by archiving change add-clusters-ts-port. Update Purpose after archive.
## Requirements
### Requirement: Clusters game implements the Game interface

The engine SHALL provide `src/games/clusters/` implementing the `Game`
interface for Clusters, registered so the puzzle is served by the TypeScript
engine.

Parameters SHALL be a width, a height and a difficulty. Validation SHALL reject a
board whose area is at least 10000 ("too large") or less than 2 ("too small"),
matching upstream, and SHALL additionally reject a board no larger than 2×2 in
both dimensions, which upstream's area check admits and which has no Clusters
puzzle at any difficulty. A game ID SHALL encode the width and height (a bare
single number read as a square board) and, in its full form, the difficulty, and
SHALL round-trip through decode. The difficulty SHALL be offered by the preset
menu and by the Custom dialog.

Because Clusters is a unique-solution logic puzzle with a built-in rule checker,
it SHALL declare a `findMistakes` hook so Check & Save can flag rule-violating
cells.

#### Scenario: Every preset produces a uniquely solvable board

- **WHEN** a new game is generated for any preset or legal size
- **THEN** a board is produced whose blank cells can be filled to satisfy the
  cluster rules in exactly one way, and the solver completes it

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same width, height and difficulty are recovered, and a bare single
  number is read as a square board

#### Scenario: A board with no puzzle at all is rejected

- **WHEN** a board of 1×2 or 2×2 is validated
- **THEN** it is rejected, naming the constraint, rather than accepted and
  generated for ever

### Requirement: Clusters descriptions use the upstream run-length dot encoding

A Clusters description SHALL encode only the given dot clues, in row-major order:
a lowercase letter SHALL denote a red dot preceded by a run of blank cells, an
uppercase letter SHALL denote a blue dot preceded by a run of blank cells, and
`z` or `Z` SHALL denote a pure skip of twenty-five blank cells so that longer
runs chain. The accumulated position SHALL total the board area plus one.

Validation SHALL reject a description whose accumulated position is short of or
past the board area plus one (distinguishing "too short" from "too long"), and
SHALL reject any character outside the letter alphabet.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of cells is rejected

- **WHEN** a description whose accumulated position differs from the board area
  plus one is validated
- **THEN** it is rejected with a message distinguishing too short from too long

### Requirement: Clusters ports the contradiction solver and solver-gated generator

Clusters SHALL provide a solver that classifies a board as complete, unfinished
or invalid and marks the cells that break a rule. The solver SHALL fill forced
cells by contradiction — tentatively setting each colour in an empty cell and
taking the other colour when one makes the board invalid — and SHALL apply one
level of hypothetical lookahead when asked for it. Those two rungs are the two
difficulty tiers.

The generator SHALL use the solver to keep every board uniquely solvable: it
SHALL two-colour the grid at random, flip isolated cells until none remains,
reduce the board to dot clues, prune adjacent equal dots, and retry until the
solver completes the board at the requested tier and, above the easiest tier, the
tier below cannot. Generation from a given seed SHALL be reproducible. The retry
loop SHALL be bounded, so that a parameter set admitting no board fails rather
than spinning.

Rejecting a candidate the generator has *completed* SHALL perturb the grid before
retrying. The retry loop deliberately carries deduced cells between attempts and
re-randomises only blank ones, so a completed grid would otherwise re-derive
itself, draw no randomness, and never terminate. The perturbation SHOULD be small
rather than a reset: the loop is a hill-climb, and discarding it costs several
times the generation time it saves nothing of.

Because generation is solver-gated at every candidate, the byte-for-byte
differential SHALL retain a way to run the original single gate — solve at the
deeper rung, accept on completion — used by that differential alone.

#### Scenario: The solver completes a uniquely solvable board

- **WHEN** a generated board is solved
- **THEN** the solver fills every blank cell to the unique solution and reports
  the board complete

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

#### Scenario: A parameter set with no board gives up rather than hanging

- **WHEN** generation is asked for a board that cannot exist at the requested
  tier
- **THEN** the generator exhausts a finite retry budget and reports failure

### Requirement: Clusters input, mistakes and completion

Clusters SHALL be played by clicking or dragging to paint cells and by a keyboard
cursor. A left click or drag SHALL cycle a cell toward blue and a right click or
drag toward red, each also able to clear a cell; a drag SHALL paint every cell it
passes. The keyboard cursor SHALL place blue, red or blank via dedicated keys.
Given dot cells SHALL never be overwritten. A move that changes no non-given cell
SHALL produce no history entry.

The game SHALL report the cells that break a cluster rule through `findMistakes`
so Check & Save can hard-block on them. Solving SHALL fill the board to the
unique solution. Completion SHALL be reached when every cell is filled and no
rule is broken, and the board SHALL flash on completion. There SHALL be no
interpolated move animation.

#### Scenario: Dragging paints a run of cells

- **WHEN** a drag is started and moved across several blank cells
- **THEN** every non-given cell it passes is painted the drag colour on release

#### Scenario: A rule-breaking cell is reported as a mistake

- **WHEN** the board contains a cell that violates a cluster rule and mistakes
  are checked
- **THEN** that cell is reported, and Check & Save declines to save

#### Scenario: Completing the grid wins

- **WHEN** a move fills the last cell so every cell satisfies the cluster rules
- **THEN** the game is reported solved and flashes

### Requirement: Clusters provides an explained deduction hint

Clusters SHALL implement the `hint` and `hintKeepTrack` hooks so a player can ask
why the next move is forced. A hint SHALL be computed from the game's own
contradiction solver — the solver and the hint SHALL be two projections of one
deduction engine — so that every hinted move corresponds to a deduction the
solver can make from the player's current position, and the plan SHALL be
recompute-stable: deterministic scan order, so a hint recomputed after a
followed move continues where the previous plan left off.

Each hint step SHALL explain *why* the move is forced, not merely which cell to
colour: it SHALL name the rule that the opposite colouring would violate — a
tile wholly sealed off from its own colour, a given dot that would touch a
second same-colour tile, or a plain tile that could no longer touch two tiles of
its own colour — stating the premise, the contradiction, and the conclusion in
the necessity voice. The forced cell SHALL be highlighted as the hint target,
and when the contradiction lands on a tile other than the target, that tile
SHALL be marked with a visually distinct ring (distinct from the live-error
frame in both hue and structure) that the narration's "ringed" refers to
uniquely, so the reasoning is visible on the board and not only in prose. The
hint SHALL NOT pre-place the forced colour.

A deduction that forces a move only through the solver's one-level lookahead
SHALL be presented as one step that displays the whole forcing chain statically
on the board: the hypothesis cell as the hint target, each cell the hypothesis
would force marked with the colour it would be forced to (in a form visually
distinct from a placed tile), and the tile where the contradiction lands ringed
— never an un-narrated "only one option fits" fallback. At each lookahead stall
the plan SHALL select the candidate firing with the shortest forcing chain
(deterministically tie-broken), keeping the displayed chain short. Because no
tier gates a board on more than the depth-1 solver — whose hypothetical
propagation is itself deduction-only — every board the shipped generator can
emit SHALL be solvable by this narratable deduction with no nested speculation,
and an Easy board SHALL additionally need no lookahead step at all.

A hint SHALL be refused, with an explanatory banner, when the board is already
solved, when the board contains a rule violation (as reported by
`findMistakes`), or when the deduction runs into a contradiction from the
player's position (a wrong tile that no local rule yet flags) — in the last
case the banner SHALL say a placed tile must be wrong rather than deduce onward
from a doomed position.

#### Scenario: A forced move is explained by the rule it would break

- **WHEN** a hint is requested on a solvable, mistake-free board
- **THEN** the forced cell is highlighted, and the explanation names the rule
  (sealed off, dot overcount, or cannot-touch-two) that the opposite colour
  would violate, ringing the endangered tile when it is not the target itself

#### Scenario: A lookahead deduction shows its whole forcing chain

- **WHEN** the next forced move follows only from the one-level lookahead
- **THEN** it is presented as one hint step whose narration states the
  hypothesis and the contradiction, with every cell of the forcing chain marked
  on the board with the colour the hypothesis would force it to

#### Scenario: A hint is refused on an unsolvable or mistaken board

- **WHEN** a hint is requested on a board that is solved, that contains a
  rule-violating tile, or whose placed tiles contradict the unique solution
  without yet breaking a local rule
- **THEN** no move is hinted and an explanatory banner is shown

### Requirement: Clusters offers difficulty tiers over its two deduction levels

Clusters SHALL offer a difficulty parameter with two tiers, corresponding to the
two deduction levels its solver already implements: the single-cell proof by
contradiction (**Easy**), and the same reasoning applied one hypothetical level
deep (**Tricky**).

A board generated at Tricky SHALL require that second level — it SHALL NOT be
soluble by the single-cell reasoning alone. A board generated at Easy SHALL be
soluble by it. The acceptance gate MAY run the easier rung first and reject a
Tricky candidate it completes, which reaches the same verdict for one solver run
rather than two.

The difficulty SHALL be encoded in the game ID, and an ID that carries no
difficulty SHALL decode to Easy — the majority tier among the boards Clusters
generated before the parameter existed, and the tier whose boards a returning
player is likeliest to recognise. A tier letter the game does not know SHALL be
rejected by parameter validation rather than silently played as some other tier.

Clusters SHALL refuse to *generate* at Tricky on a board too small to admit one,
reporting it through parameter validation with `full` set, so that a saved game or
a game ID carrying its own description still loads at any size.

`solve`, `hint` and `findMistakes` SHALL continue to use the deeper rung whatever
tier the board was generated at: they are "try as hard as you can", and the rung
costs nothing on a board that does not need it.

#### Scenario: The harder tier needs the deeper reasoning

- **WHEN** a board generated at the harder tier is solved using only the
  single-cell contradiction rule
- **THEN** the solver does not reach a solution
- **AND** solving the same board with the lookahead completes it

#### Scenario: The easier tier needs only the single-cell rule

- **WHEN** a board generated at the easier tier is solved using only the
  single-cell contradiction rule
- **THEN** the solver completes it

#### Scenario: An older game ID still resolves

- **WHEN** a game ID generated before the difficulty parameter existed is opened
- **THEN** it loads and is playable, and its parameters read as the easier tier

#### Scenario: A board too small for the harder tier refuses it

- **WHEN** a full, generation-capable parameter set requests the harder tier on a
  board admitting no such puzzle
- **THEN** parameter validation rejects it, naming the constraint
- **AND** the same parameters are accepted when a description is supplied instead

