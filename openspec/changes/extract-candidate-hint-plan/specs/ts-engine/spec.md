# ts-engine Specification (delta)

## ADDED Requirements

### Requirement: A shared candidate-elimination hint-plan abstraction

The engine SHALL provide a shared module (`src/native/engine/candidate-hint.ts`) that
implements the candidate-elimination hint *plan* — the control flow common to every
pencil-notes game whose hint sets and strikes candidate notes and places a value when a
cell's notes collapse to one (Towers, Unequal, Keen, Solo, and any future such game).
The shared module SHALL own the parts that are identical across those games, while the
game retains the parts that carry game-specific *meaning*.

The shared module SHALL provide:

1. **Pure plan helpers** over a working `(grid, pencil)` and a recorded
   `HintOp[]` deduction script: finding a naked single, detecting whether any empty
   cell lacks notes (needs populate), the first recorded placement not yet reflected on
   the working grid, the next still-live strike *firing* (one `group`), and the next
   forced placement.
2. **Generic `hintKeepTrack` and `refreshHintStep`** over the shared pencil-move shape
   (`set` / `pencilAll` / `pencilStrike`), implementing the cross-game verdicts (a
   populate match, a placement match, a strike whose marks shrink in place or complete)
   and the no-stale-step guarantee (drop dead marks, resolve a filled placement, resolve
   a fully-noted populate).
3. **A plan driver** running the standard walk — naked single → lazy populate →
   basic-region cull → next deductive elimination → forced placement — and emitting one
   deduction *firing* as one (possibly multi-leg) journey.

The driver SHALL take the genuinely game-specific pieces as configuration, not bake them
in: the recording solver, the narration, the evidence-area and placement-area cells, the
strike-split policy (split a firing by cell, by struck digit, or as one multi-cell step,
as the game's premise dictates), and the basic-region cull (which regions a placed value
is culled from). Narration and the per-game reason union SHALL remain in the game — the
driver owns control flow, the game owns meaning.

The placement-classifier in `src/native/engine/latin-hint.ts` (which re-derives whether a
recorded generic `single` placement is a naked single, a hidden single, or a forced
single — see the "Latin-family hints distinguish naked, hidden and forced singles"
requirement) SHALL generalise to an arbitrary **region list**, so a game reasoning over
sub-blocks and diagonals (Solo) classifies a hidden single in any of its regions, while
the row/column games pass only `[row, column]` and are unchanged.

Routing a game's hint through the shared module SHALL be behaviour-preserving: the
game's existing hint requirement and its observable narration, journeys, keep-track
verdicts, resume guarantee and rendered frames are unchanged. The bespoke and shared
solvers and the generator/solve paths are untouched — the shared abstraction is
hint-plan plumbing only, consuming the already-shared `DeductionRecord`/`HintOp` shape.

#### Scenario: A migrated game's hint is unchanged

- **WHEN** a candidate-elimination game (Towers, Unequal, Keen or Solo) is routed
  through the shared hint-plan module
- **THEN** its hint plan — the populate/strike/place steps, their narration, the
  one-firing-one-journey grouping, the `hintKeepTrack` verdicts and the rendered
  highlight frame — is identical to before the migration
- **AND** the game's per-game hint suite, the shared `hint-resume.test.ts`, and the
  render snapshots pass with no change

#### Scenario: A hidden single is classified in a non-row/column region

- **WHEN** a game reasoning over sub-blocks or diagonals (Solo) forces a placement that
  is a hidden single within a sub-block or diagonal
- **THEN** the shared classifier identifies the region and the narration names it
  (e.g. "in this block / diagonal, N can go in only this cell"), the same way the
  row/column games name a row or column
