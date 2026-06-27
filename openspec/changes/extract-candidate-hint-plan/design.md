# Design: Extract the shared candidate-elimination hint plan

A behaviour-preserving consolidation of the hint-*plan* layer (not the solver
layer) shared by Towers, Unequal, Keen and Solo. Read `docs/porting/hint-authoring.md`
§9 first — this change hoists the patterns that section already documents per-game
into one module, so the guide's exemplars become the shared implementation.

## Decisions

### D1 — Consolidate the plan, never the solver

The duplication worth removing is the hint *plan* plumbing in each game's `index.ts`.
The solvers stay separate on purpose: Towers/Unequal/Keen ride `latin.ts`; Solo and
Undead are bespoke for byte-match fidelity. The already-correct shared seam at the
solver boundary is the `DeductionRecord`/`HintOp` shape — every game produces that
from its own techniques, and this change consumes it uniformly. Do **not** touch how
deductions are produced.

### D2 — Two tiers, lowest-risk first

Land the extraction in two tiers so the high-confidence part is de-risked before the
driver:

1. **Pure helpers + keep-track/refresh (clear win, near-zero risk).** `nakedSingle`,
   `anyEmptyLacksNotes`, `firstUnreflectedPlaceIndex`, `nextStrike`, `nextPlace`,
   `joinNums`, and generic `hintKeepTrack` / `refreshHintStep`. These are pure over
   `(grid, pencil, ops)` / the move shape and are byte-identical across the four games.
2. **The `buildCandidatePlan` driver.** The 5-step walk + lazy populate + journey
   emission, with the per-game pieces injected. Higher value, slightly more design care.

Each tier is independently green against the existing suites.

### D3 — The injection surface (what stays per-game)

`buildCandidatePlan(state, config)` injects exactly the genuinely-variant pieces:

- `recordDeductions(workingGrid): HintOp[]` — the game's recording solver, capped
  below recursion;
- `placementReason(grid, pencil, x, y, n): Reason` — re-derive a generic `single`
  placement's *why* (via the generalised classifier, D4); a game's own clue/cage-driven
  placements keep their recorded reason;
- `narrate(reason, ns): string`, `reasonArea(reason)`, `placementArea(reason)` —
  inherently game-specific (the reason union and prose differ per game);
- `strikeSplit(reason): "byCell" | "byDigit" | "single"` — Towers splits a firing by
  *height* (its premise names one height), Keen and Solo's cages split by *cell* (the
  premise names the cage), Solo's `intersect` is one multi-cell step (one digit);
- `basicRegionStrike(grid, pencil)` — row/col (Keen/Towers/Unequal) vs
  row/col/block/diagonal (Solo).

Narration and reason unions deliberately stay in each game — forcing them into a
generic shape would be the over-abstraction this change must avoid. The test is: the
driver owns *control flow*, the game owns *meaning*.

### D4 — Generalise the placement classifier to arbitrary regions

`latin-hint.ts`'s `classifyPlacement` checks only row/column. Solo already needed
block + the two diagonals (`soloPlacementReason`). Grow the shared classifier to take a
**region list** (each region a set of cells + a name/kind), returning naked / hidden(in
which region) / forced. Solo's bespoke version becomes a config (`[row, col, block,
diag0, diag1]`); the row/column games pass `[row, col]` and are unchanged. This keeps
the §9.3a "re-derive the why, never trust the recorded `single`" rule in one place.

### D5 — A shared `PencilMove` shape, games keep their own move unions

The three relevant move variants (`set { x,y,n,pencil,autoElim? }`, `pencilAll`,
`pencilStrike { marks }`) are structurally identical in all four games. Rather than
force a single shared `Move` type (the games' unions also carry `solve` and differ in
incidental fields), define a structural `PencilMove` the generic `hintKeepTrack` /
`refreshHintStep` operate over, and let each game's move union remain its own — the
generic functions are parameterised by the structural subset they read.

## Migration & verification

- Migrate one game at a time (Keen first — it is the cleanest latin exemplar and its
  hint test is the richest), re-running that game's hint suite + `hint-resume.test.ts`
  after each. A migration is correct when the suites pass with **no snapshot change**
  (a snapshot diff means an unintended behaviour change — investigate, don't
  `-u` past it).
- Undead is evaluated last: its candidate model is a monster bitmask, so confirm the
  pure helpers (which read `pencil[i] & (1<<n)`) fit its bit layout before migrating;
  if the fit is awkward, leave Undead on its own copy and record the reason in the dev
  guide (a documented non-migration is a fine outcome).

## Alternatives rejected

- **One mega `Game`-level hint mixin.** Rejected — the narration/reason variance is
  real; a driver-with-callbacks keeps meaning in the game and control flow shared,
  without a leaky base class.
- **Refactor the solvers too (one generic candidate solver).** Rejected (D1) — it
  trades byte-match fidelity for nothing; the solver seam is already shared at the
  record shape.
- **Do nothing / keep four copies.** Rejected — the team is already paying the tax in
  coordinated multi-game fixes; four exemplars is the right point to consolidate.
- **Abstract from two games earlier.** Was correctly *not* done — abstracting from two
  examples risks the wrong shape; waiting for four (now present) is the deliberate call.
