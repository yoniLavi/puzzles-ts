# Tasks: Add an explained deduction hint to Solo

> Solo is the first Latin-family hint whose solver is **bespoke** (not
> `engine/latin.ts`), so §1 is real net-new recording work, not a thread-through.
> Read `docs/porting/hint-authoring.md` §9 and the archived `add-keen-hint` first.

## 1. Recording solver (`solo/solver.ts`)
- [x] 1.1 `SoloReason` union covering every recorded technique: `single`,
  `hiddenSingle`/`forcedSingle` (named by region: row/column/block/diagonal),
  `dup`, `intersect` (two regions: `confined`/`target`), `set` (region, optional
  for the X-wing single-digit set), `forcing`, and the killer reasons
  `cageSingle`/`cageMinMax`/`cageSums`/`cageIntersect` (cage cells + sum clue).
  `HintOp extends DeductionRecord` with `{ kind: "place" | "elim", x, y, n, group,
  reason }`.
- [x] 1.2 Add an opt-in, nullable `recorder` to `SolverUsage` (promoted from
  `pendingRecorder` *after* the given clues are placed); write a record at each
  `place`/`intersect`/`set`/`forcing` site and at each killer-deduction site,
  gated on the recorder. **Return per firing on the recording path** — the
  positional/numeric/intersect/set passes already `continue mainloop` after one
  firing; the killer min/max and sums loops break after the first cage when
  recording; `group` bumped once per mainloop iteration. Place records only the
  placement op (row/col/block/diag dup strikes recomputed in the plan, matching
  Keen). Recorder-off path byte-for-byte unchanged — C differential re-run green.
- [x] 1.3 `recordSoloDeductions(state, maxdiff, maxkdiff)` returns the ordered op
  script (capped below `DIFF_RECURSIVE`).

## 2. Hint plan (`solo/index.ts`)
- [x] 2.1 `narrate(reason, ns)`: quality-bar prose (indication → reasoning →
  necessity conclusion); strike-vs-place voice; the firing region named (row /
  column / block / diagonal), and the killer cage named by a goal phrase ("this
  killer cage must total V").
- [x] 2.2 `buildSteps(state, autoClean)`: naked single → lazy `pencilAll` populate
  → basic-region dup strikes (`basicRegionStrike`, placed/given values across
  row/column/block + X diagonals) → next deductive elimination → forced placement;
  one firing = one (possibly multi-leg) journey; `emitPlacement` folds or teaches
  the trivial dups by `autoClean`.
- [x] 2.2a `soloPlacementReason`/`placementArea`: re-derive a placement's *why*
  from the working board (naked single vs hidden single in a row/column/block/
  diagonal), since the recorded `place` reason conflates them; shade the forcing
  region as evidence for a hidden single. Killer placements (`cageSingle`/
  `cageIntersect`) keep their recorded reason (the working board can't re-derive).
- [x] 2.3 `hint(state, aux?, ui?)`: refuse on solved / on `findMistakes`; cap at
  `DIFF_EXTREME` + `state.params.kdiff` (deductive only); read auto-pencil off `ui`.
- [x] 2.4 `hintKeepTrack`: populate match; placement match; `pencilStrike` subset
  → `onTrack` (shrink in place) / `completed`; else `off` (pre-move state).
- [x] 2.5 `refreshHintStep`: drop dead `pencilStrike` marks (resolve when none
  live); a placement step resolved once its cell is filled; populate resolved once
  every empty cell has notes.

## 3. Rendering (`solo/render.ts`)
- [x] 3.1 Append `COL_HINT` / `COL_HINT_CELL` past the fork pencil-body (index 9);
  per-cell `hintPacked`/`drawnHint` `Int32Array` sidecar folded into the diff key
  (the third sidecar alongside `pencil`/`drawnWrong`).
- [x] 3.2 `drawNumber`: evidence region → `COL_HINT_CELL` bg; placement target
  (no strike) → `COL_HINT` bg; struck candidate → cross-through in the pencil grid
  (normal `COL_PENCIL` on a non-`COL_HINT` background so the digit stays legible).
- [x] 3.3 `redraw` consumes the displayed `HintStep` (pack target/area/marks).
- [x] 3.4 `SoloHint` highlight payload type (`area`/`targets`/`marks`).

## 4. Wiring (`solo/index.ts`)
- [x] 4.1 Register `hint`/`hintKeepTrack`/`refreshHintStep` on `soloGame`.

## 5. Tests
- [x] 5.1 Tier-1 (`solo-hint.test.ts`): a recorded reason per technique (intersect,
  set, killer cage); replayed placements complete a generated board; `narrate`
  necessity-voice guard; naked single surfaced first; populate before first
  elimination; basic-region dups taught (auto-pencil off) / folded (on); hidden
  single by region (never falsely naked); X-diagonal deduction narrated; refusal on
  solved / mistakes; `hintKeepTrack` verdicts.
- [x] 5.2 `soloGame` added to `engine/hint-resume.test.ts` (resume to solved, fresh
  recompute each step; the trivial first preset). Variant resume (standard, X,
  jigsaw, killer) verified during development.
- [x] 5.3 Tier-2.5: a `renderScenario` elimination journey frame (struck candidate
  `COL_PENCIL` strikethrough, evidence `COL_HINT_CELL`, grid/clues still drawn) +
  `toMatchSnapshot`.

## 6. Close-out
- [x] 6.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` (1810) →
  `vite build`); the byte-match C differential still green (recorder-off path
  unchanged); `docs/porting/hint-authoring.md` §9 updated with the bespoke-solver
  recording note (the first non-`latin.ts` Latin-family hint).
- [x] 6.2 Owner acceptance (stage 2): owner played the hint and confirmed it works
  ("it works in my testing", 2026-06-27); committed + archived.
