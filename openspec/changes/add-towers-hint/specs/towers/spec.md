# towers Specification (delta)

## MODIFIED Requirements

### Requirement: Towers checks for mistakes against the unique solution

The game SHALL implement `findMistakes`: it re-solves the board from its
immutable clues and givens to the unique solution — deriving that solution from
the placed givens/entries **only**, never from the player's pencil notes — and
returns every player marking that contradicts it, as two kinds:

- a **filled cell** (`kind: "cell"`) whose entered tower height differs from the
  solution height; and
- a **pencil-note cell** (`kind: "note"`) whose **non-empty** candidate set does
  **not** contain that cell's solution height — i.e. the player has crossed out
  the correct height.

A note set that merely contains extra, non-solution candidates SHALL NOT be
reported (that is ordinary mid-solve state); only a non-empty note set that
*excludes* the truth is a mistake. Both kinds SHALL render as the same red cell
overlay. When the board is not uniquely solvable from the givens, `findMistakes`
SHALL return an empty result.

Because Check-&-Save gates the quick-save on `findMistakes`, a board carrying an
invalid note (one that has eliminated the correct height) SHALL be refused a
quick-save with the offending cells highlighted and the prior checkpoint left
intact, exactly as a wrong filled cell is.

#### Scenario: A wrong tower is flagged

- **WHEN** the player enters a tower height that contradicts the unique solution
- **THEN** `findMistakes` includes that cell with `kind: "cell"`

#### Scenario: A note that excludes the correct height is flagged

- **WHEN** an empty cell carries pencil notes that do not include the cell's
  solution height
- **THEN** `findMistakes` includes that cell with `kind: "note"`

#### Scenario: A note with extra candidates is not a mistake

- **WHEN** an empty cell carries pencil notes that *do* include the solution
  height, alongside other (incorrect) candidates
- **THEN** `findMistakes` does not include that cell

#### Scenario: Check-&-Save refuses a board with an invalid note

- **WHEN** the player activates Check-&-Save on a board where a cell's notes have
  crossed out the correct height
- **THEN** the quick-save is refused, the offending cell is highlighted, the
  prior checkpoint remains intact, and the mistake count is reported

## ADDED Requirements

### Requirement: Towers provides an explained, pencil-notes-based deduction hint

The game SHALL implement `hint(state, aux?)` and `hintKeepTrack(...)`, delivering
an explained hint that teaches Towers' candidate-elimination reasoning by setting
and striking pencil notes. The hint SHALL be the solver's own narrated deduction
script: `hint` runs the *recording* solver on a sound candidate cube **seeded
from the placed grid only** (never from the player's notes) and expresses the
resulting ordered operations against the player's live notes + grid as a sequence
of `HintStep`s of three kinds:

- a **populate** step (emitted only when some empty cell lacks notes) that fills
  every empty cell's candidate marks, via the existing fill-all (`pencilAll`)
  move;
- one or more **eliminate** steps, each a single technique *firing* that strikes
  the candidate(s) that firing rules out (a multi-cell firing is one step bearing
  a single `pencilStrike` move that clears those bits); and
- **place** steps that fill a cell whose sound candidates have collapsed to one.

The hint SHALL be expressed the way a person solves: at each step it SHALL prefer
a **naked single** — an empty cell whose live notes have collapsed to a single
candidate (sound on a mistake-free board, since that lone candidate is then the
solution) — ahead of any further elimination; otherwise the next clue elimination;
otherwise a forced placement. The trivial row/column ("this number already sits in
this line") eliminations a placement implies SHALL be governed by the auto-pencil
preference (below): with it on they are folded silently into the placement and not
emitted as steps; with it off they are taught as an explicit `continuesPrevious`
strike continuation. `hint` SHALL receive the game UI so it can read that
preference.

Each step SHALL carry a narration that meets the hint quality bar — leading with
the spotted indication (the clue/line pattern), then the reasoning, then a
necessity-voice conclusion — and a highlight that shades the **driving clue
cell(s)** and their line of sight (`COL_HINT_CELL`) so the player can see which
clue the hint is about, marks the target cell(s)/struck candidate(s)
(`COL_HINT`), with equivalent strikes of one firing sharing the target colour.
The hint SHALL refuse (`{ ok: false, error }`) when the board is solved or when
`findMistakes` is non-empty, and refusal SHALL light the mistake overlay through
the engine's existing refusal→`findMistakes` coupling.

Every step SHALL be monotone progress (a note added by populate, a note removed by
eliminate, or a cell filled by place — never undone by the hint), so a
freshly-recomputed hint from any solvable, mistake-free mid-game position SHALL
make progress and lead to a solved board (the cross-game resume guarantee). On
recompute the script SHALL skip any operation whose effect is already on the
board and resume at the first that is not. `hintKeepTrack` SHALL advance the plan
when the player's move matches the displayed step's intent — a `pencilStrike`
clearing a subset of the step's marks is `onTrack` (the step shrinks in place) or
`completed` (the last is struck); a placement of the hinted value is `completed`
— and otherwise drop the plan to recompute (`off`).

The solver's recording mode SHALL be gated so that with recording off the
generator's solve path is byte-for-byte unchanged (verified by the existing C
differential), and the hint fixpoint SHALL be guarded by a step budget.

#### Scenario: A clue elimination is taught as a note strike

- **WHEN** the player asks for a hint on a fully-pencilled board where a clue
  line-of-sight deduction rules a height out of one or more cells
- **THEN** the hint returns a step whose `pencilStrike` move clears exactly those
  candidates
- **AND** the narration names the clue pattern and states why those heights
  cannot sit there, concluding in the necessity voice
- **AND** the driving clue's line of sight is shaded and the struck candidates
  are marked in the hint colour

#### Scenario: An empty board is populated before elimination

- **WHEN** the player asks for a hint on a board with no pencil notes
- **THEN** the first step fills the empty cells' candidate notes (the fill-all
  move)
- **AND** subsequent steps strike candidates and place cells

#### Scenario: A collapsed cell is placed

- **WHEN** a cell's sound candidate set has collapsed to a single height
- **THEN** the hint returns a `set` step placing that height, narrating that every
  other height is ruled out there

#### Scenario: The hint resumes from a self-played mid-game position

- **WHEN** a hint is requested from a solvable, mistake-free board the player
  reached by their own notes and placements
- **THEN** the freshly-recomputed hint makes progress (a strike or a placement)
  and, applied step by step with recompute, leads to a solved board

#### Scenario: The hint refuses on a board with mistakes

- **WHEN** a hint is requested while `findMistakes` is non-empty (a wrong tower or
  a note that excludes the truth)
- **THEN** the hint refuses with an explanatory message and the mistaken cells are
  highlighted

#### Scenario: A naked single is offered ahead of further elimination

- **WHEN** a hint is requested on a mistake-free board where some empty cell's
  pencil notes have collapsed to a single candidate
- **THEN** the next step places that height in that cell

### Requirement: Towers auto-pencils row/column eliminations on placement

The game SHALL provide an **auto-pencil** preference, **on by default**: when the
player places a tower height, the game SHALL strike that height from the pencil
marks of every other cell in the same row and column. The decision SHALL be fixed
at move-creation time (recorded on the move) so that replaying a saved game is
deterministic regardless of the preference's later value. When the preference is
off, a placement SHALL leave other cells' pencil marks untouched (upstream
behaviour). The preference SHALL also govern the hint: with it on, the hint folds
the implied row/column eliminations into the placement; with it off, the hint
teaches them as explicit strikes.

#### Scenario: Placing a tower clears matching notes in its line

- **WHEN** auto-pencil is on and the player places height `n` in a cell
- **THEN** every other empty cell in that cell's row and column loses candidate `n`
  from its pencil marks
- **AND** cells sharing neither the row nor the column keep candidate `n`

#### Scenario: Auto-pencil off leaves notes untouched

- **WHEN** auto-pencil is off and the player places a height
- **THEN** no other cell's pencil marks change
