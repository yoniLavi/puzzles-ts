## ADDED Requirements

### Requirement: Undead explained deduction hint

The `undead` game SHALL implement `hint(state, aux?, ui?)`,
`hintKeepTrack(move, step, state)`, and `refreshHintStep(step, state)`, producing an
**explained** plan-carrying hint that meets the fork's hint quality bar (the Hint
System requirements in the `ts-engine` spec and the Palisade exemplar): each step
narrates *why* a marking is forced, one deduction firing is emitted as one
(possibly multi-leg) journey, and equivalent markings share a colour.

Undead is a candidate-elimination (pencil-note) game but **not** a Latin-square game:
its deductions derive from the mirror-bouncing **sightline clues** and the **monster
totals** via its own iterative solver, not from the shared Latin candidate cube. The
hint SHALL recompute its plan from the current board state so it makes progress from
any mid-game position reachable by the player (the cross-game resume guarantee).

The hint's working candidate state SHALL be seeded from the **placed grid only**
(fixed cells plus the player's real monster placements); it SHALL NOT treat the
player's pencil notes as facts, since a note may contradict the solution. Notes are
used only to decide which already-valid deduction to surface and to render.

The plan builder SHALL, on a mistake-free board, prefer in order: a **naked single**
(a cell whose surviving candidates are a single monster) as a placement; else a
**total-exhaustion** strike (a monster type whose full count is already placed,
struck from every still-undecided cell) as one journey; else a **sightline
elimination** (a path whose two count clues rule a monster out of one or more of its
cells), emitted as one journey with one leg per affected cell and the whole sightline
shaded as the evidence area; else a **forcing** elimination (a candidate that, if
hypothesised, forces an immediate contradiction); else a forced **placement**. A lazy
populate (reusing the existing fill-all move) SHALL be emitted only when an
elimination first needs notes to strike.

The hint SHALL be **purely deductive**: it SHALL NOT reveal the known solution and
SHALL NOT narrate a guess or backtracking search. Its guarantee of always reaching a
solved board from any mistake-free position rests on `strengthen-undead-deduction`
making every shipped non-`Unreasonable` tier solvable by the deductive ladder
(arc-consistency + counting + depth-1 forcing). Only on a sanctioned `Unreasonable`
tier (if one is shipped) MAY a hint be non-deductive.

The hint SHALL refuse with `{ ok: false, error }` when the board is already solved or
when `findMistakes` reports any contradiction (lighting the mistake overlay through
the existing refusal coupling). The narration SHALL teach the sighting rule —
vampires counted before the beam first reflects, ghosts only after it has bounced,
zombies anywhere along it — and SHALL read correctly at the degenerate clue values
(a count of zero up to the line's full monster count). Conclusions SHALL use the
necessity voice (a strike "must cross out …", a placement "can only be …").

The game's move set SHALL include a `pencilStrike` move that atomically clears a list
of candidate bits across cells (idempotent and resume-safe), used by the hint for a
multi-strike firing; the single-bit `pencil` toggle and the fill-all `markAll` move
are unchanged. The hint SHALL NOT add an auto-pencil preference and SHALL ignore the
optional `ui` argument, because Undead has no trivial (non-teachable) elimination to
fold away.

The hint SHALL render with `COL_HINT` (placement target / acted-on marking) and
`COL_HINT_CELL` (sightline evidence shade) appended to the palette, following the
element-type colour legend: the placement target is a solid `COL_HINT` fill with no
pre-rendered monster glyph; a struck candidate is drawn in its normal pencil colour
with a strikethrough on a non-`COL_HINT` background so it stays legible; the sightline
evidence is shaded `COL_HINT_CELL`. The hint signature SHALL be folded into the
per-cell draw-state cache so the overlay repaints and clears correctly.

`findMistakes` and the quick-save / Check-&-Save coupling are unchanged: an empty
cell whose non-empty notes exclude the solution monster is already a `note` mistake,
so a hint refused for mistakes highlights those cells for free.

#### Scenario: A sightline elimination is taught as one journey

- **WHEN** a player asks for a hint on a mistake-free Undead board where a path's
  count clues rule a monster value out of one or more of the path's cells, and no
  naked single or total exhaustion is available
- **THEN** the hint returns a journey whose legs strike that monster from those cells
  (one leg per cell, continuation legs flagged `continuesPrevious`), every struck mark
  lying on the narrated path
- **AND** the explanation names the sightline and its clue and explains the
  mirror-sighting rule that forces the elimination
- **AND** the whole sightline is shaded as the evidence area while each leg targets a
  single cell

#### Scenario: Total exhaustion is narrated honestly, not as a sightline

- **WHEN** every monster of one type permitted by the totals is already placed and an
  undecided cell still lists that monster as a candidate
- **THEN** the hint emits a `total` strike of that monster from every still-undecided
  cell as one journey, explaining that the type's full count is already placed
- **AND** the narration does not claim a sightline forced the elimination

#### Scenario: Naked single is surfaced first as a placement

- **WHEN** an undecided cell's surviving candidates have collapsed to a single monster
- **THEN** the hint places that monster (a `set` move) before any elimination step,
  explaining that only that monster keeps the cell consistent

#### Scenario: The plan reaches a solved board from any mistake-free position

- **WHEN** a hint is asked repeatedly from a mistake-free board on any shipped
  non-`Unreasonable` tier — each time applying only the first step and recomputing
- **THEN** every hint makes progress (never a no-op and never "give up") and the
  sequence reaches the solved board using only deductive steps (no solution reveal,
  no guess)

#### Scenario: The hint refuses on a solved or contradictory board

- **WHEN** a hint is requested on an already-solved board, or on a board where
  `findMistakes` reports a contradiction
- **THEN** the hint returns `{ ok: false, error }` and (for the mistake case) the
  mistake overlay highlights the offending cells
