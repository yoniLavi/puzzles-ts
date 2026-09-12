# salad Specification

## Purpose
Salad, the Latin-square puzzle in which some squares stay empty, clued by the
letter seen first from each edge in ABC End View mode or by balls and crosses in
Number Ball mode. This capability specifies its port to the TS engine as a
consumer of the shared Latin-square solver that reasons about the empty square
directly, with honestly graded tiers and a hint explained entirely as
pencil-note deductions.

## Requirements

### Requirement: Salad game implements the Game interface

The engine SHALL provide `src/games/salad/` implementing the `Game`
interface for Salad, registered so the puzzle is served by the TypeScript engine.

Salad SHALL support both of its game modes: **ABC End View** (letters, with clues on
the grid's borders naming the first character seen looking inward) and **Number
Ball** (numbers, with in-grid ball and cross clues). Parameters SHALL be a grid size
(`order`), a symbol count (`nums`), a game mode, and a difficulty. Validation SHALL
require `nums` at least 2 and less than `order`, `order` at least 3, and `nums` at
most 9, matching upstream. A game ID SHALL encode the size, symbol count, mode and
difficulty and round-trip through decode.

Salad SHALL declare a `findMistakes` hook, because it has a unique solution, and
SHALL surface its `nums` symbol keys plus the empty and not-empty markers as an
on-screen keypad.

#### Scenario: Every preset produces a uniquely-solvable board

- **WHEN** a new game is generated for any preset or legal size, in either mode
- **THEN** a board is produced whose clues admit exactly one completion under the
  solver at the puzzle's difficulty

#### Scenario: A game ID round-trips through the parameters

- **WHEN** a parameter set is encoded to a game ID and decoded
- **THEN** the same size, symbol count, game mode and difficulty are recovered

### Requirement: Salad descriptions use the upstream run-length block encoding

A Salad description SHALL encode its clue arrays in canonical order using a
run-length block encoding: a run of empty squares as a single lowercase letter, an
empty-marker square as `X`, a must-contain-a-symbol square as `O`, and a symbol as a
character offset from a per-array base. In ABC End View mode the description SHALL be
the border clues, a comma, then the grid clues; in Number Ball mode it SHALL be the
grid clues alone.

Validation SHALL reject a description that carries more or fewer squares than the
relevant array holds (distinguishing which), that contains an out-of-range clue
value, or that uses an unknown character, reproducing the upstream messages.

#### Scenario: A generated description round-trips

- **WHEN** a description is generated and then decoded into a board
- **THEN** re-encoding that board yields the identical description

#### Scenario: A description with the wrong number of squares is rejected

- **WHEN** a description carrying more or fewer squares than its array has cells is
  validated
- **THEN** it is rejected with a message distinguishing too much from too little

### Requirement: Salad ports the solver as a shared Latin-square consumer

Salad SHALL provide a solver built on the shared `engine/latin.ts` framework, adding
its own deduction — in ABC End View mode — the border-clue deduction. The "some
squares empty" rule SHALL be realized by declaring the empty square to the shared
cube as its repeated symbol (`nums + 1`, appearing `order − nums` times per line),
so that the cube's own positional, numeric and set eliminations reason about
empty squares directly; a cross SHALL be that symbol placed and a ball that symbol
struck, and the board's marker array SHALL be read back off the solved cube.

The solver SHALL provide two difficulties, Normal and Extreme, and both SHALL be
solvable by pure deduction without guessing. The generator SHALL use the solver to
keep every board uniquely solvable: it SHALL generate a full Latin square, then
remove clues in a randomized order, keeping a removal only while the puzzle stays
uniquely solvable at the target difficulty. Generation from a given seed SHALL be
reproducible.

#### Scenario: The solver deduces the unique solution without guessing

- **WHEN** a generated board is solved at its difficulty
- **THEN** the solver reaches the unique completion using only its deductive
  techniques, never backtracking search

#### Scenario: Generation is reproducible from a seed

- **WHEN** the same seed is used twice for the same parameters
- **THEN** both runs produce the identical board description

### Requirement: Salad input, marking and completion

Salad SHALL be played by selecting a cell and entering a symbol, an empty marker, or
a not-empty marker, with pencil marks available for tentative notes. Left-click SHALL
select a cell for ink entry and right-click for pencil entry; the arrow keys SHALL
move a keyboard cursor and the select key SHALL toggle between ink and pencil entry.
A fill-all-candidates action SHALL be available. A move that would not change the
board SHALL be a no-op.

Salad SHALL flag mistakes on demand: given the board, `findMistakes` SHALL re-solve
from the fixed clues and report every player entry that contradicts the unique
solution — a wrong symbol, an empty marker where a symbol belongs, a not-empty marker
where an empty square belongs — and every empty cell whose pencil notes have crossed
out its solution value. The game SHALL be reported solved and SHALL flash when every
line holds each symbol exactly once with the correct empty squares and all border
clues are satisfied.

Rendering SHALL draw symbols, balls and crosses, pencil-mark candidate grids, border
clues in the surrounding margin, a live highlight of rule violations, and a
completion flash. Rendering targets a neat presentation, not pixel parity with the C.

#### Scenario: Entering a symbol places it in the selected cell

- **WHEN** a cell is selected in ink mode and a valid symbol key is pressed
- **THEN** that symbol is placed in the cell and the cell is no longer empty

#### Scenario: Completing every line to the rules wins

- **WHEN** the last entry makes every row and column hold each symbol once with the
  correct empty squares, satisfying all clues
- **THEN** the game is reported solved and flashes

#### Scenario: Check flags a contradicting entry

- **WHEN** the board holds a player entry that contradicts the unique solution and
  mistakes are checked
- **THEN** that entry is reported as a mistake and highlighted

### Requirement: Salad explains every hint as a pencil-note deduction

Salad SHALL implement the `hint` hook as a **candidate-elimination** hint: the plan
sets and strikes pencil notes, settles a square's emptiness with an empty/not-empty
marker, and places a symbol at the moment a square's notes collapse to one. Every
step SHALL explain *why* its move is forced in terms of the board the player can
see, never merely naming the move.

Each of Salad's three deductions SHALL be narrated in its own terms:

- the **hole/symbol synchronization** — a square that can hold no symbol must be
  empty, and a square that cannot be empty must hold a symbol (even when which
  symbol is not yet known);
- the **per-line count** — once a line's empty squares are all marked, every other
  square in it holds a symbol, and once its symbols are all placed, every square
  still blank in it is empty;
- the **border clue** (ABC End View mode only) — near the clue, no symbol other
  than the clue's may appear until the first square that is not known-empty; and
  beyond the clue's reach, which is bounded by how many empty squares the line may
  still hold, the clue's own symbol is ruled out.

The generic Latin deductions Salad inherits (forced singles, duplicate
elimination, set elimination and forcing chains) SHALL be narrated too, so no
accepted board can reach a step the hint cannot explain. Because both of Salad's
difficulties are solvable by pure deduction, the hint SHALL never need a
non-deductive fallback step.

A hint SHALL be refused, with the board's mistakes highlighted, when the current
board contradicts the unique solution; and refused when the board is already
complete.

The hint plan SHALL be recomputable from any mid-game position: a plan computed
after the player has made some of its moves by hand SHALL neither repeat those
moves nor stall.

Computing a hint SHALL NOT change which puzzles Salad generates: the deduction
recorder the hint reads SHALL be inert on the generator's solving path.

#### Scenario: A border clue's deduction names the clue and its line of sight

- **WHEN** a hint's next deduction follows from a border clue
- **THEN** the step explains what the clue sees and why that rules the candidate
  in or out, and highlights the clue together with the squares along the line it
  reasons about

#### Scenario: A line whose empty squares are all found forces the rest

- **WHEN** a line already carries as many empty-square markers as it may hold
- **THEN** the hint's step marks the line's remaining blank squares as holding a
  symbol, and explains that the line's empty squares are already accounted for

#### Scenario: One deduction forcing several squares is one hint

- **WHEN** a single deduction forces changes to more than one square
- **THEN** they are presented as one multi-leg hint journey rather than several
  unrelated hints

#### Scenario: A hint is refused while the board holds a mistake

- **WHEN** a hint is requested on a board that contradicts the unique solution
- **THEN** no plan is shown, the contradicting squares are highlighted, and the
  refusal says a mistake must be fixed first

#### Scenario: A hint plan resumes from a partly-followed position

- **WHEN** the player performs some of a plan's moves by hand and a hint is
  requested again
- **THEN** the new plan starts from the current board, repeating none of the moves
  already reflected on it

#### Scenario: Recording a hint's deductions leaves generation unchanged

- **WHEN** the deduction recorder used by the hint is present in the codebase
- **THEN** the descriptions Salad generates for a given seed are byte-for-byte
  unchanged from those recorded from the C reference

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

### Requirement: Salad reasons about the empty square directly

Salad's solver SHALL express the empty square as a shared-cube symbol carrying a
per-line multiplicity, rather than translating between holes and candidates at
the game's edge. The translation layer that stood in for that support SHALL be
removed.

The empty-square deductions SHALL be the shared cube's own — positional
elimination with the symbol's multiplicity, the line strike once a line holds
all its empties, multiplicity-aware set elimination — rather than a hand-written
sync-and-count layer, and the Number Ball quality gate SHALL ask its question
("do the holes fall out with no number entered?") of that cube.

The rewrite SHALL be deductively equivalent to upstream's translation layer on
every board the frozen C reference records, and the byte-match differential
SHALL be **kept** as the proof: because generation is solver-gated at every clue
removal, a description that still matches byte for byte means the solver's
verdict on every intermediate board is unchanged. (The plan was to retire the
differential and re-found assurance on properties; the finding was that the
oracle survives, and a surviving oracle is stronger than any property written
to replace it.)

#### Scenario: The empty square is reasoned about directly

- **WHEN** the solver deduces a placement that turns on where empty squares can
  and cannot go
- **THEN** that deduction is expressed over the shared cube's repeatable symbol,
  with no translation step at the game boundary

#### Scenario: A generated board is uniquely solvable at its stated tier

- **WHEN** a board is generated at any tier
- **THEN** the solver finds exactly one solution, and finds it at that tier and
  not at the tier below

#### Scenario: The frozen C descriptions still match byte for byte

- **WHEN** the byte-match differential replays every frozen C fixture against
  upstream's loose tier gate
- **THEN** every description is reproduced exactly, and the recorded solver
  verdicts hold
