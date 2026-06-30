# pattern Specification

## ADDED Requirements

### Requirement: Pattern provides an explained, deductive hint

Pattern SHALL implement the Hint System hooks (`hint`, `hintKeepTrack`, and
rendering of the displayed step) to the explained-hint quality bar: each hint
SHALL teach *why* the move is forced by a recognisable nonogram line technique
(run overlap, line completion, unreachable gap, or edge/anchor extension), not
merely state the move. Because the generator accepts only boards uniquely
solvable by the per-line solver with no guessing, every shipped board is
pure-deduction solvable and the hint SHALL never reveal the stored solution or
run a search.

A single line deduction that forces several cells SHALL be emitted as **one**
multi-cell `HintStep` whose move fills all of them (one firing = one step), with
each technique's forced set a single colour so the step is understandable at a
glance. The narration SHALL lead with the indication (the clue and the spotted
pattern, in board terms) and conclude in the necessity voice (`must be` /
`must stay`), never a bare state-of-being verb. The plan SHALL complete the
board, falling back to a single forced cell from the line solver where no named
technique groups one.

`hint` SHALL refuse with an error string when the board is already solved or when
`findMistakes` reports mistakes (the refusal lighting the mistake overlay and the
banner). `hintKeepTrack` SHALL return `"completed"` when the player fills the
last forced cell of the displayed step with the correct value, `"onTrack"`
(shrinking the step to the remaining cells) on partial progress, and `"off"`
otherwise.

#### Scenario: A hint explains a forced line deduction

- **WHEN** `hint` is called on an unsolved, mistake-free board with at least one
  deducible cell
- **THEN** it returns a step whose move fills every cell that one line technique
  forces, and whose explanation names the clue/pattern and concludes that those
  cells must be black (or must be white)

#### Scenario: The plan solves the board

- **WHEN** the full hint plan for any generated board is applied step by step
- **THEN** the board reaches its unique solution

#### Scenario: A hint refuses on a wrong board

- **WHEN** `hint` is called while `findMistakes` reports at least one mistake
- **THEN** it returns `{ ok: false }` with a message and the mistaken cells are
  highlighted

### Requirement: Pattern hint colour legend

The displayed hint SHALL render forced cells in `COL_HINT` as a highlight only,
never pre-filling the black/white mark the move would place (the cell's own
state stays visible and the narration says which colour). Premise elements SHALL
follow the stable element-type colour legend, each colour paired with a
non-colour cue and never named in the narration text: the reasoned-about line's
clue and line of sight shaded `COL_HINT_CELL`; a cited already-placed **black**
cell ringed `COL_HINT_BLACKREF` (teal) and a cited **white** cell ringed
`COL_HINT_WHITEREF` (violet), so a ring never hides the cell's own colour. Hint
overlay bits SHALL be folded into the per-cell render cache key so they repaint
on the frame they are shown.

#### Scenario: Forced cells are highlighted, not pre-filled

- **WHEN** a hint step targeting cells the player must mark black is displayed
- **THEN** those cells are drawn with the `COL_HINT` highlight and their prior
  (undecided) state is still visible — the black mark is not pre-rendered

#### Scenario: Premise marks are ringed by their colour

- **WHEN** a hint cites an already-placed black cell and an already-placed white
  cell as evidence
- **THEN** the black cell is ringed in the black-reference colour and the white
  cell in the white-reference colour, each leaving the cell's own colour visible
