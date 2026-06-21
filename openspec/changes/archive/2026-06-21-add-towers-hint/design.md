# Design: Towers hint + pencil notes as first-class markings

## Context

Towers' deductions are candidate eliminations; the solver's candidate cube *is*
a notes representation. The owner directed (this session) that pencil notes be
treated consistently with placed values in every other game — Check-&-Save
rejects invalid notes — and that the hint/animation drive the board by
**setting and striking notes**, with the solver working through its **own**
notes copy. This document records the model and the decisions that were genuinely
contested or have tuning latitude.

## The soundness boundary (non-negotiable)

The solver's working cube is **seeded from the placed grid only** (givens +
entered heights), via the existing `LatinSolver.alloc(grid)`. The player's notes
are **never** fed in as deduction inputs. Rationale: a note can be wrong — the
player can cross out the correct height (Check-&-Save's whole job is to flag
that) — and feeding a wrong note back as a fact would let the solver "prove"
nonsense. Notes are used only to (a) decide which already-true elimination to
surface next and when one is done (diffing), and (b) render. Generation,
uniqueness-checking, and auto-solve receive no notes at all and are unchanged.

This is why the owner's phrase "**possibly its own copy**" is exactly right: the
solver reasons in its own sound cube, disjoint from the player's notes.

## The hint is the solver's narrated deduction script

`hint()` runs the *recording* solver from the current grid and obtains an ordered
script of operations — each an **eliminate** (cell, candidate, reason) or a
**place** (cell, value, reason) — that drives the sound cube from the current
position to the solution. The script is expressed against the player's live
state as `HintStep`s:

1. **Populate** (conditional). If any empty cell is missing candidate notes, the
   first step fills every empty cell's candidates, reusing the existing
   `pencilAll` move. Decision: **reuse `pencilAll` (full `1..w`)** rather than a
   sound Latin-reduced fill, so (a) the hint's start state is identical to the
   fill-all button the player already has, (b) the basic Latin eliminations
   ("there's already a 3 in this row, so strike 3 here") are taught honestly
   rather than silently baked into the fill, and (c) no new populate move is
   needed. Populate is emitted only when notes are incomplete; a fully-penciled
   board skips it.
2. **Eliminate journeys.** One technique *firing* = one journey (quality-bar rule
   2). A firing that strikes several (cell, candidate) pairs across a line is a
   single multi-cell step (§5.5) carrying one `pencilStrike` move. Narration
   leads with the indication (the spotted clue pattern), then the reasoning, then
   the necessity-voice conclusion (§2.1–2.2 of hint-authoring.md).
3. **Placements.** When a cell's sound candidates collapse to one, a `set`
   (real entry) step places it, narrating "every other height is ruled out here".

### Resume-safety (the §7.1 invariant)

Each step is **monotone**: a populate adds the missing notes, an eliminate
removes notes the rules forbid, a place fills a cell — none is ever undone by the
hint. On recompute (after the player's own move drops the plan), the sound script
is rebuilt from the grid and diffed against the live notes+grid: skip any
operation whose effect is already on the board (candidate already absent / cell
already filled), resume at the first that isn't. Progress is guaranteed and the
script terminates at the solution (a generated board is solver-solvable from any
correct partial state). The shared `hint-resume.test.ts` walks a *blank* board
(no notes) so it sees only placements after an initial populate — still monotone,
still converges. `towersGame` is added to its list as part of this change.

## New move: `pencilStrike`

Existing moves can't express "one firing strikes candidate `n` from these `k`
cells atomically": `set { pencil:true }` toggles **one** bit at **one** cell.
Emitting `k` toggle moves would split one firing into `k` steps (violating rule
2) and toggling is not idempotent (a resume that re-applies would *re-add* the
candidate). So add:

```
{ type: "pencilStrike"; marks: { x: number; y: number; n: number }[] }
```

`executeMove` **clears** each `1<<n` bit (idempotent — clearing an absent
candidate is a no-op), making it resume-safe. Populate stays on `pencilAll`;
placement stays on `set`.

## findMistakes: notes as markings

`findMistakes` already re-solves to the unique solution. It additionally flags
every empty cell whose **non-empty** note set excludes the solution height. A
note set that merely holds extra non-solution candidates is *not* flagged (normal
mid-solve). `TowersMistake` becomes `{ kind: "cell" | "note"; x; y }`; both kinds
render as the existing red inset overlay (no new render path). Check-&-Save and
the refusal→mistake coupling inherit this through the existing `findMistakes`
gate.

The cross-game convention (a candidate annotation that excludes the truth is a
mistake) is lifted into the `ts-engine` `findMistakes` requirement so future
pencil games (Solo/Keen/Unequal/Undead) follow Towers.

## Element-type colour legend (§5.3)

A Towers elimination hint names two element kinds: the **driving clue + its line
of sight** (premise) and the **target cell(s)/candidate(s)** (conclusion). The
premise is *undecided* cells, so it **shades** (`COL_HINT_CELL`); the clue is
identified by its drawn digit on the shaded line. The target is `COL_HINT`. For
a strike, the ruled-out candidate digit(s) are shown struck in `COL_HINT` so the
player sees *which* note goes and *why*. Equivalent strikes of one firing share
`COL_HINT` (rule 3). Colour is never the sole cue (the strike mark + position
carry it too).

## Tuning latitude (settle during implementation + owner acceptance)

The dev guides are a live wiki; these are expected to iterate against the real
board:

- **Populate granularity.** Default: full `1..w` via `pencilAll` (above). If the
  Latin-elimination journeys prove tedious in acceptance, fall back to a sound
  Latin-reduced populate (a new move) — recorded here so the trade-off isn't
  re-litigated.
- **Journey count / pacing.** Towers can produce many small firings; group
  aggressively (one firing = one journey) and lean on `AUTO_HINT_STEP_MS` pacing.
- **Half-finished-note strictness.** A note `{2,3}` whose cell solves to `5` is
  flagged by Check-&-Save (it excludes the truth) even if the player simply
  hadn't finished pencilling. The owner asked for strict rejection of invalid
  notes; this is that strictness. Revisit only if acceptance finds it annoying.

## Alternatives rejected

- **Placement-only hints (pencil as render-only).** My first proposal. Rejected
  by the owner: it throws away the elimination teaching that is the soul of
  Towers, and wrongly assumed the recompute can only read the grid. Giving the
  hint visibility of the notes makes strike-as-move resume-safe.
- **Feeding the player's notes into the solver as constraints.** Unsound — a
  wrong note corrupts the deduction. The solver keeps its own grid-seeded cube.
- **Multi-leg `continuesPrevious` toggles for a multi-strike firing.** Rejected
  vs one `pencilStrike` multi-cell step: cleaner, idempotent, resume-safe, and it
  is the §5.5 pattern.
