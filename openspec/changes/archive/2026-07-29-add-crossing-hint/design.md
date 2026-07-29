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

## What implementation changed

### The ladder is **derivation-depth-first**, then goal-first within a depth (refines D1)

D1's table is right about the techniques and about goal-first ordering, but it is
silent on the thing that decided the shape: **"still fits" has two readings, and they
are not equally teachable.**

- The *shallow* reading — a listed number of the run's length, not already written in
  elsewhere, agreeing with the digits entered in the run — is exactly
  `numberAvailableTo`, i.e. the scan the player does by eye down the clue list, and
  the one the panel's fit-highlight **already colours**.
- The *deep* reading is the fixpoint of `solverMarks`' narrowing, where a number can
  die because a crossing run rules a digit out of one of its squares, three
  implications away. That is what makes the solver as strong as it is.

Narrating the deep reading as though it were the shallow one is a §2.4 bug: the player
checks "only one number still fits" against the list and finds two. So the pass computes
**both** and runs the three placement techniques over the shallow tables first, falling
through to the deep tables only when nothing checkable is left — and a deep firing says
so in its own words ("once the crossing numbers rule the others out…", the §5.6
honest-non-local tier). Both readings are sound: each over-estimates which numbers fit,
so a set either narrows to one is narrowed to the truth.

This also added a third technique D1 did not have. Once the lattice exists,
**`crossRuns`** — *"Down, this square can only be 2 or 6 — and the across number
through it cannot take 2 here, so it must be 6."* — falls out, and it is the signature
deduction of a number crossword rather than an implementation detail.

### Measured technique coverage (task 3.5), and what it says about the rule-out rung

48 generated boards across all eight presets, walked to solved one recomputed firing at
a time: **1597 firings, 0 stalls**.

| technique | share |
| --- | --- |
| `onlyNumber` (shallow) | 86.6% |
| `sharedDigit` (shallow) | 7.3% |
| `crossRuns` (shallow) | 5.8% |
| `onlyNumber` (deep) | 0.4% |
| everything else | 0 |

Two readings of that. The deep tier is **rare but load-bearing** — six firings, each of
which was the only thing available, so dropping it would strand those boards. And
`noteStrike` fires **never** on a generated board, which the risks section half
predicted for `onlyNumberFits` and which is worth stating plainly rather than hiding:
goal-first ordering puts rule-outs behind every placement, and on a solver-gated board a
placement is always available until the board is solved. It is kept, not dropped,
because it is the only honest advice on a position where deduction *is* exhausted (a
hand-authored, non-uniquely-solvable id reaches it, and that is how it is tested), and
because the spec requires the rule-out action to exist and be marked on the candidate
rather than on the square. Ordering it ahead of placements was considered and rejected:
a rule-out advances nothing, and leading with one is the §2.10 busywork smell.

### One technique, three premises (a §2.4 finding)

`onlyNumber` fires for three unrelated reasons, and the first cut narrated all of them
as "only one N-digit number left matches what is already in this run" — which on a
**fresh board** cites digits that do not exist. The firing now carries `because`
(`"length"` / `"used"` / `"digits"`), set where the elimination is computed, with one
sentence each. The opener became *"This run is 6 squares long, and only one number in
the list is 6 digits — so it must be 197665."* Written up in
[`hint-authoring.md`](../../../docs/porting/hint-authoring.md) §2.4.

### The hint colour is **green**, not the collection's blue (revises D2's rendering)

Crossing has already spent blue: `COL_ACROSS` is the pale wash meaning "horizontal
run", matched in OKLCH against amber for "vertical", and the hue *is* the information.
The collection's `COL_HINT` measures L 0.82 C 0.07 h 250 against that wash's L 0.83
C 0.06 h 245 — indistinguishable. So the hint takes green (h 145), **and a displayed
hint suppresses the run wash entirely**, so only one meaning of "washed square" is ever
on screen; dismissing the hint brings the wash back.

## Open questions for the implementing session — resolved

1. **Does the hint's panel highlight fight the existing click-a-clue aid** (D2)?
   **In the clue list, no** — the two use different channels: the aid owns the clue's
   *ink* (which run it could go in), the hint draws its patch *behind* that text.
   Verified on a real frame — selecting a cell colours the list blue/amber, and
   pressing Hint keeps that ink while adding the green patch.

   **On the board, yes, and `uiUpdateClearsHint` is the answer after all** (owner-
   reported after the first cut shipped). The hint suppresses the selection's run
   wash, so with a hint displayed a click did nothing visible at all — no wash, no
   change, no way out of hint mode. That is precisely the bug Subsets' flag was added
   for ("a displayed hint suppressed the aid, so aid clicks did nothing visible"), so
   Crossing takes it too: every board and clue-list interaction that isn't a move goes
   through `UI_UPDATE`, so **clicking anywhere carries on by hand and gives the board
   back**. Nothing is lost — the deduction is deterministic and cheap, so pressing
   Hint again re-shows the same step.

   **The rule is per step, not blanket** (owner-directed after the first cut shipped
   the blanket form): a hint is put away by any UI change *except* one that moves the
   selection into the squares the hint is about, so a hinted number can be clicked
   into and typed by hand without the explanation vanishing mid-way. Everything a
   firing is about is already in `highlights.area`/`targets`, so the predicate is "am
   I inside the highlight?" and stores nothing new.

   That exception has a corollary that has to ship with it: **the hint owns the
   background on those squares, so the ordinary mouse-selection cue — a highlighted
   background — is invisible exactly where the player is about to type.** Crossing
   falls back to the keyboard cursor's corner marks for a mouse selection on any
   hinted square, drawn dark rather than in the near-white `COL_HIGHLIGHT` the hint
   green would swallow (same switch for the pencil-mode triangle). Guarded by a test
   that asserts the corner cue is drawn on a hinted square **and not** on a plain
   selection — asserting only its presence would pass on the cell outline every
   square already draws.

   `Game.uiUpdateClearsHint` was therefore widened from `boolean` to a **method**
   `(step, state, ui) => boolean`, called only while a plan is stored and with the ui
   *after* `interpretMove` has moved the cursor. Subsets keeps the blanket behaviour
   as `() => true` (its hint marks nothing the player must select to act on). It is a
   method rather than a function property because `Game` is stored type-erased in the
   registry, where a function property's contravariant parameters do not survive the
   erasure — the same reason every other hook here uses method syntax.

2. **Does Undead fit the D7 adapter** without contortion? **No — declined, recorded.**
   It breaks three assumptions at once: `MON_NONE = 7` (not `0`) is its empty sentinel,
   its marks are `{cell, monster}` over a 1-D border-ringed board with the monster
   *bit* as the value, and its highlight shrink re-projects cell → x/y through
   `monsterCellXY`. Fitting it would need a third adapter method that rebuilds the
   highlights, at which point the game supplies the logic and the "helper keeps all the
   logic" property is gone. **Group** did migrate (its hand-rolled ~78-line copy is
   deleted), which is the beneficiary D7 predicted.
