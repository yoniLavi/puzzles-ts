# ts-engine spec delta

## MODIFIED Requirements

### Requirement: The engine supports an ephemeral Hint System

The engine SHALL support a UI-only, ephemeral Hint System built on **plans**.
The `Game` interface SHALL define an optional `hint(state, aux?)` method returning
a non-empty ordered plan of `HintStep`s — each a move plus a human-readable
explanation and optional visual highlights, narrated for the state that step
applies to (`HintResult`). The optional second argument `aux` is the generator's
solution hint (upstream `aux_info`), the same value passed to `solve`; the
`Midend` SHALL pass its stored `aux` so a game whose best hint derives from the
known solution can use it when present (and fall back otherwise), while deductive
games ignore it. The `Midend` SHALL store the whole plan plus a current-step index
in `activeHint` (midend-only, never in game state, never persisted), SHALL display
**at most** one step at a time (the displayed step is passed to the game's `redraw`
and its explanation appended to the status bar; a stored plan MAY be hidden,
displaying nothing), and SHALL recompute a plan only when no valid plan is stored.

Plan lifecycle:
- `midend.hint()` SHALL re-display the stored plan's current step (no
  recompute, no advance) while a plan is active, and SHALL compute and store
  a fresh plan at index 0 otherwise.
- `midend.executeHint()` SHALL execute the current step of the stored plan
  (computing a plan first if none is stored), keep that step displayed through
  the move's animation, and advance to the next step — displayed, as the
  auto-play preview — when the animation settles.
- A player move while a plan is active SHALL be classified by the game's
  `hintKeepTrack(move, currentStep, state)` verdict, whether or not the plan
  is currently displayed: `"completed"` advances the plan to the next step
  and **hides the display** (the user asks again to see the next step — one
  hint per request in manual play) — unless the next step is flagged
  `continuesPrevious` (the continuation of a journey the completed step
  previewed, e.g. the "then to column 5" leg), in which case the display
  SHALL stay on and transition to that step: a journey is presented as one
  hint and stays on screen through its legs. `"onTrack"` keeps the current
  step displayed (the game MAY adjust the step's move in place to reflect
  partial progress), and `"off"` drops the plan. A game returning
  `"completed"` is asserting that the resulting state matches the plan's
  expectation, so the remaining steps stay valid.
- The plan SHALL be cleared on undo, redo, restart, new game, solve, when the
  last step completes, and when the board reaches the solved state.

**Hint-authoring convention — one deduction firing = one journey.** When a
game's `hint()` derives its plan from a solver/deduction engine, a **single
logical deduction that forces more than one move** (e.g. a coupled pair of
edges, or a clue that simultaneously resolves several of its sides) SHALL be
emitted as **one journey**: an ordered run of `HintStep`s whose first leg
carries the full explanation of the deduction (and SHOULD surface the whole set
visually, e.g. the other forced moves as sibling highlights) and whose
subsequent legs are flagged `continuesPrevious` with abbreviated narration.
Distinct deductions remain separate hints (the first leg of each is
unflagged, so the user asks again to see the next deduction). This keeps the
manual flow ("clear this one, then the rest" stays on screen through its legs)
and the auto-play flow (the legs animate back-to-back as one multi-part move)
consistent across every game whose hints group naturally.

A non-deductive game (no technique to teach) MAY instead derive its plan from
the known solution via `aux`: it is a legitimate hint strategy to walk the
player to the unique solution. Such a game SHOULD prefer the `aux`-derived plan
when `aux` is present (guaranteeing the plan completes) and MAY fall back to a
local heuristic when it is absent.

#### Scenario: Requesting a hint from the midend

- **WHEN** the user requests a hint via `midend.hint()` with no active plan,
  on a game that implements the `hint` method
- **THEN** the midend computes a plan once, stores it with index 0, appends
  the first step's explanation to the status bar, and schedules a repaint

#### Scenario: The midend passes the solution hint to the game

- **WHEN** the midend computes a hint plan for a game whose puzzle was freshly
  generated (so `aux` is stored)
- **THEN** it calls `game.hint(state, aux)` with that stored `aux`
- **AND** a game that derives its plan from the solution produces a plan that
  reaches the solved state, while a game that ignores `aux` is unaffected

#### Scenario: Following a hint manually shows one step per request

- **WHEN** the user makes a move that completes the displayed hint step
  (`hintKeepTrack` returns `"completed"`) and the next step is not a
  journey continuation
- **THEN** the midend advances the stored plan without recomputing and hides
  the hint display (no explanation, no highlights)
- **WHEN** the user requests a hint again via `midend.hint()`
- **THEN** the already-advanced current step is displayed instantly, still
  without recomputing the plan

#### Scenario: A multi-leg journey stays displayed through its legs

- **WHEN** the displayed step previews a journey continuation ("Move tile 10
  to row 2, then to column 5") and the user's move completes the first leg
- **THEN** the midend advances to the flagged continuation step and keeps the
  hint displayed, narrating the second leg, without a fresh hint request
- **WHEN** the journey's final leg completes and the following step is not a
  continuation
- **THEN** the display hides and the next step waits to be asked for

#### Scenario: A multi-move deduction is grouped into one journey

- **WHEN** a game's `hint()` derives a step from a single deduction that forces
  more than one move
- **THEN** those moves are returned as a contiguous run of `HintStep`s whose
  first leg is unflagged and carries the full deduction explanation, and whose
  remaining legs each set `continuesPrevious` to `true`
- **AND** completing one leg manually keeps the hint displayed and transitions
  to the next leg, while the next *distinct* deduction's first leg waits to be
  asked for

#### Scenario: An off-plan move drops the plan

- **WHEN** the user makes a move for which `hintKeepTrack` returns `"off"`
  (or undoes, redoes, restarts, or starts a new game) while a plan is active
- **THEN** the midend clears `activeHint`, redraws without hint visuals, and
  the next hint request computes a fresh plan

#### Scenario: Auto-play executes the stored plan

- **WHEN** `executeHint()` is called repeatedly while a stored plan has
  remaining steps
- **THEN** each call executes the plan's current step verbatim — `hint()` is
  not recomputed per step — and the plan advances at each animation settle,
  displaying the next step as the auto-play preview and clearing after the
  final step
