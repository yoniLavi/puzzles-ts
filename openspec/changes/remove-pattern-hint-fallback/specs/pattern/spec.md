# pattern Specification (delta)

## MODIFIED Requirements

### Requirement: Pattern provides an explained, deductive hint

Pattern SHALL implement the Hint System hooks (`hint`, `hintKeepTrack`, and
rendering of the displayed step) to the explained-hint quality bar: each hint
SHALL teach *why* the move is forced by a recognisable nonogram line technique
(run overlap, line completion, unreachable gap, edge/anchor extension, or the
general single-line **intersection** — the cells forced in *every* arrangement of
one line's runs consistent with its marks), not merely state the move. Because the
generator accepts only boards uniquely solvable by the per-line solver with no
guessing, every shipped board is pure-deduction solvable and the hint SHALL never
reveal the stored solution or run a search.

A single line deduction that forces several cells SHALL be emitted as **one**
multi-cell `HintStep` whose move fills all of them (one firing = one step), with
each technique's forced set a single colour so the step is understandable at a
glance. The narration SHALL lead with the indication (the clue and the spotted
pattern, in board terms) and conclude in the necessity voice (`must be` /
`must stay` / `are always`), never a bare state-of-being verb.

Every displayed step SHALL name a technique — the hint SHALL NOT emit a generic,
unexplained step (e.g. *"only one arrangement fits"*) for a deduction its named
techniques do not group. Where the elegant techniques do not cover a forced cell,
the plan SHALL narrate the general single-line **intersection** as an honest
deductive bottom rung (*"whichever way this line's runs fit, these cells are
always black / stay white"*); being the per-line solver's own fixpoint restricted
to one line, that rung always exists for a generated board, so the plan completes
without any un-narrated step. Generation is untouched, so Pattern's byte-match
differential against the C reference is retained.

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

#### Scenario: No hint step is a generic un-narrated fallback

- **WHEN** the full hint plan is computed for any generated board
- **THEN** every step carries a named line technique (overlap, completion,
  unreachable, edge/anchor, or the single-line intersection bottom rung)
- **AND** no step carries a generic "only one arrangement fits" explanation

#### Scenario: The plan solves the board

- **WHEN** the full hint plan for any generated board is applied step by step
- **THEN** the board reaches its unique solution

#### Scenario: A hint refuses on a wrong board

- **WHEN** `hint` is called while `findMistakes` reports at least one mistake
- **THEN** it returns `{ ok: false }` with a message and the mistaken cells are
  highlighted
