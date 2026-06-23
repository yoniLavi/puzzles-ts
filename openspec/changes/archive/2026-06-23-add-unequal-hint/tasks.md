# Tasks: Add an explained deduction hint to Unequal

## 1. Recording solver (`unequal/solver.ts`)
- [x] 1.1 `UnequalReason` union: `greater`/`lesser` (an inequality bound, carrying
  the bounding cell + its min/max value), `adjacent` (a filled neighbour + bar
  state), `adjacentSet` (the constraining neighbour + bar state). `HintReason =
  UnequalReason | LatinReason`; `HintOp extends DeductionRecord`.
- [x] 1.2 Record each elimination in `solverLinks` / `solverAdjacent` /
  `solverAdjacentSet` (gated on `solver.recorder`), and **return per firing on the
  recording path** (one link / one cell+direction = one `group`) so a step never
  mixes clues. Recorder-off path byte-for-byte unchanged.
- [x] 1.3 `recordUnequalDeductions(o, mode, flags, grid, maxdiff)` returns the
  ordered op script.

## 2. Hint plan (`unequal/index.ts`)
- [x] 2.1 `narrate(reason, n, continues)`: two-mode, quality-bar prose
  (indication → reasoning → necessity conclusion); strike-vs-place voice (§2.6);
  the differ-by-1 phrasing holds at the value extremes (§2.7).
- [x] 2.2 `buildSteps(state, autoClean)`: naked single → lazy `pencilAll` populate
  → basic Latin row/column dup strikes (givens/placed) → clue elimination → forced
  placement; one firing = one (possibly multi-leg) journey; `emitPlacement` folds
  or teaches the trivial dups by `autoClean`.
- [x] 2.3 `hint(state, aux?, ui?)`: refuse on solved / on `findMistakes`; cap at
  `DIFF_EXTREME` (deductive only); read auto-pencil off `ui`.
- [x] 2.4 `hintKeepTrack`: populate match; placement match; `pencilStrike` subset
  → `onTrack` (shrink in place) / `completed`; else `off` (pre-move state).
- [x] 2.5 `refreshHintStep`: drop dead `pencilStrike` marks (resolve when none
  live); a placement step resolved once its cell is filled; populate resolved once
  every empty cell has notes.

## 3. Rendering (`unequal/render.ts`)
- [x] 3.1 Append `COL_HINT` / `COL_HINT_CELL`; per-cell `hintPacked`/`drawnHint`
  `Int32Array` sidecar folded into the diff key.
- [x] 3.2 `drawCell`: evidence → `COL_HINT_CELL` bg; placement target (no strike)
  → `COL_HINT` bg; struck candidate → cross-through in the pencil grid (normal
  `COL_PENCIL` on a non-`COL_HINT` background so the digit stays legible).
- [x] 3.3 `redraw` consumes the displayed `HintStep` (pack target/area/marks).
- [x] 3.4 `UnequalHint` highlight payload type (`area`/`targets`/`marks`).

## 4. Wiring (`unequal/index.ts`)
- [x] 4.1 Register `hint`/`hintKeepTrack`/`refreshHintStep` on `unequalGame`.

## 5. Tests
- [x] 5.1 Tier-1: recorded reason per technique in **both** modes; replayed
  placements complete a generated board; `narrate` necessity-voice guard; naked
  single surfaced first; populate before first elimination; clue-strike marks lie
  on the narrated clue's evidence cells; auto-pencil on folds / off teaches the
  dups; refusal on solved / mistakes; `hintKeepTrack` verdicts.
- [x] 5.2 `unequalGame` added to `engine/hint-resume.test.ts` (resume to solved,
  fresh recompute each step) — covers both an Unequal-mode and an Adjacent-mode
  seed.
- [x] 5.3 Tier-2.5: a `renderScenario` elimination-journey frame in each mode
  (struck candidate `COL_HINT`, evidence `COL_HINT_CELL`, clue glyphs still drawn)
  + `toMatchSnapshot`.

## 6. Close-out
- [x] 6.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
  `vite build`); update `docs/porting/hint-authoring.md` with anything this port
  surfaced (the basic-Latin opening for a givens-bearing Latin game).
- [x] 6.2 Owner acceptance (stage 2): owner plays the hint in both modes; on
  sign-off, commit + `openspec archive add-unequal-hint --yes`.
