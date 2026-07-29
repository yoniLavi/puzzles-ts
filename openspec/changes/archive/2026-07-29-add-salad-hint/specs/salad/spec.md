# salad Specification Delta — add-salad-hint

## ADDED Requirements

### Requirement: Salad explains every hint as a pencil-note deduction

Salad SHALL implement the `hint` hook as a **candidate-elimination** hint: the plan
sets and strikes pencil notes, settles a square's emptiness with an empty/not-empty
marker, and places a symbol at the moment a square's notes collapse to one. Every
step SHALL explain *why* its move is forced in terms of the board the player can
see, never merely naming the move.

Each of Salad's three deductions SHALL be narrated in its own terms:

- the **hole/symbol synchronisation** — a square that can hold no symbol must be
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
