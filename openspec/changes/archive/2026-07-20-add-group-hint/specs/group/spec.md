# group Specification (delta)

## ADDED Requirements

### Requirement: Group provides an explained deduction hint

The game SHALL implement `hint(state, aux?, ui?)`, returning a plan of
`HintStep`s that teaches the player the next deduction, working in a sound
candidate cube **seeded from the placed entries only — never from the player's
pencil notes** (a note can be wrong; that is what `findMistakes` flags). The plan
is built by walking a working copy of the board the way a person solves it,
preferring at each step:

1. a **naked single** — an empty cell whose live notes have collapsed to a single
   candidate — placed via a `set` move; else
2. (after a lazy **populate** step that fills every empty cell's candidate notes
   via the fill-all `pencil` move, emitted only when some empty cell lacks notes)
   the **basic Latin** row/column eliminations a placed value implies, struck via a
   `pencil` move; else
3. **Group's own deduction** — one of:
   - an **associativity placement**: for some `a,b,c` the player has filled `a·b`,
     `b·c` and `(a·b)·c`, so the cell `a·(b·c)` is forced to that same value (since
     `(a·b)·c = a·(b·c)` in every group); placed via a `set` move; or
   - an **identity-row/column fill**: once the identity `e` is known (a filled
     `a·b = a` reveals `b = e`), the identity's whole row and column are the
     element labels — emitted as one journey filling those cells; or
   - an **identity-mark elimination** (identity-hidden mode): a filled `a·b` that
     equals neither `a` nor `b` proves neither is the identity, ruling out the
     identity marks — struck via a `pencil` move; else
4. a forced generic **placement** — a **naked single** (the cell's own candidates
   collapsed to one) or a **hidden single** (a value that fits only one cell of a
   row or column, the cell still showing several candidates), narrated and
   highlighted by *which* it is (the recorded reason conflates them, so the *why*
   is re-derived from the working board).

Each step SHALL carry a narration meeting the hint quality bar — leading with the
spotted indication, then the reasoning, then a necessity-voice conclusion — and
SHALL refer to each cell by the element letter it shows. The **associativity**
step SHALL state the actual triple and the three known products that force the
fourth (teaching the technique, not merely pointing at the cell). A single
deduction *firing* that forces several cells (the identity fill) SHALL be one
journey (continuation legs flagged `continuesPrevious`), and equivalent
placements of one firing SHALL share the target hint colour.

The hint SHALL refuse (`{ ok: false, error }`) when the board is solved or when
`findMistakes` is non-empty, and refusal SHALL light the mistake overlay through
the engine's refusal→`findMistakes` coupling. The deduction SHALL be capped below
recursion (a guess is not a teachable step); when no forced move exists below
recursion the hint SHALL refuse honestly rather than invent one.

Every step SHALL be monotone progress (a note added by populate, a note removed by
a strike, or a cell filled by a placement — never undone by the hint), so a
freshly-recomputed hint from any solvable, mistake-free mid-game position SHALL
make progress and lead to a solved board (the cross-game resume guarantee); on
recompute the plan SHALL skip any operation already reflected on the board.
`hintKeepTrack` SHALL advance the plan when the player's move matches the displayed
step's intent (a `set` of the hinted value is `completed`; a `pencil` strike
clearing a subset of the step's marks is `onTrack` or `completed`) — otherwise drop
the plan (`off`). `refreshHintStep` SHALL drop a stored step's dead marks (or
resolve the step) before each (re-)display so a kept plan never tells the player to
act on something already resolved.

The solver's recording mode SHALL be gated so that with recording off the
generator/solve path is **byte-for-byte unchanged** (verified by the existing
frozen `group-c-reference.json` differential), and one recorded deduction *firing*
SHALL map to exactly one `group` so a hint step never mixes deductions.

#### Scenario: Associativity forces a placement and the hint teaches why

- **WHEN** the player asks for a hint on a board where `a·b`, `b·c` and `(a·b)·c`
  are filled but `a·(b·c)` is not
- **THEN** the hint returns a `set` step placing `a·(b·c)` to the value of
  `(a·b)·c`
- **AND** the narration names the three known products and states that
  `(a·b)·c = a·(b·c)` forces the fourth
- **AND** the three known-product cells are shaded as evidence and the target cell
  is ringed in the hint colour

#### Scenario: The identity's row and column are filled as one journey

- **WHEN** the hint has just learned which element is the identity (from a filled
  `a·b = a`)
- **THEN** the placements filling the identity's row and column are emitted as a
  single multi-leg journey (continuation legs flagged `continuesPrevious`), not as
  separate hints

#### Scenario: Identity-hidden mode rules out an identity mark

- **WHEN** a hint is requested on an identity-hidden board where a filled `a·b`
  equals neither `a` nor `b`
- **THEN** the hint returns a `pencil` step striking the identity marks of `a` and
  `b`, narrated as "neither can be the identity"

#### Scenario: The hint resumes from a self-played mid-game position

- **WHEN** a hint is requested from a solvable, mistake-free board the player
  reached by their own placements
- **THEN** the freshly-recomputed hint makes progress and, applied step by step
  with recompute, leads to a solved board

#### Scenario: The hint refuses on a board with mistakes

- **WHEN** a hint is requested while `findMistakes` is non-empty
- **THEN** the hint refuses and the engine lights the mistake overlay
