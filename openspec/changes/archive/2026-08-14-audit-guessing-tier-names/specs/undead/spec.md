# undead Specification Delta — audit-guessing-tier-names

Undead's top tier is renamed `Tricky` → `Unreasonable`, and its hint stops
narrating the rung that tier is made of.

`forcingPass` hypothesises a candidate and runs the whole arc-consistency +
counting **fixpoint** from it — a *Search* under design D9, the same shape as
Galaxies' deleted `refuteAssoc` — and it is the rung that separates the top tier
from the one below, with nothing above it. So the tier takes the name and the
hint refuses rather than narrating it.

**This corrects a conclusion `strengthen-undead-deduction` stated and this
capability then recorded as a requirement.** That change measured the
*recursion-only* residual at zero and concluded the ladder needs no
`Unreasonable` tier. The measurement is sound and still holds — no Undead board
needs nested hypothesising — but it answers a different question from whether
rung 3 propagates, and rung 3 propagates. **A measurement can be correct and
still not support the sentence it was used to write.**

The difficulty character `t` is unchanged, so game IDs, saved games and shared
links are unaffected, and no board moves: the solver keeps `forcingPass`, so the
generator grades on it exactly as before, and only the recorder lost it.

## MODIFIED Requirements

### Requirement: Undead game implements the Game interface

The engine SHALL provide a registered `undead` game implementing
`Game<UndeadParams, UndeadState, UndeadMove, UndeadUi, UndeadDrawState,
UndeadMistake>`: a grid in which every cell is either a fixed diagonal mirror
(`\` or `/`) or a monster cell, and the player places one of three monsters —
Ghost, Vampire, or Zombie — in every monster cell. Params SHALL be `w`, `h`, and
`diff` (Easy, Normal, or `Unreasonable`), encoded `{w}x{h}` without `full` and
`{w}x{h}d{c}` with `full` (`c` = `e`/`n`/`t`), with the upstream preset list. The
top tier is named `Unreasonable` rather than upstream's `Tricky` because its
boards can require the forcing rung, which runs the deduction fixpoint from a
hypothesis; its difficulty character stays `t`, so an existing game ID names the
same board. `validateParams` SHALL require `w ≥ 3`, `h ≥ 3`, `w·h ≤ 54`, and a
known difficulty. The game SHALL report `wantsStatusbar = false`,
`isTimed = false`, `canSolve = true`, `canFormatAsText = true`, and
`canMarkAll = true`.

#### Scenario: Params round-trip

- **WHEN** params `{ w: 5, h: 5, diff: "tricky" }` are encoded with `full = true`
- **THEN** the result is `5x5dt`
- **AND** decoding it round-trips the params
- **AND** encoding with `full = false` yields `5x5`

#### Scenario: Invalid params are rejected

- **WHEN** `validateParams` is called with `w < 3`, `h < 3`, `w·h > 54`, or an
  unknown difficulty
- **THEN** it returns a non-null error string

### Requirement: Undead solves and generates uniquely-solvable graded boards

`newDesc` SHALL generate a grid of random mirrors and monster cells (rejecting grids
that are too sparse, too dense, or have an over-long sightline), seed unique-solution
sightlines until a difficulty-dependent fraction of the grid is determined, fill the
remainder with random monsters, and grade the board by **which rung of the deductive
ladder is required** (arc-consistency / counting / forcing). Every generated board
SHALL be uniquely solvable (verified against the brute-force oracle).

Every board Undead accepts SHALL be solvable by the deductive ladder alone — **zero
guessing or recursion** — per the fork's guess-free generation policy. A board that
requires recursion (nested hypothesising) SHALL be rejected at generation.

Undead's top tier is named **`Unreasonable`**, because the forcing rung that
defines it hypothesises a candidate and runs the arc-consistency + counting
fixpoint from it. That is not nested recursion — the re-grade measurement
(≈6,800 candidate boards across all tiers) found a **zero** uniquely-solvable
recursion residual, and that finding stands — but it is a search from the
player's side, and the policy reserves the name for exactly that. The two lower
tiers remain plain deduction.

#### Scenario: Generated board is unique and on-difficulty

- **WHEN** `newDesc` returns a board for a given size and difficulty
- **THEN** the deductive ladder solves it uniquely with no recursion
- **AND** the board's grade matches the highest rung the ladder needed (Easy =
  arc-consistency within the pass cap, Normal = arc beyond the cap or counting,
  `Unreasonable` = forcing)
- **AND** the brute-force oracle confirms exactly one solution

#### Scenario: Every tier is free of nested recursion

- **WHEN** any board is accepted for any tier (Easy, Normal, `Unreasonable`)
- **THEN** the deductive ladder (arc-consistency + counting + depth-1 forcing) solves
  it to completion without invoking the brute-force/recursive search

#### Scenario: Renaming the tier moves no board

- **WHEN** a board is generated at the top tier from a given seed
- **THEN** the description is identical to the one that seed produced before the
  rename, because the solver retains the forcing rung and only the hint's
  recorder lost it

#### Scenario: Recursion-only boards are rejected

- **WHEN** a candidate board is solvable only by recursion (nested hypothesising)
- **THEN** it is rejected at generation (such boards are non-unique)

#### Scenario: Solve fills the unique solution

- **WHEN** `solve` is invoked on a freshly generated game
- **THEN** it returns a move that places every monster at its unique-solution type

### Requirement: Undead explained deduction hint

The hint SHALL be **purely deductive**: it SHALL NOT reveal the known solution and
SHALL NOT narrate a guess or backtracking search. **The forcing rung is such a
search** — it assumes a candidate and runs the arc-consistency + counting fixpoint
from it — so the hint's recorder SHALL NOT emit it **on any tier**, while the
solver retains it so that grading and generation are unchanged.

The consequence SHALL be stated rather than hidden: on an `Unreasonable` board the
plan stops where deduction stops, and the hint refuses with a message saying so.
A hint that still solved every `Unreasonable` board would mean the rung had come
back; the game's tests SHALL assert **both** bounds — that such a plan never
reaches a solved board, and that it is not empty from the first move — so neither
failure mode passes quietly. The two lower tiers are unaffected: a freshly
computed plan still solves them from empty, and following hints one move at a
time still reaches a solved board.

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

#### Scenario: The forcing rung never reaches a narration

- **WHEN** hint plans are recorded across every tier and many seeds
- **THEN** no recorded deduction is a forcing one, on any tier

#### Scenario: An Unreasonable board's hint stops rather than searching

- **WHEN** a player follows hints one move at a time on an `Unreasonable` board
- **THEN** the hints continue while deduction does, and then refuse with a
  message saying deduction has run out
- **AND** the plan neither reaches a solved board nor is empty from the start

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
