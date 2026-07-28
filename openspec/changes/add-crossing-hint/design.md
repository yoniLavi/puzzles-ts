# Design — add-crossing-hint

## Context

Crossing is a crossword-shaped number-placement puzzle: a wall grid carves out
**runs** (maximal horizontal/vertical spans of ≥2 open cells), a list of **numbers**
is given, and each number goes in exactly one run of matching length. The player
types digits, keeps **pencil notes** (`state.marks`, a 9-bit mask per cell), and can
click a listed number to place it whole.

Its solver (`crossing/solver.ts`, ~180 lines) has exactly two techniques run to a
fixpoint, no grading and no guessing:

- **`solverMarks`** — for each run, take every not-yet-placed number of the run's
  length that still fits the current candidates; union each of its digits into a
  per-position accumulator; intersect each open cell's candidates with that
  accumulator.
- **`solverConfirm`** — a cell whose candidates collapse to one digit is placed.

`validateBoard` returns a `done[]` array (which listed numbers are already placed),
which is what makes "still-fitting" well defined. The generator accepts a board only
when this solver reaches `"valid"`, so the solver's exact strength is baked into
which puzzles exist — **it must not move**.

## Decisions

### D1 — The hint re-derives the *named* technique; it does not narrate candidate deaths

`solverMarks` is a set intersection. Ask it "why did digit 7 die in this cell?" and
the honest answer is "no still-fitting number of this run puts a 7 there" — which is
already a decent sentence, but it buries the far better one. The two names worth
teaching, in goal-first order (§2.10):

| Technique | Fires when | Narration shape | Move |
| --- | --- | --- | --- |
| `onlyNumberFits` | exactly one unplaced number of the run's length still fits it | "Only one number left is 3 long and fits what's already here, so this run must be 471." | `place` (whole run) |
| `sharedDigit` | every still-fitting number of the run has digit `d` at position `k`, and that cell is open with >1 candidate | "Every number that still fits this run has a 4 here, so this cell must be 4." | `set` (one digit) |
| `noteStrike` | a digit is a candidate in the player's notes that no still-fitting number puts at that position | "No number that still fits this run puts a 7 here, so rule it out." | `pencil` (strike) |

`onlyNumberFits` is **not a new deduction** — the existing two techniques already
produce its result (the union collapses to one number's digits, then naked singles
place every cell). It is the same firing, *named*. This is the Pattern lesson
(hint-authoring §5.6a) applied: when the solver returns a forced set with no reason
attached, re-derive the technique that a human would state.

**Goal-first ordering**: `onlyNumberFits` (fills a whole run) before `sharedDigit`
(fills one cell) before `noteStrike` (rules out). A plan that dribbles out note
strikes before the run they determine reads as busywork even when every step is
correct.

### D2 — Evidence includes the **number panel**, not only the grid

Both techniques reason over *which listed numbers still fit*. That set is the
premise, and it lives in the clue list, not on the board. So the highlight must
cover both surfaces: the run's cells as the area, **and the still-fitting numbers in
the panel**. Crossing already lays the panel out (`layoutNumbers`) and already
highlights numbers for its input aid, so the render seam exists.

This is the §5.2 "show the evidence as an area" rule applied to a game whose
evidence is off-board. A hint that shaded only the run would be telling the player
*that* there is a reason while hiding the half of it that does the work.

**Watch the interaction with the existing aid.** The aid ghosts numbers into runs on
click; the hint shades numbers as evidence. Two different meanings on one surface.
Either set `uiUpdateClearsHint` (Subsets' precedent — touching the aid puts the hint
away rather than having it silently fight the aid), or give them visibly different
treatments. Decide by looking at a real frame, not from here.

### D3 — Three move shapes, three marks

Crossing's `Move` union carries `place` (a whole number into a run), `set` (one
digit), and `pencil` (toggle one note). Per §5.1a the hint must echo each in its own
mark, in `COL_HINT`:

- a whole-run placement highlights the **run**, and the number in the panel;
- a digit placement highlights the **cell**;
- a note strike marks the **candidate glyph** inside the cell, not the whole cell —
  striking one note is not the same action as filling the cell, and one colour over
  both would read as one action.

Evidence cells are *filled or noted*, so per §5.4 decide the shade-vs-ring per cell
from its own state rather than picking one globally.

### D4 — Refusals reuse what already exists

`findCrossingMistakes` is already a re-solve that flags a wrong digit **and** a note
set that excludes the solution's digit. So the standard three refusals
(hint-authoring §4) need no new machinery: solved board; mistaken board (surface the
overlay); deduction exhausted (reachable only from a hand-written game id, since
every generated board is solver-gated).

### D5 — `refreshHintStep` is wanted even though Crossing has no auto-pencil

§7.3 says every candidate-elimination game *with note-clearing side effects* needs
one. Crossing has none — `executeMove` on a `set` touches only that cell. But the
shared `refreshCandidateHintStep` also covers the case the player strikes a note the
plan was about to strike, or fills a cell the plan was about to fill, which Crossing
can reach easily. It is ~5 lines through the shared helper once D7 lands; take it.

### D6 — Extraction: `DeductionRecord` does not belong in `latin.ts`

```ts
export interface DeductionRecord {
  kind: "place" | "elim";
  x: number; y: number; n: number;
  reason: unknown; group: number;
}
```

Nothing about that is Latin. Yet it lives in `latin.ts`, and the *shared* framework
`candidate-hint.ts` imports it from there — so the shared module depends on a
specific game family's solver module. Crossing is the first non-Latin
candidate-elimination game and would have to import `latin.ts` purely to speak the
record shape.

**Move `DeductionRecord` / `DeductionRecorder` into `candidate-hint.ts`** (or a small
`engine/deduction-record.ts` if that reads better once written) and re-export from
`latin.ts` so the Latin games' imports are untouched. Type-only move, no behaviour.

### D7 — Extraction: the candidate helpers must stop hard-coding a `type` discriminator

`refreshCandidateHintStep` and `keepCandidateHintTrack` are typed
`M extends { type: string }` and construct strike moves internally. **Crossing
discriminates its moves on `kind`, not `type`** — and renaming is not a free
refactor: the clean TS save format replays the **move log**, so a discriminator
rename breaks every existing Crossing save. That cost is real and user-visible, and
it is the wrong reason to reshape a game.

Options considered:

- **(a) Rename Crossing's discriminator.** Rejected — breaks saved move logs for a
  cosmetic alignment.
- **(b) Generalise the helpers** with a tiny per-game adapter (`isStrike(move)`,
  `strikeMarks(move)`, `makeStrike(marks)`, `isPlacement(move)`, `placedCell(move)`).
  The helper keeps all the logic; the game supplies four one-liners.
- **(c) Crossing hand-rolls its own.** Rejected — that is exactly what **Group**
  already does, and Group's `pencilStrike` branch is byte-identical to the shared
  helper's. A second hand-rolled copy is how a shared helper dies.

**Take (b).** It is the change that makes the framework actually general rather than
Latin-family-shaped, and it has three beneficiaries beyond Crossing:

- **Group** — delegates its hand-rolled `refreshHintStep` (its `set` move carries
  `cells[]` rather than `x`/`y`, which the adapter absorbs);
- **Undead** — its marks are `{cell, monster}` over an index-addressed board rather
  than `{x, y, n}`; worth *evaluating*, and worth **declining and recording** if the
  adapter starts contorting to fit it (an exemplar hint never loses a word to an
  abstraction).

**Guardrail, the one that has now worked five times** (`add-boats-hint` D7): every
refactor is behaviour-preserving, proved by that game's existing hint tests passing
**unedited**. A test that has to change means the extraction changed behaviour — stop
and re-evaluate rather than updating the test. A partial extraction is a fine
outcome; a silently retuned Towers hint is not.

### D8 — The plan loop is the shared one

`engine/hint-plan.ts` (extracted by `add-boats-hint`). Crossing supplies `status`,
`next`, `apply` and a `stepBudget`; no sixth copy of the loop.

## Risks

- **The panel is half the highlight, and it is the part most likely to be skimped.**
  If the evidence ends up grid-only, the narration ("every number that still fits")
  points at something the player cannot see. Guard it: assert the hint's evidence
  names at least one listed number, and check a real frame.
- **`solveCrossing` must not move.** The C is gone; a frozen differential is the only
  guard left. Keep the recording pass in its own module (the `add-boats-hint`
  precedent) and re-run the differential after every solver-adjacent edit.
- **Two extractions touching four-plus shipped hints.** D7's guardrail is the
  mitigation. Land the extraction and Crossing's adoption first; Group's delegation
  and any Undead evaluation are follow-ons that can be dropped without stranding
  this change.
- **`onlyNumberFits` may be rarer than it looks.** If positional narrowing usually
  bites first, the strongest narration would seldom appear. Measure it with a
  technique-coverage sweep over generated boards **before** polishing prose — the
  `add-boats-hint` sweep found one technique that never fired at all, which is worth
  knowing early, not late.

## Open questions for the implementing session

1. **Does the hint's panel highlight fight the existing click-a-clue aid** (D2)?
   Needs a real frame; the fallback is `uiUpdateClearsHint`, as Subsets does.
2. **Does Undead fit the D7 adapter** without contortion? Evaluate; record the no-go
   with its reason if not.
