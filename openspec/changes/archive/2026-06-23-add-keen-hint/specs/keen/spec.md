# keen Specification (delta)

## ADDED Requirements

### Requirement: Keen provides an explained deduction hint

The game SHALL implement `hint(state, aux?, ui?)`, returning a plan of
`HintStep`s that teaches the player the next deduction in pencil-notes terms,
working in a sound candidate cube **seeded from the placed entries only — never
from the player's pencil notes** (a note can be wrong; that is what `findMistakes`
flags). The plan is built by walking a working copy of the board the way a person
solves it, preferring at each step:

1. a **naked single** — an empty cell whose live notes have collapsed to a single
   candidate (sound on a mistake-free board, since that candidate is then the
   solution) — placed via a `set` move; else
2. (after a lazy **populate** step that fills every empty cell's candidate notes
   via the existing fill-all `pencilAll` move, emitted only when some empty cell
   lacks notes) the **basic Latin** row/column eliminations a placed value implies,
   struck via `pencilStrike`; else
3. the next **cage elimination** — the per-cage arithmetic deduction (no layout of
   the cage's digits consistent with its clue leaves a candidate possible in a
   cage cell; or, at the harder level, a digit required in the cage along a
   row/column ruled out elsewhere in that line) — a single technique *firing*
   striking the candidate(s) it rules out, via one or more `pencilStrike` moves
   linked as one journey; else
4. a forced **placement** — either a **naked single** (the cell's own candidates
   have collapsed to one) or a **hidden single** (a digit that fits only one cell of
   a row or column, the cell itself still showing several candidates), narrated and
   highlighted by *which* it is (the recorded reason conflates them, so the *why* is
   re-derived from the working board): a naked single concludes "every other number
   has been ruled out in this cell", a hidden single names its line ("in this
   row/column, N can go in only this cell") and shades the whole line as evidence.

Each step SHALL carry a narration meeting the hint quality bar — leading with the
spotted indication (the cage, named by its arithmetic clue), then the reasoning,
then a necessity-voice conclusion ("must cross out the N" for an elimination, "can
only be N" for a placement). A single cage firing forcing several strikes SHALL be
one journey (continuation legs flagged `continuesPrevious`), and equivalent strikes
of one firing SHALL share the target hint colour.

The trivial row/column eliminations a placement implies SHALL be governed by the
auto-pencil preference (read from `ui`): with it on they are folded silently into
the placement; with it off they are taught as explicit `continuesPrevious` strike
continuations.

The hint SHALL refuse (`{ ok: false, error }`) when the board is solved or when
`findMistakes` is non-empty, and refusal SHALL light the mistake overlay through
the engine's refusal→`findMistakes` coupling. The deduction SHALL be capped below
recursion (a guess is not a teachable note strike).

Every step SHALL be monotone progress (a note added by populate, a note removed by
a strike, or a cell filled by a placement — never undone by the hint), so a
freshly-recomputed hint from any solvable, mistake-free mid-game position SHALL
make progress and lead to a solved board (the cross-game resume guarantee); on
recompute the plan SHALL skip any operation already reflected on the board.
`hintKeepTrack` SHALL advance the plan when the player's move matches the displayed
step's intent — a `pencilStrike` clearing a subset of the step's marks is
`onTrack` (the step shrinks in place) or `completed`; a placement of the hinted
value is `completed` — otherwise drop the plan (`off`). `refreshHintStep` SHALL
drop a stored step's dead marks (or resolve the step) before each (re-)display so a
kept plan never tells the player to remove a candidate already gone.

The solver's recording mode SHALL be gated so that with recording off the
generator/solve path is byte-for-byte unchanged (verified by the existing C
differential), and one recorded deduction *firing* (one cage's candidate pruning,
or one digit-out-of-one-line cross-cage elimination) SHALL map to exactly one
`group` so a hint step never mixes cages.

#### Scenario: A cage elimination is taught as a note strike

- **WHEN** the player asks for a hint on a fully-pencilled board where a cage's
  arithmetic clue rules a digit out of one of its cells
- **THEN** the hint returns a step whose `pencilStrike` move clears exactly those
  candidates
- **AND** the narration names the cage by its clue (its target value and
  operation) and concludes in the necessity voice
- **AND** the cage's cells are shaded and the struck candidates marked in the hint
  colour

#### Scenario: A hidden single is named by its line, not by the cell

- **WHEN** the hint forces a placement into a cell that still shows several
  candidates, because the placed digit fits nowhere else in its row (or column)
- **THEN** the narration names the line ("in this row, N can go in only this cell")
  rather than claiming every number is ruled out in the cell
- **AND** the whole row (or column) is shaded as evidence, with the cell marked as
  the placement target

#### Scenario: An empty board is populated before elimination

- **WHEN** the player asks for a hint on a board with no pencil notes
- **THEN** the first elimination is preceded by the fill-all populate step

#### Scenario: The hint resumes from a self-played mid-game position

- **WHEN** a hint is requested from a solvable, mistake-free board the player
  reached by their own notes and placements
- **THEN** the freshly-recomputed hint makes progress and, applied step by step
  with recompute, leads to a solved board

#### Scenario: The hint refuses on a board with mistakes

- **WHEN** a hint is requested while `findMistakes` is non-empty
- **THEN** the hint refuses and the engine lights the mistake overlay
